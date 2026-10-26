export interface ScheduleSyncTrigger {
  /**
   * Asks for a Leaguepedia sync as soon as possible. Returns false when one is already queued,
   * running, or was requested too recently.
   */
  request(): Promise<boolean>;
}
