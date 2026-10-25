import { distributionOf, type VoteDistribution } from '../../domain/prediction/vote-distribution.js';
import type { GuildId, MatchId } from '../../domain/shared/ids.js';
import type { PredictionRepository } from '../ports/prediction-repository.js';
import type { MatchView } from './views.js';

/** Vote distribution of each given match on a server. */
export async function loadDistributions(
  predictions: PredictionRepository,
  guildId: GuildId,
  matches: readonly MatchView[],
): Promise<Map<MatchId, VoteDistribution>> {
  if (matches.length === 0) return new Map();
  const votes = await predictions.findByMatches(
    guildId,
    matches.map((match) => match.id),
  );
  return new Map(
    matches.map((match) => [
      match.id,
      distributionOf(
        votes.filter((vote) => vote.matchId === match.id).map((vote) => vote.choice),
        match.bestOf,
      ),
    ]),
  );
}
