import type { Competition } from '../../domain/competition/competition.js';
import { currentSeason } from '../../domain/competition/season.js';
import { accessOf } from '../../domain/guild/guild.js';
import type { Locale } from '../../domain/guild/guild-settings.js';
import type { LeaderboardEntry } from '../../domain/leaderboard/leaderboard.js';
import { predictedWinner } from '../../domain/prediction/prediction-choice.js';
import type { CompetitionId, GuildId, UserId } from '../../domain/shared/ids.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import {
  computePlayerStats,
  type PickRecord,
  type PlayerStats,
  type StatsPick,
} from '../../domain/stats/player-stats.js';
import type { BanRepository } from '../ports/ban-repository.js';
import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { Clock } from '../ports/clock.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { PredictionRepository } from '../ports/prediction-repository.js';
import type { StandingsReader } from '../read-models/standings.js';
import type { MatchView, TeamView, WeekView } from '../read-models/views.js';

/** Where the player stands on one leaderboard. */
export interface PlayerStanding {
  readonly rank: number;
  readonly players: number;
  readonly points: number;
}

export interface PlayerStatsReport {
  readonly locale: Locale;
  readonly userId: UserId;
  /** Banned players keep their history but are out of the leaderboards. */
  readonly banned: boolean;
  readonly record: PickRecord;
  readonly currentStreak: number;
  readonly bestStreak: number;
  readonly allTime: PlayerStanding | null;
  /** Current split or tournament of each enabled competition the player is ranked in. */
  readonly seasons: readonly (PlayerStanding & { readonly name: string })[];
  readonly competitions: readonly (PickRecord & { readonly name: string })[];
  readonly bestWeek: {
    readonly competitionName: string;
    readonly weekName: string;
    readonly points: number;
  } | null;
  readonly favouriteTeam: {
    readonly team: TeamView;
    readonly picks: number;
    readonly correct: number;
  } | null;
}

/** /stats: a player's record on the server, all competitions and all time. */
export class GetPlayerStats {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly predictions: PredictionRepository,
    private readonly calendar: CalendarRepository,
    private readonly standings: StandingsReader,
    private readonly bans: BanRepository,
    private readonly competitions: readonly Competition[],
    private readonly clock: Clock,
  ) {}

  async execute(guildId: GuildId, userId: UserId): Promise<Result<PlayerStatsReport, 'guild-not-active'>> {
    const guild = await this.guilds.find(guildId);
    if (!guild?.settings || accessOf(guild) !== 'allowed') return err('guild-not-active');

    const judged = await this.predictions.findScoredByUser(guildId, userId);
    const weeks = await this.calendar.findWeekViews([...new Set(await this.weekIdsOf(judged))]);
    const matches = new Map(
      weeks.flatMap((week) => week.matches.map((match) => [match.id, { match, week }] as const)),
    );
    const picks = judged.flatMap((prediction): StatsPick[] => {
      const found = matches.get(prediction.matchId);
      if (!found || prediction.outcome.status !== 'scored') return [];
      const { match, week } = found;
      const picked = predictedWinner(prediction.choice) === 1 ? match.team1 : match.team2;
      return [
        {
          matchId: match.id,
          competitionId: week.week.competitionId,
          weekId: week.week.id,
          scheduledAt: match.scheduledAt,
          bestOf: match.bestOf,
          pickedTeamId: picked?.id ?? null,
          outcome: prediction.outcome,
        },
      ];
    });
    const stats = computePlayerStats(picks);

    return ok({
      locale: guild.settings.locale,
      userId,
      banned: await this.bans.isBanned(guildId, userId),
      record: stats.record,
      currentStreak: stats.currentStreak,
      bestStreak: stats.bestStreak,
      allTime: standingOf(await this.standings.rank(guildId, {}), userId),
      seasons: await this.currentSeasons(guildId, userId, guild.settings.competitionIds),
      competitions: stats.byCompetition.map(({ competitionId, ...record }) => ({
        name: this.nameOf(competitionId),
        ...record,
      })),
      bestWeek: bestWeekOf(stats, weeks),
      favouriteTeam: favouriteTeamOf(
        stats,
        [...matches.values()].map(({ match }) => match),
      ),
    });
  }

  private async weekIdsOf(judged: readonly { readonly matchId: number }[]): Promise<number[]> {
    const matches = await this.calendar.findMatches(judged.map((prediction) => prediction.matchId));
    return matches.map((match) => match.weekId);
  }

  private async currentSeasons(
    guildId: GuildId,
    userId: UserId,
    competitionIds: readonly CompetitionId[],
  ): Promise<PlayerStatsReport['seasons']> {
    const seasons = await this.calendar.findSeasons(competitionIds);
    const now = this.clock.now();
    const result: (PlayerStanding & { name: string })[] = [];
    for (const competitionId of competitionIds) {
      const season = currentSeason(
        seasons.filter((candidate) => candidate.competitionId === competitionId),
        now,
      );
      if (!season) continue;
      const standing = standingOf(await this.standings.rank(guildId, { seasonIds: [season.id] }), userId);
      if (standing) result.push({ name: season.name, ...standing });
    }
    return result;
  }

  private nameOf(competitionId: CompetitionId): string {
    return this.competitions.find((competition) => competition.id === competitionId)?.name ?? competitionId;
  }
}

function standingOf(entries: readonly LeaderboardEntry[], userId: UserId): PlayerStanding | null {
  const entry = entries.find((candidate) => candidate.userId === userId);
  return entry ? { rank: entry.rank, players: entries.length, points: entry.points } : null;
}

function bestWeekOf(stats: PlayerStats, weeks: readonly WeekView[]): PlayerStatsReport['bestWeek'] {
  const week = weeks.find((candidate) => candidate.week.id === stats.bestWeek?.weekId);
  if (!week || !stats.bestWeek) return null;
  return { competitionName: week.competitionName, weekName: week.week.name, points: stats.bestWeek.points };
}

function favouriteTeamOf(
  stats: PlayerStats,
  matches: readonly MatchView[],
): PlayerStatsReport['favouriteTeam'] {
  const favourite = stats.favouriteTeam;
  if (!favourite) return null;
  const team = matches
    .flatMap((match) => [match.team1, match.team2])
    .find((candidate) => candidate?.id === favourite.teamId);
  return team ? { team, picks: favourite.picks, correct: favourite.correct } : null;
}
