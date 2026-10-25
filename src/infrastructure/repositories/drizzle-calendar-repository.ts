import {
  aliasedTable,
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  isNull,
  lt,
  max,
  min,
  or,
  sql,
} from 'drizzle-orm';
import type {
  CalendarRepository,
  CalendarSnapshot,
  TeamMissingEmoji,
} from '../../application/ports/calendar-repository.js';
import type { MatchView, TeamView, WeekView } from '../../application/read-models/views.js';
import type { BestOf } from '../../domain/match/best-of.js';
import type { Match, MatchResult } from '../../domain/match/match.js';
import type { Side } from '../../domain/match/series-score.js';
import type { PredictionWeek } from '../../domain/schedule/prediction-week.js';
import type { CompetitionId, MatchId, TeamId, WeekId } from '../../domain/shared/ids.js';
import type { Database } from '../db/client.js';
import { competitions, matches, seasons, teams, tournaments, weeks } from '../db/schema.js';
import { chunk } from '../support/chunk.js';
import { excludedColumns } from './sql-helpers.js';

type MatchRow = typeof matches.$inferSelect;
type TeamRow = typeof teams.$inferSelect;

const INSERT_BATCH = 500;
const EMOJI_LOOKBACK_MS = 7 * 86_400_000;

export class DrizzleCalendarRepository implements CalendarRepository {
  constructor(private readonly db: Database) {}

  async applySnapshot(snapshot: CalendarSnapshot): Promise<void> {
    const { competitionId } = snapshot;
    await this.db.transaction(async (tx) => {
      const seasonIds = new Map<string, number>();
      if (snapshot.seasons.length > 0) {
        const rows = await tx
          .insert(seasons)
          .values(snapshot.seasons.map((season) => ({ competitionId, key: season.key, name: season.name })))
          .onConflictDoUpdate({
            target: [seasons.competitionId, seasons.key],
            set: excludedColumns(seasons, ['name']),
          })
          .returning({ id: seasons.id, key: seasons.key });
        for (const row of rows) seasonIds.set(row.key, row.id);
      }

      const tournamentIds = new Map<string, number>();
      if (snapshot.tournaments.length > 0) {
        const rows = await tx
          .insert(tournaments)
          .values(
            snapshot.tournaments.map((tournament) => ({
              competitionId,
              seasonId: required(seasonIds, tournament.seasonKey, 'season'),
              providerRef: tournament.ref,
              name: tournament.name,
              startsOn: tournament.startsOn,
              endsOn: tournament.endsOn,
            })),
          )
          .onConflictDoUpdate({
            target: tournaments.providerRef,
            set: excludedColumns(tournaments, ['seasonId', 'name', 'startsOn', 'endsOn']),
          })
          .returning({ id: tournaments.id, ref: tournaments.providerRef });
        for (const row of rows) tournamentIds.set(row.ref, row.id);
      }

      const weekIds = new Map<string, number>();
      if (snapshot.weeks.length > 0) {
        const rows = await tx
          .insert(weeks)
          .values(
            snapshot.weeks.map((week) => ({
              tournamentId: required(tournamentIds, week.tournamentRef, 'tournament'),
              name: week.name,
              sortOrder: week.order,
            })),
          )
          .onConflictDoUpdate({
            target: [weeks.tournamentId, weeks.name],
            set: excludedColumns(weeks, ['sortOrder']),
          })
          .returning({ id: weeks.id, tournamentId: weeks.tournamentId, name: weeks.name });
        for (const row of rows) weekIds.set(weekKey(row.tournamentId, row.name), row.id);
      }

      const teamIds = new Map<string, number>();
      for (const batch of chunk(snapshot.teams, INSERT_BATCH)) {
        const rows = await tx
          .insert(teams)
          .values(
            batch.map((team) => ({
              providerName: team.name,
              shortName: team.shortName,
              logoUrl: team.logoUrl,
            })),
          )
          .onConflictDoUpdate({
            target: teams.providerName,
            set: {
              shortName: sql`excluded.short_name`,
              logoUrl: sql`coalesce(excluded.logo_url, ${teams.logoUrl})`,
            },
          })
          .returning({ id: teams.id, name: teams.providerName });
        for (const row of rows) teamIds.set(row.name, row.id);
      }
      // Matches may reference cached teams left out of a partial snapshot.
      const missingTeams = [
        ...new Set(
          snapshot.matches.flatMap((match) => [match.team1, match.team2]).filter((name) => name !== null),
        ),
      ].filter((name) => !teamIds.has(name));
      if (missingTeams.length > 0) {
        const rows = await tx
          .select({ id: teams.id, name: teams.providerName })
          .from(teams)
          .where(inArray(teams.providerName, missingTeams));
        for (const row of rows) teamIds.set(row.name, row.id);
      }

      for (const batch of chunk(snapshot.matches, INSERT_BATCH)) {
        await tx
          .insert(matches)
          .values(
            batch.map((match) => {
              const tournamentId = required(tournamentIds, match.tournamentRef, 'tournament');
              return {
                providerRef: match.ref,
                competitionId,
                tournamentId,
                weekId: required(weekIds, weekKey(tournamentId, match.weekName), 'week'),
                matchDay: match.matchDay,
                team1Id: match.team1 === null ? null : required(teamIds, match.team1, 'team'),
                team2Id: match.team2 === null ? null : required(teamIds, match.team2, 'team'),
                scheduledAt: match.scheduledAt,
                bestOf: match.bestOf,
                status: match.status,
                winnerSide: match.result?.winner ?? null,
                team1Score: match.result?.score?.team1 ?? null,
                team2Score: match.result?.score?.team2 ?? null,
                syncedAt: new Date(),
              };
            }),
          )
          .onConflictDoUpdate({
            target: matches.providerRef,
            set: excludedColumns(matches, [
              'competitionId',
              'tournamentId',
              'weekId',
              'matchDay',
              'team1Id',
              'team2Id',
              'scheduledAt',
              'bestOf',
              'status',
              'winnerSide',
              'team1Score',
              'team2Score',
              'syncedAt',
            ]),
          });
      }
    });
  }

