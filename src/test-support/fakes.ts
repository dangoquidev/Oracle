import type { BanRepository } from '../application/ports/ban-repository.js';
import type {
  CalendarRepository,
  CalendarSnapshot,
  SeasonSummary,
  TeamMissingEmoji,
} from '../application/ports/calendar-repository.js';
import type { Clock } from '../application/ports/clock.js';
import type { DispatchLog } from '../application/ports/dispatch-log.js';
import type {
  GuildMessenger,
  LockReminder,
  MatchRecap,
  SeasonRecap,
  VoteReveal,
  WeekAnnouncement,
} from '../application/ports/guild-messenger.js';
import type { LeaderboardQuery, TallyFilter } from '../application/ports/leaderboard-query.js';
import type { LockOverrideRepository } from '../application/ports/lock-override-repository.js';
import type {
  GuildPermissionChecker,
  PublicationCheck,
} from '../application/ports/guild-permission-checker.js';
import type { GuildRepository } from '../application/ports/guild-repository.js';
import type { Logger } from '../application/ports/logger.js';
import type {
  MatchDataProvider,
  ProviderMatch,
  ProviderTeam,
  ProviderTournament,
} from '../application/ports/match-data-provider.js';
import type { JudgedPrediction, PredictionRepository } from '../application/ports/prediction-repository.js';
import type { ResultOverrideRepository } from '../application/ports/result-override-repository.js';
import type {
  ActivePublication,
  Publication,
  PublicationRepository,
} from '../application/ports/publication-repository.js';
import type { ScheduleSyncTrigger } from '../application/ports/schedule-sync-trigger.js';
import type { TeamEmojiStore } from '../application/ports/team-emoji-store.js';
import type { WeekView } from '../application/read-models/views.js';
import type { CompetitionSource } from '../domain/competition/competition.js';
import type { GuildSettings, Locale } from '../domain/guild/guild-settings.js';
import type { Guild, PauseReason } from '../domain/guild/guild.js';
import type { PlayerBan } from '../domain/guild/player-ban.js';
import type { PlayerTally } from '../domain/leaderboard/leaderboard.js';
import type { LockOverride } from '../domain/lock/lock-override.js';
import type { Match } from '../domain/match/match.js';
import type { Prediction } from '../domain/prediction/prediction.js';
import type { ResultOverride } from '../domain/scoring/match-outcome.js';
import type { PredictionWeek } from '../domain/schedule/prediction-week.js';
import type {
  ChannelId,
  CompetitionId,
  GuildId,
  MatchId,
  RoleId,
  TeamId,
  UserId,
  WeekId,
} from '../domain/shared/ids.js';

export class FixedClock implements Clock {
  constructor(private instant: Date) {}
  now(): Date {
    return this.instant;
  }
  set(instant: Date): void {
    this.instant = instant;
  }
}

export class SilentLogger implements Logger {
  readonly entries: { level: string; context: object; message: string }[] = [];
  debug(context: object, message: string): void {
    this.entries.push({ level: 'debug', context, message });
  }
  info(context: object, message: string): void {
    this.entries.push({ level: 'info', context, message });
  }
  warn(context: object, message: string): void {
    this.entries.push({ level: 'warn', context, message });
  }
  error(context: object, message: string): void {
    this.entries.push({ level: 'error', context, message });
  }
  child(): Logger {
    return this;
  }
}

export class InMemoryGuildRepository implements GuildRepository {
  readonly guilds = new Map<GuildId, Guild>();

  add(guild: Guild): this {
    this.guilds.set(guild.id, guild);
    return this;
  }
  find(guildId: GuildId): Promise<Guild | null> {
    return Promise.resolve(this.guilds.get(guildId) ?? null);
  }
  register(guildId: GuildId): Promise<boolean> {
    const existing = this.guilds.get(guildId);
    if (existing && existing.status !== 'left') return Promise.resolve(false);
    this.guilds.set(guildId, {
      id: guildId,
      status: 'unconfigured',
      pauseReason: null,
      settings: existing?.settings ?? null,
    });
    return Promise.resolve(true);
  }
  saveSettings(guildId: GuildId, settings: GuildSettings): Promise<void> {
    this.guilds.set(guildId, { id: guildId, status: 'active', pauseReason: null, settings });
    return Promise.resolve();
  }
  pause(guildId: GuildId, reason: PauseReason): Promise<void> {
    const guild = this.guilds.get(guildId);
    if (guild) this.guilds.set(guildId, { ...guild, status: 'paused', pauseReason: reason });
    return Promise.resolve();
  }
  markLeft(guildId: GuildId): Promise<void> {
    const guild = this.guilds.get(guildId);
    if (guild) this.guilds.set(guildId, { ...guild, status: 'left' });
    return Promise.resolve();
  }
  listActive(): Promise<Guild[]> {
    return Promise.resolve([...this.guilds.values()].filter((guild) => guild.status === 'active'));
  }
  listPresentIds(): Promise<GuildId[]> {
    return Promise.resolve([...this.guilds.values()].filter((g) => g.status !== 'left').map((g) => g.id));
  }
}

