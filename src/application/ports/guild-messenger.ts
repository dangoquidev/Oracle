import type { Locale } from '../../domain/guild/guild-settings.js';
import type { PauseReason } from '../../domain/guild/guild.js';
import type { LeaderboardEntry } from '../../domain/leaderboard/leaderboard.js';
import type { VoteDistribution } from '../../domain/prediction/vote-distribution.js';
import type { MatchOutcome } from '../../domain/scoring/match-outcome.js';
import type { PredictionChoice } from '../../domain/prediction/prediction-choice.js';
import type { ChannelId, GuildId, RoleId, UserId } from '../../domain/shared/ids.js';
import type { MatchView, WeekView } from '../read-models/views.js';
import type { PublicationId } from './publication-repository.js';

export interface WeekAnnouncement {
  readonly guildId: GuildId;
  readonly channelId: ChannelId;
  readonly pingRoleId: RoleId;
  readonly locale: Locale;
  readonly timeZone: string;
  readonly publicationId: PublicationId;
  /** A whole week (or several), or a single day of a week whose matchups were decided as it went. */
  readonly scope: 'week' | 'day';
  readonly weeks: readonly WeekView[];
}

export interface LockReminder {
  readonly guildId: GuildId;
  readonly channelId: ChannelId;
  readonly pingRoleId: RoleId;
  readonly locale: Locale;
  readonly publicationId: PublicationId;
  readonly competitionName: string;
  readonly weekName: string;
  readonly lockAt: Date;
  readonly matches: readonly MatchView[];
}

export interface VoteReveal {
  readonly guildId: GuildId;
  readonly channelId: ChannelId;
  readonly locale: Locale;
  readonly competitionName: string;
  readonly weekName: string;
  readonly matches: readonly { readonly match: MatchView; readonly distribution: VoteDistribution }[];
}

/** A player's picks, posted in the channel once they predicted every open match of an announcement. */
export interface SharedPredictions {
  readonly guildId: GuildId;
  readonly channelId: ChannelId;
  readonly locale: Locale;
  readonly userId: UserId;
  readonly groups: readonly {
    readonly competitionName: string;
    readonly weekName: string;
    readonly picks: readonly { readonly match: MatchView; readonly choice: PredictionChoice }[];
  }[];
}

export interface RecapMatchLine {
  readonly match: MatchView;
  readonly outcome: MatchOutcome;
  /** Judged predictions on the match and how many had the right winner. */
  readonly predictions: number;
  readonly correctWinners: number;
}

/** Results and points of a match day or a week, for one competition. */
export interface MatchRecap {
  readonly guildId: GuildId;
  readonly channelId: ChannelId;
  readonly locale: Locale;
  readonly kind: 'day' | 'week';
  readonly competitionName: string;
  readonly weekName: string;
  /** First match of the recap, to name the day. */
  readonly startsAt: Date;
  readonly timeZone: string;
  readonly matches: readonly RecapMatchLine[];
  /** Best players over the recapped matches. */
  readonly standings: readonly LeaderboardEntry[];
  readonly season: { readonly name: string; readonly standings: readonly LeaderboardEntry[] } | null;
}

/** Final standings once a split or tournament is over. */
export interface SeasonRecap {
  readonly guildId: GuildId;
  readonly channelId: ChannelId;
  readonly locale: Locale;
  readonly competitionName: string;
  readonly seasonName: string;
  readonly standings: readonly LeaderboardEntry[];
  readonly players: number;
}

/** Outgoing messages to a server, rendered by the chat platform adapter. */
export interface GuildMessenger {
  /** Bilingual greeting asking an admin to run the setup. Best effort. */
  sendWelcome(guildId: GuildId): Promise<void>;
  /** Tells the admins the bot is paused and why. Best effort. */
  notifyPaused(guildId: GuildId, reason: PauseReason, locale: Locale): Promise<void>;
  /** Posts the week announcement and returns the message id. */
  announceWeeks(announcement: WeekAnnouncement): Promise<string>;
  /** Re-renders a posted announcement. Returns false when the message no longer exists. */
  updateAnnouncement(messageId: string, announcement: WeekAnnouncement): Promise<boolean>;
  /** Mentions the role shortly before votes close. */
  sendLockReminder(reminder: LockReminder): Promise<void>;
  /** Shows how the server voted once votes are closed. */
  revealVotes(reveal: VoteReveal): Promise<void>;
  sendMatchRecap(recap: MatchRecap): Promise<void>;
  sendSeasonRecap(recap: SeasonRecap): Promise<void>;
  /** Posts a player's picks in the channel, without pinging them. */
  sharePredictions(shared: SharedPredictions): Promise<void>;
}
