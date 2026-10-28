export interface TeamEmojiStore {
  /**
   * Uploads a logo as a custom emoji usable by the bot everywhere and returns its id
   * (or the id of an emoji already bearing that name).
   */
  create(name: string, imageUrl: string): Promise<string>;
}