/** Calendar seeded directly with domain objects; snapshots are only recorded. */
export class InMemoryCalendarRepository implements CalendarRepository {
  readonly snapshots: CalendarSnapshot[] = [];
  readonly weeks: PredictionWeek[] = [];
  readonly matches: Match[] = [];
  readonly views: WeekView[] = [];
  readonly teamsMissingEmoji: TeamMissingEmoji[] = [];
  readonly emojis = new Map<TeamId, string>();
  readonly knownTeamNames = new Set<string>();
  readonly seasons: SeasonSummary[] = [];

  applySnapshot(snapshot: CalendarSnapshot): Promise<void> {
    this.snapshots.push(snapshot);
    return Promise.resolve();
  }
  findWeeksBetween(
    competitionIds: readonly CompetitionId[],
    from: Date,
    to: Date,
  ): Promise<PredictionWeek[]> {
    return Promise.resolve(
      this.weeks.filter(
        (week) => competitionIds.includes(week.competitionId) && week.endsAt >= from && week.startsAt < to,
      ),
    );
  }
  findWeekViews(weekIds: readonly WeekId[]): Promise<WeekView[]> {
    return Promise.resolve(this.views.filter((view) => weekIds.includes(view.week.id)));
  }
  findMatch(matchId: MatchId): Promise<Match | null> {
    return Promise.resolve(this.matches.find((match) => match.id === matchId) ?? null);
  }
  findMatches(matchIds: readonly MatchId[]): Promise<Match[]> {
    return Promise.resolve(this.matches.filter((match) => matchIds.includes(match.id)));
  }
  findWeekMatches(weekId: WeekId): Promise<Match[]> {
    return Promise.resolve(this.matches.filter((match) => match.weekId === weekId));
  }
  findMatchesStartedBetween(from: Date, to: Date): Promise<Match[]> {
    return Promise.resolve(
      this.matches.filter((match) => match.scheduledAt >= from && match.scheduledAt <= to),
    );
  }
  findCompetitionsAwaitingResults(from: Date, to: Date): Promise<CompetitionId[]> {
    const ids = this.matches
      .filter((match) => match.status === 'scheduled' && match.scheduledAt >= from && match.scheduledAt <= to)
      .map((match) => match.competitionId);
    return Promise.resolve([...new Set(ids)]);
  }
  findKnownTeamNames(names: readonly string[]): Promise<Set<string>> {
    return Promise.resolve(new Set(names.filter((name) => this.knownTeamNames.has(name))));
  }
  findTeamsMissingEmoji(_upcomingFrom: Date, limit: number): Promise<TeamMissingEmoji[]> {
    return Promise.resolve(
      this.teamsMissingEmoji.filter((team) => !this.emojis.has(team.id)).slice(0, limit),
    );
  }
  setTeamEmoji(teamId: TeamId, emojiId: string): Promise<void> {
    this.emojis.set(teamId, emojiId);
    return Promise.resolve();
  }
  findSeasons(competitionIds: readonly CompetitionId[]): Promise<SeasonSummary[]> {
    return Promise.resolve(this.seasons.filter((season) => competitionIds.includes(season.competitionId)));
  }
}

export class InMemoryPredictionRepository implements PredictionRepository {
  readonly predictions: JudgedPrediction[] = [];
  readonly outcomeWrites: { count: number; at: Date }[] = [];

