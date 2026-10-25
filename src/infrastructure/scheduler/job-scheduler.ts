import { PgBoss } from 'pg-boss';
import type { Logger } from '../../application/ports/logger.js';

export interface RecurringTask {
  readonly name: string;
  /** Cron expression, evaluated in UTC. */
  readonly cron: string;
  readonly run: () => Promise<unknown>;
}

/**
 * Recurring jobs persisted in PostgreSQL through pg-boss: they survive restarts, never overlap
 * (exclusive queues) and are retried with backoff when they fail.
 */
export class JobScheduler {
  private readonly boss: PgBoss;

  constructor(
    connectionString: string,
    private readonly logger: Logger,
  ) {
    this.boss = new PgBoss({ connectionString, schema: 'pgboss' });
    this.boss.on('error', (error) => {
      this.logger.error({ err: error }, 'Job scheduler error');
    });
  }

  async start(tasks: readonly RecurringTask[]): Promise<void> {
    await this.boss.start();
    for (const task of tasks) {
      await this.boss.createQueue(task.name, {
        policy: 'exclusive',
        retryLimit: 3,
        retryDelay: 60,
        retryBackoff: true,
        expireInSeconds: 30 * 60,
      });
      await this.boss.schedule(task.name, task.cron, null, { tz: 'UTC' });
      await this.boss.work(task.name, async (jobs) => {
        for (const job of jobs) {
          const startedAt = Date.now();
          try {
            await task.run();
            this.logger.debug(
              { job: task.name, jobId: job.id, durationMs: Date.now() - startedAt },
              'Job done',
            );
          } catch (error) {
            this.logger.error({ job: task.name, jobId: job.id, err: error }, 'Job failed');
            throw error;
          }
        }
      });
    }
    this.logger.info({ tasks: tasks.map((task) => task.name) }, 'Job scheduler started');
  }

  /** Queues an immediate run (ignored if one is already queued or running). */
  async trigger(name: string): Promise<void> {
    await this.boss.send(name, null);
  }

  async stop(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: 20_000 });
  }
}