  async findWeeksBetween(
    competitionIds: readonly CompetitionId[],
    from: Date,
    to: Date,
  ): Promise<PredictionWeek[]> {
    if (competitionIds.length === 0) return [];
    const rows = await this.weekQuery()
      .where(inArray(tournaments.competitionId, [...competitionIds]))
      .groupBy(weeks.id, competitions.id)
      .having(and(gte(max(matches.scheduledAt), from), lt(min(matches.scheduledAt), to)))
      .orderBy(asc(min(matches.scheduledAt)));
    return rows.map(toWeek);
  }

  async findWeekViews(weekIds: readonly WeekId[]): Promise<WeekView[]> {
    if (weekIds.length === 0) return [];
    const weekRows = await this.weekQuery()
      .where(inArray(weeks.id, [...weekIds]))
      .groupBy(weeks.id, competitions.id)
      .orderBy(asc(min(matches.scheduledAt)));

    const team1 = aliasedTable(teams, 'team1');
    const team2 = aliasedTable(teams, 'team2');
    const matchRows = await this.db
      .select({ match: matches, team1, team2 })
      .from(matches)
      .leftJoin(team1, eq(team1.id, matches.team1Id))
      .leftJoin(team2, eq(team2.id, matches.team2Id))
      .where(inArray(matches.weekId, [...weekIds]))
      .orderBy(asc(matches.scheduledAt), asc(matches.id));

    return weekRows.map((row) => ({
      week: toWeek(row),
      competitionName: row.competitionName,
      matches: matchRows
        .filter(({ match }) => match.weekId === row.id)
        .map(({ match, team1: home, team2: away }) => toMatchView(match, home, away)),
    }));
  }

  async findMatch(matchId: MatchId): Promise<Match | null> {
    const [row] = await this.db.select().from(matches).where(eq(matches.id, matchId));
    return row ? toMatch(row) : null;
  }

