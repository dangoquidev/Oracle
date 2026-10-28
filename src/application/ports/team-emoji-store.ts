export interface TeamEmojiStore {
  /** Emojis already on the emoji servers (e.g. added by hand), by name. */
  existing(): Promise<ReadonlyMap<string, string>>;
  /** Uploads a logo as a custom emoji usable by the bot everywhere and returns its id. */
  create(name: string, imageUrl: string): Promise<string>;
}
