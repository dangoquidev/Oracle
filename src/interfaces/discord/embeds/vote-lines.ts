import type { MatchView } from '../../../application/read-models/views.js';
import type { VoteDistribution } from '../../../domain/prediction/vote-distribution.js';
import type { Messages } from '../i18n/index.js';
import { choiceLabel, shortName } from './formatting.js';

/** "G2 70 % · 30 % FNC · 23 votes · most picked score: 2-1 G2 (35 %)" */
export function voteLine(match: MatchView, distribution: VoteDistribution, t: Messages): string {
  if (distribution.total === 0) return t.votes.none;
  const parts = [
    t.votes.split(
      shortName(match.team1, t),
      distribution.team1Percent,
      distribution.team2Percent,
      shortName(match.team2, t),
    ),
    t.votes.count(distribution.total),
  ];
  if (distribution.topScore) {
    const label = choiceLabel({ kind: 'score', score: distribution.topScore.score }, match, t);
    parts.push(t.votes.topScore(label, distribution.topScore.percent));
  }
  return parts.join(' · ');
}
