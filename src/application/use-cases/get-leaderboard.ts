import type { Competition } from '../../domain/competition/competition.js';
import { currentSeason } from '../../domain/competition/season.js';
import { accessOf } from '../../domain/guild/guild.js';
import type { Locale } from '../../domain/guild/guild-settings.js';
import { rankTallies, type LeaderboardEntry } from '../../domain/leaderboard/leaderboard.js';
import { latestStartedWeek } from '../../domain/schedule/week-navigation.js';
import type { CompetitionId, GuildId, SeasonId, UserId } from '../../domain/shared/ids.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { Clock } from '../ports/clock.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { LeaderboardQuery, TallyFilter } from '../ports/leaderboard-query.js';

const WEEK_SEARCH_MS = 180 * 86_400_000;

export type LeaderboardPeriod = 'week' | 'season' | 'alltime';

export interface LeaderboardRequest {
  readonly guildId: GuildId;
  readonly userId: UserId;
  readonly period: LeaderboardPeriod;
  /** All competitions when null. */
  readonly competitionId: CompetitionId | null;
  /** A past season to show instead of the current one (implies the season period). */
  readonly seasonId: SeasonId | null;
}

/** What the board covers, e.g. "LEC · Week 3" (label is null for all-time boards). */
export interface LeaderboardScope {
  readonly competitionName: string;
  readonly label: string | null;
}

export interface Leaderboard {
  readonly locale: Locale;
  readonly period: LeaderboardPeriod;
  /** Empty for an all-competition all-time board. */
  readonly scopes: readonly LeaderboardScope[];
  readonly entries: readonly LeaderboardEntry[];
  /** The requesting player, when ranked. */
  readonly viewer: LeaderboardEntry | null;
}

export type LeaderboardError = 'guild-not-active' | 'season-not-found';

/**
 * Week, season (split or tournament) or all-time standings of a server, for one competition or all.
 * Points come from judged predictions only, so a player joining mid-season simply starts from 0.
 */
export class GetLeaderboard {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly calendar: CalendarRepository,
    private readonly leaderboards: LeaderboardQuery,
    private readonly competitions: readonly Competition[],
    private readonly clock: Clock,
  ) {}

  async execute(request: LeaderboardRequest): Promise<Result<Leaderboard, LeaderboardError>> {
    const guild = await this.guilds.find(request.guildId);
    if (!guild?.settings || accessOf(guild) !== 'allowed') return err('guild-not-active');

    const period = request.seasonId === null ? request.period : 'season';
    const competitions = this.competitions.filter((competition) =>
      request.competitionId === null
        ? period === 'alltime' || guild.settings?.competitionIds.includes(competition.id)
        : competition.id === request.competitionId,
    );
    const resolved = await this.resolveScope(period, competitions, request);
    if (!resolved.ok) return resolved;

    const { scopes, filter } = resolved.value;
    const entries = filter ? rankTallies(await this.leaderboards.tally(request.guildId, filter)) : [];
    return ok({
      locale: guild.settings.locale,
      period,
      scopes,
      entries,
      viewer: entries.find((entry) => entry.userId === request.userId) ?? null,
    });
  }

  /** The filter is null when there is nothing to rank yet (no week or season started). */
  private async resolveScope(
    period: LeaderboardPeriod,
    competitions: readonly Competition[],
    request: LeaderboardRequest,
  ): Promise<Result<{ scopes: LeaderboardScope[]; filter: TallyFilter | null }, LeaderboardError>> {
    const nameOf = (id: CompetitionId) =>
      this.competitions.find((competition) => competition.id === id)?.name ?? id;
    const now = this.clock.now();

    if (period === 'alltime') {
      const scopes =
        request.competitionId === null
          ? []
          : competitions.map((c) => ({ competitionName: c.name, label: null }));
      return ok({
        scopes,
        filter: request.competitionId === null ? {} : { competitionIds: [request.competitionId] },
      });
    }

    if (period === 'season') {
      const seasons = await this.calendar.findSeasons(
        request.seasonId === null
          ? competitions.map((competition) => competition.id)
          : this.competitions.map((c) => c.id),
      );
      const picked =
        request.seasonId === null
          ? competitions.flatMap((competition) => {
              const season = currentSeason(
                seasons.filter((candidate) => candidate.competitionId === competition.id),
                now,
              );
              return season ? [season] : [];
            })
          : seasons.filter((season) => season.id === request.seasonId);
      if (request.seasonId !== null && picked.length === 0) return err('season-not-found');
      return ok({
        scopes: picked.map((season) => ({
          competitionName: nameOf(season.competitionId),
          label: season.name,
        })),
        filter: picked.length > 0 ? { seasonIds: picked.map((season) => season.id) } : null,
      });
    }

    const weeks = await this.calendar.findWeeksBetween(
      competitions.map((competition) => competition.id),
      new Date(now.getTime() - WEEK_SEARCH_MS),
      now,
    );
    const picked = competitions.flatMap((competition) => {
      const week = latestStartedWeek(
        weeks.filter((candidate) => candidate.competitionId === competition.id),
        now,
      );
      return week ? [week] : [];
    });
    return ok({
      scopes: picked.map((week) => ({ competitionName: nameOf(week.competitionId), label: week.name })),
      filter: picked.length > 0 ? { weekIds: picked.map((week) => week.id) } : null,
    });
  }
}
