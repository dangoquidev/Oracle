import type { LockPolicy } from '../lock/lock-policy.js';
import type { PublishSchedule } from '../schedule/publish-schedule.js';
import type { ChannelId, CompetitionId, RoleId } from '../shared/ids.js';
import type {
  GuildSettings,
  GuildSettingsDraft,
  Locale,
  RecapFrequency,
  ReminderSettings,
} from './guild-settings.js';

/** One admin change to live settings: nested values may be changed field by field. */
export interface SettingsPatch {
  readonly locale?: Locale;
  readonly pingRoleId?: RoleId;
  readonly channelId?: ChannelId;
  readonly timeZone?: string;
  readonly recapFrequency?: RecapFrequency;
  readonly publish?: Partial<PublishSchedule>;
  readonly lock?: Partial<LockPolicy>;
  readonly reminders?: Partial<ReminderSettings>;
  /** Enables or disables a single competition. */
  readonly competition?: { readonly id: CompetitionId; readonly enabled: boolean };
}

export function isEmptyPatch(patch: SettingsPatch): boolean {
  const values: unknown[] = Object.values(patch);
  return values.every(
    (value) =>
      value === undefined || (typeof value === 'object' && value !== null && Object.keys(value).length === 0),
  );
}

/** Settings once the patch is applied, still to be validated. */
export function applySettingsPatch(settings: GuildSettings, patch: SettingsPatch): GuildSettingsDraft {
  const { publish, lock, reminders, competition, ...plain } = patch;
  return {
    ...settings,
    ...plain,
    publish: { ...settings.publish, ...publish },
    lock: { ...settings.lock, ...lock },
    reminders: { ...settings.reminders, ...reminders },
    competitionIds: competition ? toggled(settings.competitionIds, competition) : settings.competitionIds,
  };
}

function toggled(
  ids: readonly CompetitionId[],
  { id, enabled }: { readonly id: CompetitionId; readonly enabled: boolean },
): CompetitionId[] {
  const others = ids.filter((candidate) => candidate !== id);
  return enabled ? [...others, id] : others;
}
