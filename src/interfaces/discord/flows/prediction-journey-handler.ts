import { MessageFlags, PermissionFlagsBits, type ButtonInteraction } from 'discord.js';
import type { PredictionJourney } from '../../../application/use-cases/get-prediction-journey.js';
import { decodePrediction, type PredictionAction } from '../components/custom-id.js';
import type { DiscordDependencies } from '../dependencies.js';
import { localeFor, messages } from '../i18n/index.js';
import {
  clampIndex,
  renderJourneyStep,
  renderJourneySummary,
  startIndex,
} from './prediction-journey-view.js';

/** Ephemeral, stateless prediction flow: every click reloads the journey from the database. */
export async function handlePredictionInteraction(
  interaction: ButtonInteraction<'cached'>,
  deps: DiscordDependencies,
): Promise<void> {
  const action = decodePrediction(interaction.customId);
  if (!action) return;

  const journeyResult = await loadJourney(interaction, action, deps);
  if (!journeyResult) return;
  const { journey, locale } = journeyResult;
  const useEmojis = interaction.appPermissions.has(PermissionFlagsBits.UseExternalEmojis);
  const t = messages(locale);

  switch (action.action) {
    case 'open':
      await interaction.reply({
        ...renderJourneyStep(journey, startIndex(journey), locale, useEmojis),
        flags: MessageFlags.Ephemeral,
      });
      return;
    case 'go':
      await interaction.update(
        renderJourneyStep(journey, clampIndex(journey, action.index), locale, useEmojis),
      );
      return;
    case 'summary':
      await interaction.update(renderJourneySummary(journey, locale, useEmojis));
      return;
    case 'pick': {
      const result = await deps.useCases.submitPrediction.execute({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        matchId: action.matchId,
        choice: action.choice,
        submittedAt: interaction.createdAt,
      });
      const refreshed = (await loadJourney(interaction, action, deps))?.journey ?? journey;
      const index = Math.max(
        0,
        refreshed.items.findIndex((item) => item.match.id === action.matchId),
      );
      if (!result.ok) {
        await interaction.update(
          renderJourneyStep(refreshed, index, locale, useEmojis, t.journey.rejected[result.error]),
        );
        return;
      }
      const nextIndex = index + 1;
      await interaction.update(
        nextIndex < refreshed.items.length
          ? renderJourneyStep(refreshed, nextIndex, locale, useEmojis, t.journey.saved)
          : renderJourneySummary(refreshed, locale, useEmojis, t.journey.saved),
      );
      return;
    }
  }
}

async function loadJourney(
  interaction: ButtonInteraction<'cached'>,
  action: PredictionAction,
  deps: DiscordDependencies,
): Promise<{ journey: PredictionJourney; locale: PredictionJourney['locale'] } | null> {
  const result = await deps.useCases.getPredictionJourney.execute(
    interaction.guildId,
    interaction.user.id,
    action.publicationId,
  );
  if (result.ok) return { journey: result.value, locale: localeFor(interaction.locale, result.value.locale) };

  const t = messages(localeFor(interaction.locale, null));
  const content =
    result.error === 'publication-not-found' ? t.journey.publicationNotFound : t.access.unconfigured;
  if (action.action === 'open') await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  else await interaction.update({ content, embeds: [], components: [] });
  return null;
}