  save(prediction: Prediction): Promise<void> {
    const judged: JudgedPrediction = { ...prediction, outcome: { status: 'pending' } };
    const index = this.indexOf(prediction);
    if (index >= 0) this.predictions.splice(index, 1, judged);
    else this.predictions.push(judged);
    return Promise.resolve();
  }
  findByUser(guildId: GuildId, userId: UserId, matchIds: readonly MatchId[]): Promise<JudgedPrediction[]> {
    return Promise.resolve(
      this.predictions.filter(
        (p) => p.guildId === guildId && p.userId === userId && matchIds.includes(p.matchId),
      ),
    );
  }
  findByMatches(guildId: GuildId, matchIds: readonly MatchId[]): Promise<JudgedPrediction[]> {
    return Promise.resolve(
      this.predictions.filter((p) => p.guildId === guildId && matchIds.includes(p.matchId)),
    );
  }
  findForScoring(matchIds: readonly MatchId[], guildId: GuildId | null): Promise<JudgedPrediction[]> {
    return Promise.resolve(
      this.predictions.filter(
        (p) => matchIds.includes(p.matchId) && (guildId === null || p.guildId === guildId),
      ),
    );
  }
  saveOutcomes(
    judged: readonly Pick<JudgedPrediction, 'guildId' | 'userId' | 'matchId' | 'outcome'>[],
    at: Date,
  ): Promise<void> {
    for (const update of judged) {
      const index = this.indexOf(update);
      const existing = this.predictions[index];
      if (existing) this.predictions.splice(index, 1, { ...existing, outcome: update.outcome });
    }
    this.outcomeWrites.push({ count: judged.length, at });
    return Promise.resolve();
  }
  private indexOf(key: Pick<Prediction, 'guildId' | 'userId' | 'matchId'>): number {
    return this.predictions.findIndex(
      (p) => p.guildId === key.guildId && p.userId === key.userId && p.matchId === key.matchId,
    );
  }
}

/** Sums the fake predictions, locating matches through the fake calendar. */
export class InMemoryLeaderboardQuery implements LeaderboardQuery {
  constructor(
    private readonly predictions: InMemoryPredictionRepository,
    private readonly calendar: InMemoryCalendarRepository,
  ) {}

  tally(guildId: GuildId, filter: TallyFilter): Promise<PlayerTally[]> {
    const tallies = new Map<UserId, PlayerTally>();
    for (const prediction of this.predictions.predictions) {
      const { outcome } = prediction;
      const match = this.calendar.matches.find((candidate) => candidate.id === prediction.matchId);
      if (prediction.guildId !== guildId || outcome.status !== 'scored' || !match) continue;
      if (!this.matches(match, filter)) continue;
      const tally = tallies.get(prediction.userId) ?? {
        userId: prediction.userId,
        points: 0,
        predictions: 0,
        correctWinners: 0,
        exactScores: 0,
      };
      tallies.set(prediction.userId, {
        userId: prediction.userId,
        points: tally.points + outcome.points,
        predictions: tally.predictions + 1,
        correctWinners: tally.correctWinners + (outcome.correctWinner ? 1 : 0),
        exactScores: tally.exactScores + (outcome.exactScore ? 1 : 0),
      });
    }
    return Promise.resolve([...tallies.values()]);
  }

  private matches(match: Match, filter: TallyFilter): boolean {
    const season = this.calendar.seasons.find((candidate) => candidate.weekIds.includes(match.weekId));
    return (
      (!filter.competitionIds || filter.competitionIds.includes(match.competitionId)) &&
      (!filter.weekIds || filter.weekIds.includes(match.weekId)) &&
      (!filter.matchIds || filter.matchIds.includes(match.id)) &&
      (!filter.seasonIds || (season !== undefined && filter.seasonIds.includes(season.id)))
    );
  }
}

export class InMemoryResultOverrideRepository implements ResultOverrideRepository {
  readonly overrides = new Map<string, ResultOverride>();

  findForMatches(guildId: GuildId, matchIds: readonly MatchId[]): Promise<Map<MatchId, ResultOverride>> {
    const found = new Map<MatchId, ResultOverride>();
    for (const matchId of matchIds) {
      const override = this.overrides.get(`${guildId}:${matchId}`);
      if (override) found.set(matchId, override);
    }
    return Promise.resolve(found);
  }
  set(guildId: GuildId, matchId: MatchId, override: ResultOverride): Promise<void> {
    this.overrides.set(`${guildId}:${matchId}`, override);
    return Promise.resolve();
  }
  clear(guildId: GuildId, matchId: MatchId): Promise<void> {
    this.overrides.delete(`${guildId}:${matchId}`);
    return Promise.resolve();
  }
}

