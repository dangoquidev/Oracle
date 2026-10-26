import type { Competition } from '../../domain/competition/competition.js';
import { isSeasonOver } from '../../domain/competition/season.js';
import { accessOf, type Guild } from '../../domain/guild/guild.js';
import type { GuildSettings } from '../../domain/guild/guild-settings.js';
import { outcomeOf, type ResultOverride } from '../../domain/scoring/match-outcome.js';
import { completedRecapGroups, seasonRecapKey, type RecapGroup } from '../../domain/schedule/recap-plan.js';
import type { GuildId, MatchId } from '../../domain/shared/ids.js';
import type { CalendarRepository, SeasonSummary } from '../ports/calendar-repository.js';
import type { Clock } from '../ports/clock.js';
import type { DispatchLog } from '../ports/dispatch-log.js';
import type { GuildMessenger, RecapMatchLine } from '../ports/guild-messenger.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { Logger } from '../ports/logger.js';
import type { PredictionRepository } from '../ports/prediction-repository.js';
import type { PublicationRepository } from '../ports/publication-repository.js';
import type { ResultOverrideRepository } from '../ports/result-override-repository.js';
import type { StandingsReader } from '../read-models/standings.js';
import type { MatchView, WeekView } from '../read-models/views.js';

const DAY_MS = 86_400_000;
/** Announcements whose matches ended within this window can still be recapped. */
const RECENT_PUBLICATIONS_MS = 7 * DAY_MS;
/** A season recap is only posted soon after its last match. */
const SEASON_RECAP_WINDOW_MS = 7 * DAY_MS;
const RECAP_STANDINGS = 10;
const SEASON_PREVIEW = 5;

/**
 * Posts the results and points of each match day or week (as configured) once all its matches are
 * resolved, then the final standings when a season is over. Runs after scoring, so points are final.
 */
export class SendRecaps {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly publications: PublicationRepository,
    private readonly calendar: CalendarRepository,
    private readonly predictions: PredictionRepository,
    private readonly standings: StandingsReader,
    private readonly resultOverrides: ResultOverrideRepository,
    private readonly dispatchLog: DispatchLog,
    private readonly messenger: GuildMessenger,
    private readonly competitions: readonly Competition[],
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async executeForAll(): Promise<void> {
    for (const guild of await this.guilds.listActive()) {
      try {
        await this.recap(guild);
      } catch (error) {
        this.logger.error({ guildId: guild.id, err: error }, 'Recaps failed');
      }
    }
  }

  private async recap(guild: Guild): Promise<void> {
    if (!guild.settings || accessOf(guild) !== 'allowed') return;
    const seasons = await this.calendar.findSeasons(guild.settings.competitionIds);
    await this.recapRecentWeeks(guild.id, guild.settings, seasons);
    await this.recapEndedSeasons(guild.id, guild.settings, seasons);
  }

  private async recapRecentWeeks(
    guildId: GuildId,
    settings: GuildSettings,
    seasons: readonly SeasonSummary[],
  ): Promise<void> {
    const now = this.clock.now();
    const publications = await this.publications.findActive(
      guildId,
      new Date(now.getTime() - RECENT_PUBLICATIONS_MS),
    );
    const weeks = await this.calendar.findWeekViews(
      publications.flatMap((publication) => publication.weekIds),
    );
    if (weeks.length === 0) return;

    const overrides = await this.resultOverrides.findForMatches(guildId, matchIdsOf(weeks));
    const groups = completedRecapGroups(
      weeks.flatMap((week) =>
        week.matches.map((match) => ({ ...match, resolved: isResolved(match, overrides.get(match.id)) })),
      ),
      settings.recapFrequency,
      settings.timeZone,
      now,
    );
    const sent = await this.dispatchLog.findSent(
      guildId,
      groups.map((group) => group.key),
    );
    const weekById = new Map(weeks.map((week) => [week.week.id, week]));

    for (const group of groups.filter((candidate) => !sent.has(candidate.key))) {
      const week = weekById.get(group.weekId);
      if (week) await this.sendMatchRecap(guildId, settings, week, group, overrides, seasons);
      await this.dispatchLog.record(guildId, group.key, now);
    }
  }

