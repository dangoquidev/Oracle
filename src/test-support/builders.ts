import type { MatchView, TeamView, WeekView } from '../application/read-models/views.js';
import { defaultSettings, type GuildSettings } from '../domain/guild/guild-settings.js';
import type { Guild } from '../domain/guild/guild.js';
import type { Match } from '../domain/match/match.js';
import type { PredictionWeek } from '../domain/schedule/prediction-week.js';

export const settings = (overrides: Partial<GuildSettings> = {}): GuildSettings => ({
  ...defaultSettings(['lec', 'worlds']),
  pingRoleId: 'role-1',
  channelId: 'channel-1',
  ...overrides,
});

export const activeGuild = (id = 'guild-1', overrides: Partial<GuildSettings> = {}): Guild => ({
  id,
  status: 'active',
  pauseReason: null,
  settings: settings(overrides),
});

export const match = (overrides: Partial<Match> = {}): Match => ({
  id: 1,
  competitionId: 'lec',
  weekId: 1,
  matchDay: 1,
  team1Id: 10,
  team2Id: 20,
  scheduledAt: new Date('2026-08-01T16:00:00Z'),
  bestOf: 1,
  status: 'scheduled',
  result: null,
  ...overrides,
});

export const week = (overrides: Partial<PredictionWeek> = {}): PredictionWeek => ({
  id: 1,
  competitionId: 'lec',
  name: 'Week 1',
  startsAt: new Date('2026-08-01T16:00:00Z'),
  endsAt: new Date('2026-08-03T18:00:00Z'),
  ...overrides,
});

export const team = (id: number, shortName: string): TeamView => ({
  id,
  name: shortName,
  shortName,
  emojiId: null,
});

export const matchViewOf = (source: Match, teams: Record<number, TeamView> = {}): MatchView => ({
  id: source.id,
  weekId: source.weekId,
  matchDay: source.matchDay,
  scheduledAt: source.scheduledAt,
  bestOf: source.bestOf,
  status: source.status,
  team1:
    source.team1Id === null ? null : (teams[source.team1Id] ?? team(source.team1Id, `T${source.team1Id}`)),
  team2:
    source.team2Id === null ? null : (teams[source.team2Id] ?? team(source.team2Id, `T${source.team2Id}`)),
});

export const weekView = (
  source: PredictionWeek,
  matches: readonly Match[],
  competitionName = 'LEC',
): WeekView => ({
  week: source,
  competitionName,
  matches: matches.map((m) => matchViewOf(m)),
});