export class InMemoryPublicationRepository implements PublicationRepository {
  readonly publications = new Map<
    number,
    Publication & { channelId: string; messageId: string | null; fingerprint: string | null }
  >();
  /** Publications whose weeks are over; every other one is considered active. */
  readonly finished = new Set<number>();
  private nextId = 1;

  findPublishedWeekIds(guildId: GuildId, weekIds: readonly WeekId[]): Promise<Set<WeekId>> {
    const published = [...this.publications.values()]
      .filter((p) => p.guildId === guildId)
      .flatMap((p) => p.weekIds)
      .filter((id) => weekIds.includes(id));
    return Promise.resolve(new Set(published));
  }
  reserve(
    guildId: GuildId,
    weekIds: readonly WeekId[],
    channelId: ChannelId,
    _at: Date,
  ): Promise<number | null> {
    const taken = [...this.publications.values()].some(
      (p) => p.guildId === guildId && p.weekIds.some((id) => weekIds.includes(id)),
    );
    if (taken) return Promise.resolve(null);
    const id = this.nextId++;
    this.publications.set(id, { id, guildId, weekIds, channelId, messageId: null, fingerprint: null });
    return Promise.resolve(id);
  }
  attachMessage(publicationId: number, messageId: string, fingerprint: string): Promise<void> {
    const publication = this.publications.get(publicationId);
    if (publication) this.publications.set(publicationId, { ...publication, messageId, fingerprint });
    return Promise.resolve();
  }
  release(publicationId: number): Promise<void> {
    this.publications.delete(publicationId);
    return Promise.resolve();
  }
  find(publicationId: number): Promise<Publication | null> {
    const publication = this.publications.get(publicationId);
    return Promise.resolve(
      publication ? { id: publication.id, guildId: publication.guildId, weekIds: publication.weekIds } : null,
    );
  }
  findActive(guildId: GuildId, _endingAfter: Date): Promise<ActivePublication[]> {
    return Promise.resolve(
      [...this.publications.values()].filter((p) => p.guildId === guildId && !this.finished.has(p.id)),
    );
  }
  setFingerprint(publicationId: number, fingerprint: string): Promise<void> {
    const publication = this.publications.get(publicationId);
    if (publication) this.publications.set(publicationId, { ...publication, fingerprint });
    return Promise.resolve();
  }
}

export class InMemoryLockOverrideRepository implements LockOverrideRepository {
  readonly overrides = new Map<string, LockOverride & { setBy: UserId }>();

  findForMatches(guildId: GuildId, matchIds: readonly MatchId[]): Promise<Map<MatchId, LockOverride>> {
    const found = new Map<MatchId, LockOverride>();
    for (const matchId of matchIds) {
      const override = this.overrides.get(`${guildId}:${matchId}`);
      if (override) found.set(matchId, { state: override.state, at: override.at });
    }
    return Promise.resolve(found);
  }
  set(guildId: GuildId, matchIds: readonly MatchId[], override: LockOverride, setBy: UserId): Promise<void> {
    for (const matchId of matchIds) this.overrides.set(`${guildId}:${matchId}`, { ...override, setBy });
    return Promise.resolve();
  }
}

export class InMemoryBanRepository implements BanRepository {
  readonly bans = new Map<string, PlayerBan>();

  ban(ban: PlayerBan): Promise<boolean> {
    const key = `${ban.guildId}:${ban.userId}`;
    if (this.bans.has(key)) return Promise.resolve(false);
    this.bans.set(key, ban);
    return Promise.resolve(true);
  }
  unban(guildId: GuildId, userId: UserId): Promise<boolean> {
    return Promise.resolve(this.bans.delete(`${guildId}:${userId}`));
  }
  isBanned(guildId: GuildId, userId: UserId): Promise<boolean> {
    return Promise.resolve(this.bans.has(`${guildId}:${userId}`));
  }
  bannedIds(guildId: GuildId): Promise<ReadonlySet<UserId>> {
    return Promise.resolve(
      new Set([...this.bans.values()].filter((ban) => ban.guildId === guildId).map((ban) => ban.userId)),
    );
  }
}

export class StubSyncTrigger implements ScheduleSyncTrigger {
  accept = true;
  requests = 0;