  private async sendMatchRecap(
    guildId: GuildId,
    settings: GuildSettings,
    week: WeekView,
    group: RecapGroup,
    overrides: ReadonlyMap<MatchId, ResultOverride>,
    seasons: readonly SeasonSummary[],
  ): Promise<void> {
    const matches = week.matches.filter((match) => group.matchIds.includes(match.id));
    const lines = await this.matchLines(guildId, matches, overrides);
    // Nobody predicted these matches: nothing worth posting, but the recap is done.
    if (lines.every((line) => line.predictions === 0)) return;

    const standings = await this.standings.rank(guildId, { matchIds: group.matchIds });
    const season = seasons.find((candidate) => candidate.weekIds.includes(week.week.id));
    const seasonStandings = season ? await this.standings.rank(guildId, { seasonIds: [season.id] }) : [];
    await this.messenger.sendMatchRecap({
      guildId,
      channelId: settings.channelId,
      locale: settings.locale,
      kind: group.kind,
      competitionName: week.competitionName,
      weekName: week.week.name,
      startsAt: group.startsAt,
      timeZone: settings.timeZone,
      matches: lines,
      standings: standings.slice(0, RECAP_STANDINGS),
      season: season ? { name: season.name, standings: seasonStandings.slice(0, SEASON_PREVIEW) } : null,
    });
    this.logger.info({ guildId, key: group.key }, 'Recap sent');
  }

  private async matchLines(
    guildId: GuildId,
    matches: readonly MatchView[],
    overrides: ReadonlyMap<MatchId, ResultOverride>,
  ): Promise<RecapMatchLine[]> {
    const [predictions, banned] = await Promise.all([
      this.predictions.findByMatches(
        guildId,
        matches.map((match) => match.id),
      ),
      this.standings.bannedIds(guildId),
    ]);
    return matches.map((match) => {
      const judged = predictions.flatMap((prediction) =>
        prediction.matchId === match.id &&
        prediction.outcome.status === 'scored' &&
        !banned.has(prediction.userId)
          ? [prediction.outcome]
          : [],
      );
      return {
        match,
        outcome: outcomeOf(match, overrides.get(match.id) ?? null),
        predictions: judged.length,
        correctWinners: judged.filter((outcome) => outcome.correctWinner).length,
      };
    });
  }

  private async recapEndedSeasons(
    guildId: GuildId,
    settings: GuildSettings,
    seasons: readonly SeasonSummary[],
  ): Promise<void> {
    const now = this.clock.now();
    const recent = seasons.filter(
      (season) =>
        season.lastMatchAt.getTime() <= now.getTime() &&
        now.getTime() - season.lastMatchAt.getTime() <= SEASON_RECAP_WINDOW_MS,
    );
    if (recent.length === 0) return;
    const sent = await this.dispatchLog.findSent(
      guildId,
      recent.map((season) => seasonRecapKey(season.id)),
    );

    for (const season of recent.filter((candidate) => !sent.has(seasonRecapKey(candidate.id)))) {
      // Only seasons this server actually played.
      const published = await this.publications.findPublishedWeekIds(guildId, season.weekIds);
      if (published.size === 0) continue;
      const weeks = await this.calendar.findWeekViews(season.weekIds);
      const overrides = await this.resultOverrides.findForMatches(guildId, matchIdsOf(weeks));
      const resolved = weeks.every((week) =>
        week.matches.every((match) => isResolved(match, overrides.get(match.id))),
      );
      if (!isSeasonOver(season, resolved, now)) continue;

      const standings = await this.standings.rank(guildId, { seasonIds: [season.id] });
      if (standings.length > 0) {
        await this.messenger.sendSeasonRecap({
          guildId,
          channelId: settings.channelId,
          locale: settings.locale,
          competitionName: this.nameOf(season.competitionId),
          seasonName: season.name,
          standings: standings.slice(0, RECAP_STANDINGS),
          players: standings.length,
        });
        this.logger.info({ guildId, seasonId: season.id }, 'Season recap sent');
      }
      await this.dispatchLog.record(guildId, seasonRecapKey(season.id), now);
    }
  }

  private nameOf(competitionId: string): string {
    return this.competitions.find((competition) => competition.id === competitionId)?.name ?? competitionId;
  }
}

function matchIdsOf(weeks: readonly WeekView[]): MatchId[] {
  return weeks.flatMap((week) => week.matches.map((match) => match.id));
}

function isResolved(match: MatchView, override: ResultOverride | undefined): boolean {
  return outcomeOf(match, override ?? null).kind !== 'pending';
}
