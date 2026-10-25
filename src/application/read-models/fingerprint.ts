import type { WeekView } from './views.js';

/** Short stable hash of what an announcement shows, to detect when it needs an edit. */
export function announcementFingerprint(weeks: readonly WeekView[]): string {
  const content = weeks.map(({ week, matches }) => [
    week.id,
    week.name,
    matches.map((match) => [
      match.id,
      match.scheduledAt.getTime(),
      match.bestOf,
      match.team1?.shortName ?? null,
      match.team1?.emojiId ?? null,
      match.team2?.shortName ?? null,
      match.team2?.emojiId ?? null,
    ]),
  ]);
  return fnv1a(JSON.stringify(content));
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