  request(): Promise<boolean> {
    this.requests += 1;
    return Promise.resolve(this.accept);
  }
}

export class InMemoryDispatchLog implements DispatchLog {
  readonly sent = new Map<string, Date>();

  findSent(guildId: GuildId, keys: readonly string[]): Promise<Set<string>> {
    return Promise.resolve(new Set(keys.filter((key) => this.sent.has(`${guildId}:${key}`))));
  }
  record(guildId: GuildId, key: string, at: Date): Promise<void> {
    this.sent.set(`${guildId}:${key}`, at);
    return Promise.resolve();
  }
}

export class RecordingMessenger implements GuildMessenger {
  readonly welcomes: GuildId[] = [];
  readonly pauses: { guildId: GuildId; reason: PauseReason; locale: Locale }[] = [];
  readonly announcements: WeekAnnouncement[] = [];
  readonly updates: { messageId: string; announcement: WeekAnnouncement }[] = [];
  readonly reminders: LockReminder[] = [];
  readonly reveals: VoteReveal[] = [];
  readonly matchRecaps: MatchRecap[] = [];
  readonly seasonRecaps: SeasonRecap[] = [];
  deletedMessages = new Set<string>();
  failWith: Error | null = null;

  sendWelcome(guildId: GuildId): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.welcomes.push(guildId);
    return Promise.resolve();
  }
  notifyPaused(guildId: GuildId, reason: PauseReason, locale: Locale): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.pauses.push({ guildId, reason, locale });
    return Promise.resolve();
  }
  announceWeeks(announcement: WeekAnnouncement): Promise<string> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.announcements.push(announcement);
    return Promise.resolve(`message-${this.announcements.length}`);
  }
  updateAnnouncement(messageId: string, announcement: WeekAnnouncement): Promise<boolean> {
    if (this.failWith) return Promise.reject(this.failWith);
    if (this.deletedMessages.has(messageId)) return Promise.resolve(false);
    this.updates.push({ messageId, announcement });
    return Promise.resolve(true);
  }
  sendLockReminder(reminder: LockReminder): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.reminders.push(reminder);
    return Promise.resolve();
  }
  revealVotes(reveal: VoteReveal): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.reveals.push(reveal);
    return Promise.resolve();
  }
  sendMatchRecap(recap: MatchRecap): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.matchRecaps.push(recap);
    return Promise.resolve();
  }
  sendSeasonRecap(recap: SeasonRecap): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.seasonRecaps.push(recap);
    return Promise.resolve();
  }
}

export class StubPermissionChecker implements GuildPermissionChecker {
  result: PublicationCheck = { issues: [], warnings: [] };
  readonly calls: { guildId: GuildId; channelId: ChannelId; roleId: RoleId }[] = [];

  checkPublication(guildId: GuildId, channelId: ChannelId, roleId: RoleId): Promise<PublicationCheck> {
    this.calls.push({ guildId, channelId, roleId });
    return Promise.resolve(this.result);
  }
}

export class StubMatchDataProvider implements MatchDataProvider {
  tournaments = new Map<string, ProviderTournament[]>();
  matches: ProviderMatch[] = [];
  teams: ProviderTeam[] = [];
  failingLeagues = new Set<string>();
  readonly teamRequests: (readonly string[])[] = [];

  fetchTournaments(source: CompetitionSource): Promise<ProviderTournament[]> {
    if (this.failingLeagues.has(source.league)) return Promise.reject(new Error('provider down'));
    return Promise.resolve(this.tournaments.get(source.league) ?? []);
  }
  fetchMatches(tournamentRefs: readonly string[]): Promise<ProviderMatch[]> {
    return Promise.resolve(this.matches.filter((match) => tournamentRefs.includes(match.tournamentRef)));
  }
  fetchTeams(names: readonly string[]): Promise<ProviderTeam[]> {
    this.teamRequests.push(names);
    return Promise.resolve(this.teams.filter((team) => names.includes(team.name)));
  }
}

export class StubEmojiStore implements TeamEmojiStore {
  readonly created: { name: string; imageUrl: string }[] = [];
  failFor = new Set<string>();

  create(name: string, imageUrl: string): Promise<string> {
    if (this.failFor.has(name)) return Promise.reject(new Error('upload failed'));
    this.created.push({ name, imageUrl });
    return Promise.resolve(`emoji-${name}`);
  }
}
