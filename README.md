# PronoBot

Bot Discord de pronostics sur les matchs esport League of Legends, semaine par semaine.
Pas d'argent ni de monnaie virtuelle : des points et des classements. Compétitions au lancement : **Worlds** et **LEC**.

Les données (calendrier, équipes, logos, résultats) viennent de l'API Cargo de [Leaguepedia](https://lol.fandom.com),
mises en cache dans PostgreSQL. Les commandes Discord ne tapent jamais l'API directement.

> État : **Phase 4**. Onboarding et `/configure`, sync Leaguepedia, publication hebdomadaire, vote par boutons,
> rappels et répartition des votes au lock, `/matches`, résultats et calcul des points, `/admin open|close|result|cancel|recalc`,
> classements (`/leaderboard`), `/mypronos` et récaps automatiques.
> Les autres commandes admin, les stats et les backups arrivent dans les phases suivantes.

## Sommaire

- [Fonctionnement](#fonctionnement)
- [Prérequis](#prérequis)
- [Créer le bot Discord](#créer-le-bot-discord)
- [Accès à Leaguepedia](#accès-à-leaguepedia)
- [Variables d'environnement](#variables-denvironnement)
- [Développement local](#développement-local)
- [Déploiement (docker compose)](#déploiement-docker-compose)
- [Architecture](#architecture)
- [Ajouter une compétition](#ajouter-une-compétition)

## Fonctionnement

1. À l'arrivée sur un serveur, le bot envoie un message de bienvenue (FR/EN). Il l'envoie dans le salon système, sinon dans
   le premier salon où il peut écrire, sinon en DM au propriétaire. Il reste **inactif** tant qu'un admin n'a pas lancé `/configure`.
2. `/configure` (permission « Gérer le serveur ») ouvre un assistant éphémère en 9 étapes : langue, rôle à mentionner, salon,
   compétitions, fuseau horaire, jour et heure de publication, mode et délai de fermeture des votes, récap, rappels.
   Chaque étape propose « Garder la valeur par défaut ». Rien n'est enregistré avant « Valider », qui vérifie d'abord
   les permissions du bot dans le salon choisi.
3. Le calendrier est synchronisé depuis Leaguepedia toutes les 6 h. Une **semaine** correspond à un onglet du calendrier
   Leaguepedia (« Week 3 », « Round 2 », « Quarterfinals »…). Une **journée** correspond à son `MatchDay`.
4. Au créneau de publication (mardi 10:00 par défaut), le bot publie les semaines qui commencent avant le prochain créneau.
   Il mentionne le rôle et ajoute un bouton « Faire mes pronos ».
5. Le bouton ouvre un parcours éphémère match par match : vainqueur pour un Bo1, score exact pour un Bo3/Bo5.
   Les pronos sont modifiables jusqu'à la fermeture des votes. Un vote compte si l'interaction Discord est antérieure au lock.
6. Si les rappels sont activés, le bot mentionne le rôle X minutes avant chaque fermeture des votes (une fois par groupe de
   matchs qui ferment ensemble).
7. Les votes restent cachés jusqu'au lock. Ensuite, le bot publie la répartition des votes du serveur (ex. 70 % G2 / 30 % FNC,
   avec le score le plus joué), qui s'affiche aussi dans le parcours et dans `/matches`.
8. L'annonce publiée est mise à jour automatiquement quand le calendrier change (équipes connues, horaires, logos), sans
   mentionner le rôle une seconde fois.
9. Pendant les fenêtres de match, les résultats sont récupérés toutes les 5 minutes, puis les points sont calculés : bon
   vainqueur 1 pt, score exact (Bo3/Bo5) +2 pts, barème configurable par compétition. Le calcul est idempotent : il peut
   tourner autant de fois que nécessaire sans fausser les points.
10. Un admin peut corriger un résultat ou annuler un match pour son serveur. Un match annulé n'est ni gagnant ni perdant :
    ses pronos sont ignorés.
11. Une fois tous les résultats d'une journée ou d'une semaine connus (selon le réglage « Récap »), le bot publie un récap
    par compétition : résultats, part de bons pronos du serveur sur chaque match, meilleurs pronostiqueurs de la période et
    top 5 du split/tournoi. Quand un split ou un tournoi est terminé, il publie le classement final. Les récaps ne mentionnent
    personne et ne concernent que les semaines publiées sur le serveur.
12. Les classements sont calculés à la lecture depuis les pronos notés : semaine, split/tournoi (une « saison » Leaguepedia :
    saison régulière + playoffs, ou Play-In + Main Event) et all time. Ils repartent de zéro à chaque split, les splits passés
    restent consultables. Un joueur arrivé en cours de route part de 0 ; les égalités restent ex aequo (1, 1, 3).
13. Si le rôle ou le salon configuré est supprimé, le bot se met en pause et prévient les admins.

### Commandes

| Commande                                        | Qui              | Effet                                                                        |
| ----------------------------------------------- | ---------------- | ---------------------------------------------------------------------------- |
| `/configure`                                    | Gérer le serveur | Assistant de configuration (obligatoire avant toute utilisation)             |
| `/matches [semaine] [compétition]`              | Tous             | Matchs de la semaine actuelle, précédente ou suivante, avec l'état des votes |
| `/mypronos [semaine] [compétition]`             | Tous             | Tes pronos de la semaine, les résultats, tes points et ton total             |
| `/leaderboard [période] [compétition] [saison]` | Tous             | Classement de la semaine, du split/tournoi (par défaut) ou all time          |
| `/admin open semaine:… \| match:…`              | Gérer le serveur | Rouvre les votes jusqu'au début de chaque match                              |
| `/admin close semaine:… \| match:…`             | Gérer le serveur | Ferme les votes immédiatement                                                |
| `/admin result match:… résultat:…`              | Gérer le serveur | Force ou corrige un résultat (ou revient à celui de Leaguepedia)             |
| `/admin cancel match:… [restaurer]`             | Gérer le serveur | Annule un match, ses pronos sont ignorés (`restaurer` annule l'annulation)   |
| `/admin recalc`                                 | Gérer le serveur | Recalcule tous les points du serveur                                         |

Les réponses de `/matches`, `/mypronos` et `/admin` sont éphémères ; `/leaderboard` répond dans le salon, sans mentionner
personne. Sans compétition, `/leaderboard` additionne les compétitions activées (toutes pour l'all time) ; l'option `saison`
propose en autocomplétion les splits et tournois passés. Les options `semaine`, `match` et `résultat` de `/admin` proposent leurs
valeurs en autocomplétion : matchs à venir pour `open`/`close`, matchs récents pour `result`/`cancel`, et pour `résultat`, les
scores possibles selon le format du match.

## Prérequis

- Node.js 26 et pnpm 10 (développement)
- Docker et Docker Compose (base de données, tests d'intégration, déploiement)

## Créer le bot Discord

1. Sur <https://discord.com/developers/applications>, créer une application.
2. Récupérer l'**Application ID** (onglet _General Information_) : c'est `DISCORD_CLIENT_ID`.
3. Onglet _Bot_ : générer le **token** (`DISCORD_TOKEN`). Aucun _privileged intent_ n'est nécessaire.
4. Inviter le bot sur le serveur de jeu avec les scopes `bot` et `applications.commands`. Permissions : voir les salons,
   envoyer des messages, intégrer des liens, utiliser des emojis externes, mentionner tous les rôles (412672).

   `https://discord.com/oauth2/authorize?client_id=<CLIENT_ID>&scope=bot+applications.commands&permissions=412672`

5. **Serveur(s) d'emojis** (logos des équipes) : créer un serveur dédié, y inviter le bot avec la permission
   « Gérer les expressions » (1073741824), puis renseigner son id dans `EMOJI_GUILD_IDS`. Un bot peut utiliser les emojis de
   tous les serveurs où il se trouve, donc les logos s'affichent partout. Un serveur sans boost contient 50 emojis. Il suffit
   d'ajouter d'autres ids, séparés par des virgules, quand il est plein.

   `https://discord.com/oauth2/authorize?client_id=<CLIENT_ID>&scope=bot&permissions=1073741824`

Les commandes slash sont enregistrées automatiquement au démarrage. Elles sont globales par défaut, ou limitées à
`DISCORD_DEV_GUILD_ID` pour des mises à jour instantanées pendant le développement.

## Accès à Leaguepedia

Fandom bride les requêtes Cargo anonymes au point de les rendre inutilisables. Il faut un compte :

1. Créer un compte Fandom et **confirmer l'adresse email** (<https://lol.fandom.com/wiki/Special:Preferences>).
2. Sur <https://lol.fandom.com/wiki/Special:BotPasswords>, créer un bot (ex. `pronobot`) et cocher
   _Create, query and delete data through the Cargo extension_.
3. Renseigner `LEAGUEPEDIA_BOT_USER=NomDuCompte@pronobot` et `LEAGUEPEDIA_BOT_PASSWORD=<secret généré>`.

Le client sérialise les requêtes : une toutes les `LEAGUEPEDIA_MIN_INTERVAL_MS` ms, soit 8 s par défaut. Il vérifie la
session à chaque appel (`assert=user`) et applique un backoff exponentiel sur les rate limits et les erreurs transitoires.

## Variables d'environnement

Copier `.env.example` vers `.env`. Le fichier `.env` n'est jamais commité.

| Variable                                              | Requise | Défaut                | Rôle                                                               |
| ----------------------------------------------------- | ------- | --------------------- | ------------------------------------------------------------------ |
| `DISCORD_TOKEN`                                       | oui     |                       | Token du bot                                                       |
| `DISCORD_CLIENT_ID`                                   | oui     |                       | Application ID                                                     |
| `DISCORD_DEV_GUILD_ID`                                | non     |                       | Enregistre les commandes sur ce seul serveur                       |
| `EMOJI_GUILD_IDS`                                     | non     |                       | Serveurs hébergeant les emojis de logos (séparés par des virgules) |
| `LEAGUEPEDIA_BOT_USER`                                | oui     |                       | `Compte@NomDuBot`                                                  |
| `LEAGUEPEDIA_BOT_PASSWORD`                            | oui     |                       | Secret du Bot Password                                             |
| `LEAGUEPEDIA_CONTACT`                                 | non     | `https://github.com/` | Contact ajouté au User-Agent                                       |
| `LEAGUEPEDIA_MIN_INTERVAL_MS`                         | non     | `8000`                | Délai minimal entre deux requêtes                                  |
| `DATABASE_URL`                                        | oui     |                       | URL PostgreSQL (construite automatiquement par docker compose)     |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | compose |                       | Identifiants de la base                                            |
| `NODE_ENV`                                            | non     | `production`          | `development` active les logs lisibles                             |
| `LOG_LEVEL`                                           | non     | `info`                | `fatal` à `trace`                                                  |
| `HEALTH_PORT`                                         | non     | `3000`                | Port de `GET /health`                                              |

## Développement local

```bash
pnpm install
cp .env.example .env            # puis remplir les valeurs
docker compose up -d postgres   # base locale (exposez le port 5432 si besoin, cf. ci-dessous)
pnpm dev                        # bot en watch mode
```

Pour accéder à la base depuis l'hôte, ajouter `ports: ["5432:5432"]` au service `postgres`, ou lancer un conteneur à part.

| Commande                                       | Effet                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm test`                                    | Tests unitaires                                                              |
| `pnpm test:integration`                        | Tests d'intégration sur un vrai PostgreSQL (Testcontainers, Docker requis)   |
| `pnpm test:all`                                | Tout, avec couverture et seuils (domaine et application ≥ 95 %)              |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Qualité                                                                      |
| `pnpm db:generate --name <nom>`                | Génère une migration après modification de `src/infrastructure/db/schema.ts` |
| `pnpm build`                                   | Compile vers `dist/`                                                         |

Les migrations versionnées (`drizzle/`) sont appliquées automatiquement au démarrage.

## Déploiement (docker compose)

Sur le serveur (Debian, Docker installé) :

```bash
git clone <repo> pronobot && cd pronobot
cp .env.example .env && nano .env      # tokens, Bot Password, POSTGRES_PASSWORD
docker compose up -d --build
docker compose logs -f bot
```

- Le conteneur `bot` expose un healthcheck (`GET /health` : base joignable et connexion Discord prête).
- Les jobs planifiés sont persistés par pg-boss dans le schéma `pgboss` et survivent aux redémarrages :
  - `schedule-sync` (toutes les 6 h) : sync Leaguepedia, calcul des points, récaps dus, emojis des logos, mise à jour des annonces ;
  - `guild-tick` (chaque minute) : publications dues, rappels avant le lock, révélation des votes après le lock ;
  - `results-poll` (toutes les 5 min) : uniquement pendant une fenêtre de match, récupère les résultats et calcule les points ;
    publie ensuite les récaps dus (y compris après une correction d'admin).
- Mise à jour : `git pull && docker compose up -d --build`.

## Architecture

Clean architecture / hexagonale. Les dépendances pointent vers le domaine, et des règles ESLint empêchent les imports interdits.

```
src/
├─ domain/          Règles métier pures : matchs, choix de prono, lock, points, classements, récaps, réglages serveur
├─ application/     Use cases + ports (interfaces) : MatchDataProvider, repositories, GuildMessenger…
├─ infrastructure/  Adapters : Drizzle/PostgreSQL, client Leaguepedia, pg-boss, pino, healthcheck
├─ interfaces/
│  └─ discord/      Commandes, assistant /configure, parcours de pronos, embeds, i18n FR/EN
├─ config/          Validation de l'environnement (zod), catalogue des compétitions
└─ main.ts          Composition root (injection de dépendances, pas de singletons)
```

- **Horloge injectable** : tout ce qui dépend du temps se teste avec une horloge fixe.
- **Locks calculés, jamais stockés** : si Leaguepedia déplace un match, la fermeture des votes suit automatiquement.
- **Flux Discord sans état serveur** : les `customId` portent tout le contexte (publication, match, choix), ce qui permet
  à un parcours de survivre à un redémarrage. Seul le brouillon de `/configure` vit en mémoire (15 min), puisque rien
  n'est enregistré avant validation.
- **Classements calculés à la lecture** : agrégats SQL sur les pronos notés, rien à resynchroniser après une correction.
- **Notifications exactement une fois** : rappels, révélations et récaps passent par un journal d'envoi (`dispatch_log`).
- **Multi-serveur** : tout est scopé par `guild_id`, sans aucun id de serveur en dur.

## Ajouter une compétition

Ajouter une entrée dans `src/config/competitions.ts` : identifiant, nom, `league` Leaguepedia (table `Tournaments`),
filtre optionnel sur les pages de tournoi, barème. Aucun code métier à toucher. Les serveurs l'activent ensuite via `/configure`.

```ts
{ id: 'lck', name: 'LCK', source: { league: 'LoL Champions Korea' }, scoring: DEFAULT_SCORING }
```

---

Données : [Leaguepedia](https://lol.fandom.com) (CC BY-SA 3.0). Projet non affilié à Riot Games.
