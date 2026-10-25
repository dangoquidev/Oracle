export const fr = {
  common: {
    dataCredit: 'Données : Leaguepedia (CC BY-SA)',
    unknownTeam: 'À déterminer',
    on: 'Activé',
    off: 'Désactivé',
    none: 'Aucun',
  },
  access: {
    unconfigured: "Le bot n'est pas encore configuré, un admin doit lancer `/configure`.",
    paused: 'Le bot est en pause sur ce serveur : un admin doit relancer `/configure`.',
    guildOnly: 'Cette action ne fonctionne que sur un serveur.',
    adminOnly: 'Seuls les membres ayant la permission « Gérer le serveur » peuvent faire ça.',
  },
  errors: {
    generic: "Oups, quelque chose s'est mal passé. Réessaie dans un instant.",
    expired: 'Cette session a expiré, relance la commande.',
    botMissingPermissions: 'Il me manque des permissions pour faire ça dans ce salon. Préviens un admin.',
  },
  pause: {
    title: 'PronoBot est en pause',
    'role-deleted': 'Le rôle à mentionner a été supprimé.',
    'channel-deleted': 'Le salon de publication a été supprimé.',
    action: 'Un admin doit relancer `/configure` pour réactiver le bot.',
  },
  weekday: {
    1: 'Lundi',
    2: 'Mardi',
    3: 'Mercredi',
    4: 'Jeudi',
    5: 'Vendredi',
    6: 'Samedi',
    7: 'Dimanche',
  },
  announcement: {
    content: (role: string) => `${role} les pronos de la semaine sont ouverts !`,
    predictButton: 'Faire mes pronos',
    empty: 'Aucun match prévu.',
    format: (bestOf: number) => `Bo${bestOf}`,
  },
  journey: {
    title: (index: number, total: number) => `Match ${index}/${total}`,
    when: 'Date',
    format: 'Format',
    lock: 'Fermeture des votes',
    yourPick: 'Ton prono',
    noPick: 'Pas encore de prono',
    pickWinner: 'Choisis le vainqueur :',
    pickScore: 'Choisis le score exact :',
    state: {
      locked: '🔒 Votes fermés pour ce match.',
      'awaiting-opponents': '⏳ Les équipes ne sont pas encore connues.',
      closed: '🏁 Ce match est terminé.',
    },
    previous: 'Précédent',
    next: 'Suivant',
    summary: 'Récap',
    backToMatches: 'Revenir aux matchs',
    summaryTitle: 'Récap de tes pronos',
    summaryHint: 'Tu peux modifier tes choix jusqu’à la fermeture des votes.',
    saved: '✅ Prono enregistré.',
    rejected: {
      locked: '🔒 Trop tard, les votes sont fermés pour ce match.',
      'opponents-unknown': '⏳ Les équipes ne sont pas encore connues.',
      'match-not-open': '🏁 Ce match n’est plus ouvert aux pronos.',
      'invalid-choice': 'Ce choix n’est pas valide pour ce match.',
      'match-not-found': 'Ce match est introuvable.',
      'guild-not-active': "Le bot n'est pas actif sur ce serveur.",
    },
    publicationNotFound: 'Cette publication est introuvable.',
  },
  welcome: {
    title: 'Salut, moi c’est PronoBot ! 👋',
    body:
      'Je permets à votre serveur de pronostiquer les matchs esport League of Legends (Worlds, LEC…) chaque semaine : ' +
      'des points, des classements, et pas d’argent en jeu.',
    action: 'Un admin doit lancer `/configure` pour commencer.',
  },
  configure: {
    title: (step: number, total: number, name: string) => `Configuration · ${step}/${total} · ${name}`,
    current: 'Valeur actuelle',
    previous: 'Précédent',
    next: 'Suivant',
    keepDefault: 'Garder la valeur par défaut',
    cancel: 'Annuler',
    confirm: 'Valider',
    cancelled: 'Configuration annulée, rien n’a été modifié.',
    otherTimeZone: 'Autre fuseau…',
    timeZoneModalTitle: 'Fuseau horaire',
    timeZoneModalLabel: 'Nom IANA (ex : America/Montreal)',
    invalidTimeZone: (value: string) => `« ${value} » n’est pas un fuseau horaire valide.`,
    steps: {
      locale: { name: 'Langue', help: 'Langue utilisée par le bot sur ce serveur.' },
      role: { name: 'Rôle à mentionner', help: 'Ce rôle sera mentionné à chaque publication et rappel.' },
      channel: { name: 'Salon de publication', help: 'Le salon où le bot publie les matchs de la semaine.' },
      competitions: { name: 'Compétitions', help: 'Les compétitions sur lesquelles on pronostique.' },
      timeZone: {
        name: 'Fuseau horaire',
        help: 'Sert aux horaires de publication et au découpage des journées.',
      },
      publish: { name: 'Publication', help: 'Jour et heure de publication des matchs de la semaine.' },
      lock: {
        name: 'Fermeture des votes',
        help: 'Par journée : tous les matchs d’une journée ferment X heures avant le premier. Par match : chaque match ferme X heures avant son début.',
      },
      recap: { name: 'Récap', help: 'Fréquence du récap des résultats et des points.' },
      reminders: { name: 'Rappels', help: 'Mentionner le rôle quelque temps avant la fermeture des votes.' },
      summary: { name: 'Récapitulatif', help: 'Vérifie la configuration puis valide.' },
    },
    placeholders: {
      role: 'Choisis un rôle',
      channel: 'Choisis un salon',
      competitions: 'Choisis les compétitions',
      timeZone: 'Choisis un fuseau horaire',
      weekday: 'Jour',
      hour: 'Heure',
      offset: 'Délai',
    },
    lockMode: { 'per-day': 'Par journée', 'per-match': 'Par match' },
    recap: { daily: 'Fin de journée', weekly: 'Fin de semaine' },
    offset: (minutes: number) => formatDuration(minutes, 'min', 'h', 'j'),
    before: (duration: string) => `${duration} avant`,
    labels: {
      locale: 'Langue',
      role: 'Rôle',
      channel: 'Salon',
      competitions: 'Compétitions',
      timeZone: 'Fuseau horaire',
      publish: 'Publication',
      lock: 'Fermeture des votes',
      recap: 'Récap',
      reminders: 'Rappels',
    },
    localeNames: { fr: 'Français', en: 'English' },
    saved: '✅ Configuration enregistrée ! Le bot est actif sur ce serveur.',
    warnings: {
      'cannot-use-external-emojis':
        '⚠️ Je ne peux pas utiliser d’emojis externes dans ce salon : les logos des équipes seront remplacés par leur nom. Donne-moi « Utiliser des emojis externes » pour les afficher.',
    },
    invalid: 'La configuration est incomplète :',
    settingsErrors: {
      'missing-role': 'aucun rôle choisi',
      'missing-channel': 'aucun salon choisi',
      'no-competition': 'aucune compétition choisie',
      'unknown-competition': 'compétition inconnue',
      'invalid-time-zone': 'fuseau horaire invalide',
      'invalid-publish-time': 'horaire de publication invalide',
      'invalid-lock-offset': 'délai de fermeture invalide',
      'invalid-reminder-offset': 'délai de rappel invalide',
    },
    missingPermissions: 'Je ne pourrai pas publier correctement. À corriger :',
    issues: {
      'channel-not-found': 'Le salon choisi est introuvable.',
      'role-not-found': 'Le rôle choisi est introuvable.',
      'cannot-view-channel': 'Je ne vois pas le salon : donne-moi « Voir le salon ».',
      'cannot-send-messages': 'Je ne peux pas écrire dans le salon : donne-moi « Envoyer des messages ».',
      'cannot-embed-links': 'Je ne peux pas envoyer d’embeds : donne-moi « Intégrer des liens ».',
      'cannot-mention-role':
        'Je ne peux pas mentionner le rôle : rends-le mentionnable ou donne-moi « Mentionner @everyone, @here et tous les rôles ».',
    },
  },
  commands: {
    configure: { description: 'Configurer PronoBot sur ce serveur (assistant étape par étape)' },
  },
};

export type Messages = typeof fr;

export function formatDuration(minutes: number, minute: string, hour: string, day: string): string {
  if (minutes === 0) return `0 ${minute}`;
  if (minutes % 1440 === 0) return `${minutes / 1440} ${day}`;
  if (minutes % 60 === 0) return `${minutes / 60} ${hour}`;
  if (minutes > 60) return `${Math.floor(minutes / 60)} ${hour} ${minutes % 60}`;
  return `${minutes} ${minute}`;
}
