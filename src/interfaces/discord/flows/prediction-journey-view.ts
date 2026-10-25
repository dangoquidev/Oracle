import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type {
  JourneyItem,
  PredictionJourney,
} from '../../../application/use-cases/get-prediction-journey.js';
import { sameChoice, type PredictionChoice } from '../../../domain/prediction/prediction-choice.js';
import { encodePrediction } from '../components/custom-id.js';
import { BRAND_COLOR, type MessageView } from '../components/payload.js';
import { messages, type Messages } from '../i18n/index.js';
import { choiceLabel, fullDateTime, matchup, relative, truncate } from '../embeds/formatting.js';

const BUTTONS_PER_ROW = 3;

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

/** Where to land when opening the journey: the first open match still lacking a pick. */
export function startIndex(journey: PredictionJourney): number {
  const firstMissing = journey.items.findIndex((item) => item.state === 'open' && item.current === null);
  if (firstMissing >= 0) return firstMissing;
  return Math.max(
    0,
    journey.items.findIndex((item) => item.state === 'open'),
  );
}

export function clampIndex(journey: PredictionJourney, index: number): number {
  return Math.min(Math.max(index, 0), Math.max(journey.items.length - 1, 0));
}

export function renderJourneyStep(
  journey: PredictionJourney,
  index: number,
  locale: PredictionJourney['locale'],
  useEmojis: boolean,
  notice: string | null = null,
): MessageView {
  const t = messages(locale);
  const item = journey.items[index];
  if (!item) return renderJourneySummary(journey, locale, useEmojis, notice);

  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setAuthor({ name: `${item.competitionName} · ${item.weekName}` })
    .setTitle(t.journey.title(index + 1, journey.items.length))
    .setDescription(
      [
        `## ${matchup(item.match, t, useEmojis)}`,
        item.state === 'open'
          ? item.match.bestOf === 1
            ? t.journey.pickWinner
            : t.journey.pickScore
          : t.journey.state[item.state],
        notice ?? '',
      ]
        .filter((line) => line.length > 0)
        .join('\n'),
    )
    .addFields(
      { name: t.journey.when, value: fullDateTime(item.match.scheduledAt), inline: true },
      { name: t.journey.format, value: t.announcement.format(item.match.bestOf), inline: true },
      { name: t.journey.lock, value: relative(item.lockAt), inline: true },
      {
        name: t.journey.yourPick,
        value: item.current ? choiceLabel(item.current, item.match, t) : t.journey.noPick,
      },
    )
    .setFooter({ text: t.common.dataCredit });

  return {
    embeds: [embed],
    components: [...choiceRows(journey, item, t, useEmojis), navigationRow(journey, index, t)],
  };
}

export function renderJourneySummary(
  journey: PredictionJourney,
  locale: PredictionJourney['locale'],
  useEmojis: boolean,
  notice: string | null = null,
): MessageView {
  const t = messages(locale);
  const lines = journey.items.map((item) => {
    const pick = item.current ? choiceLabel(item.current, item.match, t) : '—';
    const icon = item.state === 'open' ? (item.current ? '✅' : '▫️') : '🔒';
    return `${icon} ${matchup(item.match, t, useEmojis)} → **${pick}**`;
  });
  const embed = new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(t.journey.summaryTitle)
    .setDescription(
      truncate(
        [notice, ...lines, '', `-# ${t.journey.summaryHint}`].filter((l) => l !== null).join('\n'),
        4096,
      ),
    );

  const back = new ButtonBuilder()
    .setCustomId(
      encodePrediction({ action: 'go', publicationId: journey.publicationId, index: startIndex(journey) }),
    )
    .setLabel(t.journey.backToMatches)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(journey.items.length === 0);
  return {
    embeds: [embed],
    components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(back)],
  };
}

function choiceRows(journey: PredictionJourney, item: JourneyItem, t: Messages, useEmojis: boolean): Row[] {
  const buttons = item.choices.map((choice) => choiceButton(journey, item, choice, t, useEmojis));
  const rows: Row[] = [];
  for (let start = 0; start < buttons.length; start += BUTTONS_PER_ROW) {
    rows.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        buttons.slice(start, start + BUTTONS_PER_ROW),
      ),
    );
  }
  return rows;
}

function choiceButton(
  journey: PredictionJourney,
  item: JourneyItem,
  choice: PredictionChoice,
  t: Messages,
  useEmojis: boolean,
): ButtonBuilder {
  const selected = item.current !== null && sameChoice(item.current, choice);
  const button = new ButtonBuilder()
    .setCustomId(
      encodePrediction({
        action: 'pick',
        publicationId: journey.publicationId,
        matchId: item.match.id,
        choice,
      }),
    )
    .setLabel(choiceLabel(choice, item.match, t))
    .setStyle(selected ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(item.state !== 'open');
  const team = choice.kind === 'winner' ? (choice.winner === 1 ? item.match.team1 : item.match.team2) : null;
  if (useEmojis && team?.emojiId) button.setEmoji({ id: team.emojiId });
  return button;
}

function navigationRow(journey: PredictionJourney, index: number, t: Messages): Row {
  const { publicationId } = journey;
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(encodePrediction({ action: 'go', publicationId, index: Math.max(index - 1, 0) }))
      .setLabel(t.journey.previous)
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index === 0),
    new ButtonBuilder()
      .setCustomId(encodePrediction({ action: 'summary', publicationId }))
      .setLabel(t.journey.summary)
      .setEmoji('📋')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(encodePrediction({ action: 'go', publicationId, index: index + 1 }))
      .setLabel(t.journey.next)
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index >= journey.items.length - 1),
  );
}