  async findMatches(matchIds: readonly MatchId[]): Promise<Match[]> {
    if (matchIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(matches)
      .where(inArray(matches.id, [...matchIds]));
    return rows.map(toMatch);
  }

  async findMatchesStartedBetween(from: Date, to: Date): Promise<Match[]> {
    const rows = await this.db
      .select()
      .from(matches)
      .where(and(gte(matches.scheduledAt, from), lte(matches.scheduledAt, to)))
      .orderBy(asc(matches.scheduledAt));
    return rows.map(toMatch);
  }

  async findCompetitionsAwaitingResults(from: Date, to: Date): Promise<CompetitionId[]> {
    const rows = await this.db
      .selectDistinct({ competitionId: matches.competitionId })
      .from(matches)
      .where(
        and(eq(matches.status, 'scheduled'), gte(matches.scheduledAt, from), lte(matches.scheduledAt, to)),
      );
    return rows.map((row) => row.competitionId);
  }

  async findKnownTeamNames(names: readonly string[]): Promise<Set<string>> {
    if (names.length === 0) return new Set();
    const rows = await this.db
      .select({ name: teams.providerName })
      .from(teams)
      .where(inArray(teams.providerName, [...names]));
    return new Set(rows.map((row) => row.name));
  }

  async findWeekMatches(weekId: WeekId): Promise<Match[]> {
    const rows = await this.db
      .select()
      .from(matches)
      .where(eq(matches.weekId, weekId))
      .orderBy(asc(matches.scheduledAt));
    return rows.map(toMatch);
  }

  async findTeamsMissingEmoji(upcomingFrom: Date, limit: number): Promise<TeamMissingEmoji[]> {
    const since = new Date(upcomingFrom.getTime() - EMOJI_LOOKBACK_MS);
    const rows = await this.db
      .selectDistinct({ id: teams.id, shortName: teams.shortName, logoUrl: teams.logoUrl })
      .from(teams)
      .innerJoin(matches, or(eq(matches.team1Id, teams.id), eq(matches.team2Id, teams.id)))
      .where(and(isNull(teams.emojiId), isNotNull(teams.logoUrl), gte(matches.scheduledAt, since)))
      .orderBy(asc(teams.id))
      .limit(limit);
    return rows.flatMap((row) => (row.logoUrl === null ? [] : [{ ...row, logoUrl: row.logoUrl }]));
  }

  async setTeamEmoji(teamId: TeamId, emojiId: string): Promise<void> {
    await this.db.update(teams).set({ emojiId }).where(eq(teams.id, teamId));
  }

  private weekQuery() {
    return this.db
      .select({
        id: weeks.id,
        name: weeks.name,
        competitionId: competitions.id,
        competitionName: competitions.name,
        startsAt: min(matches.scheduledAt),
        endsAt: max(matches.scheduledAt),
      })
      .from(weeks)
      .innerJoin(tournaments, eq(tournaments.id, weeks.tournamentId))
      .innerJoin(competitions, eq(competitions.id, tournaments.competitionId))
      .innerJoin(matches, eq(matches.weekId, weeks.id))
      .$dynamic();
  }
}

function weekKey(tournamentId: number, name: string): string {
  return `${tournamentId}\u0000${name}`;
}

function required<V>(map: ReadonlyMap<string, V>, key: string, what: string): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Snapshot references unknown ${what} "${key}"`);
  return value;
}

function toWeek(row: {
  id: number;
  name: string;
  competitionId: string;
  startsAt: Date | null;
  endsAt: Date | null;
}): PredictionWeek {
  if (!row.startsAt || !row.endsAt) throw new Error(`Week ${row.id} has no match`);
  return {
    id: row.id,
    competitionId: row.competitionId,
    name: row.name,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  };
}

function toResult(row: MatchRow): MatchResult | null {
  if (row.winnerSide === null) return null;
  const score =
    row.team1Score !== null && row.team2Score !== null
      ? { team1: row.team1Score, team2: row.team2Score }
      : null;
  return { winner: row.winnerSide as Side, score };
}

function toMatch(row: MatchRow): Match {
  return {
    id: row.id,
    competitionId: row.competitionId,
    weekId: row.weekId,
    matchDay: row.matchDay,
    team1Id: row.team1Id,
    team2Id: row.team2Id,
    scheduledAt: row.scheduledAt,
    bestOf: row.bestOf as BestOf,
    status: row.status,
    result: toResult(row),
  };
}

function toTeamView(row: TeamRow | null): TeamView | null {
  if (!row) return null;
  return { id: row.id, name: row.providerName, shortName: row.shortName, emojiId: row.emojiId };
}

function toMatchView(row: MatchRow, team1: TeamRow | null, team2: TeamRow | null): MatchView {
  return {
    id: row.id,
    weekId: row.weekId,
    matchDay: row.matchDay,
    scheduledAt: row.scheduledAt,
    bestOf: row.bestOf as BestOf,
    status: row.status,
    result: toResult(row),
    team1: toTeamView(team1),
    team2: toTeamView(team2),
  };
}
