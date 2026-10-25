import { DEFAULT_LOCK_POLICY, type LockPolicy } from '../lock/lock-policy.js';
import { DEFAULT_PUBLISH_SCHEDULE, type PublishSchedule } from '../schedule/publish-schedule.js';
import type { ChannelId, CompetitionId, RoleId } from '../shared/ids.js';
import { err, ok, type Result } from '../shared/result.js';
import { isValidTimeZone } from '../shared/time-zone.js';

export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export type RecapFrequency = 'daily' | 'weekly';

export interface ReminderSettings {
  readonly enabled: boolean;
  readonly offsetMinutes: number;
}

export interface GuildSettings {
  readonly locale: Locale;
  readonly pingRoleId: RoleId;
  readonly channelId: ChannelId;
  readonly competitionIds: readonly CompetitionId[];
  readonly timeZone: string;
  readonly publish: PublishSchedule;
  readonly lock: LockPolicy;
  readonly recapFrequency: RecapFrequency;
  readonly reminders: ReminderSettings;
}

/** A settings draft: everything may still be missing while an admin goes through the wizard. */
export type GuildSettingsDraft = { -readonly [K in keyof GuildSettings]?: GuildSettings[K] };

export function defaultSettings(
  competitionIds: readonly CompetitionId[],
): Omit<GuildSettings, 'pingRoleId' | 'channelId'> {
  return {
    locale: 'fr',
    competitionIds,
    timeZone: 'Europe/Paris',
    publish: DEFAULT_PUBLISH_SCHEDULE,
    lock: DEFAULT_LOCK_POLICY,
    recapFrequency: 'weekly',
    reminders: { enabled: true, offsetMinutes: 60 },
  };
}

export type SettingsError =
  | 'missing-role'
  | 'missing-channel'
  | 'no-competition'
  | 'unknown-competition'
  | 'invalid-time-zone'
  | 'invalid-publish-time'
  | 'invalid-lock-offset'
  | 'invalid-reminder-offset';

const MAX_OFFSET_MINUTES = 7 * 24 * 60;

export function validateSettings(
  draft: GuildSettingsDraft,
  knownCompetitionIds: ReadonlySet<CompetitionId>,
): Result<GuildSettings, SettingsError[]> {
  const merged = { ...defaultSettings([...knownCompetitionIds]), ...draft };
  const errors: SettingsError[] = [];

  if (!merged.pingRoleId) errors.push('missing-role');
  if (!merged.channelId) errors.push('missing-channel');
  if (merged.competitionIds.length === 0) errors.push('no-competition');
  if (merged.competitionIds.some((id) => !knownCompetitionIds.has(id))) errors.push('unknown-competition');
  if (!isValidTimeZone(merged.timeZone)) errors.push('invalid-time-zone');
  if (!isValidPublishTime(merged.publish)) errors.push('invalid-publish-time');
  if (!isValidOffset(merged.lock.offsetMinutes)) errors.push('invalid-lock-offset');
  if (!isValidOffset(merged.reminders.offsetMinutes)) errors.push('invalid-reminder-offset');

  if (errors.length > 0 || !merged.pingRoleId || !merged.channelId) return err(errors);
  return ok({ ...merged, pingRoleId: merged.pingRoleId, channelId: merged.channelId });
}

function isValidPublishTime({ weekday, hour, minute }: PublishSchedule): boolean {
  return (
    Number.isInteger(weekday) &&
    weekday >= 1 &&
    weekday <= 7 &&
    Number.isInteger(hour) &&
    hour >= 0 &&
    hour <= 23 &&
    Number.isInteger(minute) &&
    minute >= 0 &&
    minute <= 59
  );
}

function isValidOffset(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= MAX_OFFSET_MINUTES;
}
