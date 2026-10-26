import { accessOf, type Guild } from '../../domain/guild/guild.js';
import {
  notificationKeys,
  planLockNotifications,
  type LockGroup,
} from '../../domain/schedule/lock-notifications.js';
import type { MatchId } from '../../domain/shared/ids.js';
import type { CalendarRepository } from '../ports/calendar-repository.js';
import type { Clock } from '../ports/clock.js';
import type { DispatchLog } from '../ports/dispatch-log.js';
import type { GuildMessenger } from '../ports/guild-messenger.js';
import type { GuildRepository } from '../ports/guild-repository.js';
import type { Logger } from '../ports/logger.js';
import type { PredictionRepository } from '../ports/prediction-repository.js';
import type { PublicationId, PublicationRepository } from '../ports/publication-repository.js';
import type { ResultOverrideRepository } from '../ports/result-override-repository.js';
import { scopeWeeks } from '../read-models/publication-scope.js';
import { loadDistributions } from '../read-models/vote-distributions.js';
import type { MatchView, WeekView } from '../read-models/views.js';
import type { LockCalculatorFactory } from './lock-calculator.js';

const DAY_MS = 86_400_000;

/** Reminders before each lock and vote reveals after it, for the weeks announced on each server. */
export class SendLockNotifications {
  constructor(
    private readonly guilds: GuildRepository,
    private readonly publications: PublicationRepository,
    private readonly calendar: CalendarRepository,
    private readonly predictions: PredictionRepository,
    private readonly dispatchLog: DispatchLog,
    private readonly resultOverrides: ResultOverrideRepository,
    private readonly locks: LockCalculatorFactory,
    private readonly messenger: GuildMessenger,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async executeForAll(): Promise<void> {
    for (const guild of await this.guilds.listActive()) {
      try {
        await this.notify(guild);
      } catch (error) {
        this.logger.error({ guildId: guild.id, err: error }, 'Lock notifications failed');
      }
    }
  }

  private async notify(guild: Guild): Promise<void> {
    if (!guild.settings || accessOf(guild) !== 'allowed') return;
    const { settings } = guild;
    const now = this.clock.now();

    const publications = await this.publications.findActive(guild.id, new Date(now.getTime() - DAY_MS));
    const allWeeks = await this.calendar.findWeekViews([
      ...new Set(publications.flatMap((publication) => publication.weekIds)),
    ]);
    // Only matches already announced are reminded and revealed (a week may be announced day by day).
    const publicationOfMatch = new Map<MatchId, PublicationId>();
    for (const publication of publications) {
      const covered = scopeWeeks(
        allWeeks.filter((week) => publication.weekIds.includes(week.week.id)),
        publication.day,
        settings.timeZone,
      );
      for (const match of covered.flatMap((week) => week.matches))
        publicationOfMatch.set(match.id, publication.id);
    }
    const weeks = allWeeks.map((week) => ({
      ...week,
      matches: week.matches.filter((match) => publicationOfMatch.has(match.id)),
    }));
    if (publicationOfMatch.size === 0) return;

    const locks = this.locks.forGuild(guild.id, settings);
    const overrides = await this.resultOverrides.findForMatches(
      guild.id,
      weeks.flatMap((week) => week.matches.map((match) => match.id)),
    );
    const notifiable = [];
    for (const week of weeks) {
      for (const match of week.matches) {
        notifiable.push({
          id: match.id,
          weekId: week.week.id,
          lockAt: await locks.lockAtOf(match),
          predictable:
            match.status === 'scheduled' &&
            match.team1 !== null &&
            match.team2 !== null &&
            !overrides.has(match.id),
        });
      }
    }
    const sent = await this.dispatchLog.findSent(guild.id, notificationKeys(notifiable));
    const plan = planLockNotifications(notifiable, settings.reminders, now, sent);
    const weekById = new Map(weeks.map((week) => [week.week.id, week]));

    for (const group of plan.reminders) {
      const week = weekById.get(group.weekId);
      const publicationId = publicationOfMatch.get(group.matchIds[0] ?? -1);
      if (!week || publicationId === undefined) continue;
      await this.messenger.sendLockReminder({
        guildId: guild.id,
        channelId: settings.channelId,
        pingRoleId: settings.pingRoleId,
        locale: settings.locale,
        publicationId,
        competitionName: week.competitionName,
        weekName: week.week.name,
        lockAt: group.lockAt,
        matches: matchesOf(week, group),
      });
      await this.dispatchLog.record(guild.id, group.key, now);
      this.logger.info({ guildId: guild.id, key: group.key }, 'Lock reminder sent');
    }

    for (const group of plan.reveals) {
      const week = weekById.get(group.weekId);
      if (!week) continue;
      const matches = matchesOf(week, group);
      const distributions = await loadDistributions(this.predictions, guild.id, matches);
      const revealed = matches.flatMap((match) => {
        const distribution = distributions.get(match.id);
        return distribution && distribution.total > 0 ? [{ match, distribution }] : [];
      });
      // Nobody voted: nothing worth posting, but the reveal is done.
      if (revealed.length > 0) {
        await this.messenger.revealVotes({
          guildId: guild.id,
          channelId: settings.channelId,
          locale: settings.locale,
          competitionName: week.competitionName,
          weekName: week.week.name,
          matches: revealed,
        });
      }
      await this.dispatchLog.record(guild.id, group.key, now);
      this.logger.info({ guildId: guild.id, key: group.key, matches: revealed.length }, 'Votes revealed');
    }
  }
}

function matchesOf(week: WeekView, group: LockGroup): MatchView[] {
  return week.matches.filter((match) => group.matchIds.includes(match.id));
}
