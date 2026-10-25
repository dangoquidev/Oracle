export interface TeamEmojiStore {
  /** Uploads a logo as a custom emoji usable by the bot everywhere and returns its id. */
  create(name: string, imageUrl: string): Promise<string>;
}
