import type { Logger } from '../../application/ports/logger.js';
import type { CheckGuildAccess } from '../../application/use-cases/check-guild-access.js';
import type { ConfigureGuild } from '../../application/use-cases/configure-guild.js';
import type { GetConfigurationDraft } from '../../application/use-cases/get-configuration-draft.js';
import type { GetPredictionJourney } from '../../application/use-cases/get-prediction-journey.js';
import type { HandleResourceDeleted } from '../../application/use-cases/handle-resource-deleted.js';
import type { LeaveGuild } from '../../application/use-cases/leave-guild.js';
import type { ListLockTargets } from '../../application/use-cases/list-lock-targets.js';
import type { ListWeekMatches } from '../../application/use-cases/list-week-matches.js';
import type { ReconcileGuilds } from '../../application/use-cases/reconcile-guilds.js';
import type { RegisterGuild } from '../../application/use-cases/register-guild.js';
import type { SetLockOverride } from '../../application/use-cases/set-lock-override.js';
import type { SubmitPrediction } from '../../application/use-cases/submit-prediction.js';
import type { Competition } from '../../domain/competition/competition.js';
import type { GuildId } from '../../domain/shared/ids.js';
import type { WizardSessionStore } from './flows/wizard-session-store.js';

/** Everything the Discord layer needs, wired by the composition root. */
export interface DiscordDependencies {
  readonly logger: Logger;
  readonly competitions: readonly Competition[];
  readonly wizardSessions: WizardSessionStore;
  /** Servers used only to host team emojis: never greeted nor configured. */
  readonly emojiHostGuildIds: ReadonlySet<GuildId>;
  readonly useCases: {
    readonly checkGuildAccess: CheckGuildAccess;
    readonly getConfigurationDraft: GetConfigurationDraft;
    readonly configureGuild: ConfigureGuild;
    readonly getPredictionJourney: GetPredictionJourney;
    readonly submitPrediction: SubmitPrediction;
    readonly registerGuild: RegisterGuild;
    readonly leaveGuild: LeaveGuild;
    readonly handleResourceDeleted: HandleResourceDeleted;
    readonly reconcileGuilds: ReconcileGuilds;
    readonly listWeekMatches: ListWeekMatches;
    readonly listLockTargets: ListLockTargets;
    readonly setLockOverride: SetLockOverride;
  };
}
