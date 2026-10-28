# Oracle

[![CI](https://github.com/dangoquidev/Oracle/actions/workflows/ci.yml/badge.svg)](https://github.com/dangoquidev/Oracle/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Bot Discord de pronostics sur les matchs esport League of Legends, semaine par semaine.
Pas d'argent ni de monnaie virtuelle : des points et des classements. Compétitions au lancement : **Worlds** et **LEC**.

Les données (calendrier, équipes, logos, résultats) viennent de l'API Cargo de [Leaguepedia](https://lol.fandom.com),
mises en cache dans PostgreSQL. Les commandes Discord ne tapent jamais l'API directement.

> Version **1.0.0**. Onboarding et `/configure`, sync Leaguepedia, publication hebdomadaire, vote par boutons, rappels et
> répartition des votes au lock, résultats et calcul des points, `/matches`, `/mypronos`, `/leaderboard`, `/stats`, récaps
> automatiques, `/config`, `/admin`, alertes webhook, sauvegardes et restauration.

## Sommaire

- [Fonctionnement](#fonctionnement)
- [Prérequis](#prérequis)
- [Créer le bot Discord](#créer-le-bot-discord)
- [Accès à Leaguepedia](#accès-à-leaguepedia)
- [Variables d'environnement](#variables-denvironnement)
- [Développement local](#développement-local)
- [Déploiement sur Debian (docker compose)](#déploiement-sur-debian-docker-compose)
- [Alertes](#alertes)
- [Sauvegardes](#sauvegardes)
- [Restauration](#restauration)
- [Exploitation au quotidien](#exploitation-au-quotidien)
- [Architecture](#architecture)
- [Ajouter une compétition](#ajouter-une-compétition)
- [Licence](#licence)

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
   Il mentionne le rôle et ajoute un bouton « Faire mes pronos ». Une semaine dont les affiches ne sont pas encore toutes
   connues (rondes suisses des Worlds, playoffs) est publiée **jour par jour** : chaque journée part dès que Leaguepedia
   donne ses affiches, ou 24 h avant son premier match avec ce qui est connu (les matchs encore à déterminer s'ouvrent au
   vote dans la même annonce dès qu'ils sont connus).
5. Le bouton ouvre un parcours éphémère match par match : vainqueur pour un Bo1, score exact pour un Bo3/Bo5.
   Les pronos sont modifiables jusqu'à la fermeture des votes. Un vote compte si l'interaction Discord est antérieure au lock.
   Dès qu'un joueur a un prono sur chaque match encore ouvert de l'annonce, le bot poste ses choix dans le salon
   (« 📝 Pronos validés », sans le notifier), et à nouveau à chaque fois qu'il les modifie.
6. Si les rappels sont activés, le bot mentionne le rôle X minutes avant chaque fermeture des votes (une fois par groupe de
   matchs qui ferment ensemble).
7. Les choix de chacun sont publics : `/prono` montre qui a pronostiqué quoi sur le round en cours, même avant la fermeture.
   Au lock, le bot publie la répartition des votes du serveur (ex. 70 % G2 / 30 % FNC, avec le score le plus joué), qui
   s'affiche aussi dans le parcours et dans `/matches`.
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
13. Si le rôle ou le salon configuré est supprimé, le bot se met en pause et prévient les admins. Il repart dès qu'un admin
    choisit un nouveau rôle ou salon (`/config role`, `/config channel` ou `/configure`).
14. Chaque réglage se modifie aussi seul avec `/config <réglage>`, avec les mêmes vérifications que l'assistant (valeurs
    valides, permissions du bot dans le salon). Une sous-commande lancée sans option affiche la valeur actuelle.
15. Un admin peut exclure un joueur (`/admin ban`) : il ne peut plus voter et disparaît des classements et des récaps. Ses
    pronos sont conservés, donc `/admin unban` lui rend ses points.
16. `/admin sync` lance tout de suite une synchro Leaguepedia, sans attendre la suivante. Le calendrier étant partagé par
    tous les serveurs, une seule synchro manuelle est acceptée toutes les 10 minutes.
17. `/stats [joueur]` montre le bilan d'un joueur sur le serveur, toutes compétitions confondues : rang all time et sur le
    split/tournoi en cours, points, part de bons vainqueurs, scores exacts sur les Bo3/Bo5, série de bons vainqueurs en
    cours et record, meilleure semaine, équipe la plus souvent pronostiquée gagnante (et sa réussite), détail par compétition.

### Commandes

| Commande                                        | Qui              | Effet                                                                        |
| ----------------------------------------------- | ---------------- | ---------------------------------------------------------------------------- |
| `/configure`                                    | Gérer le serveur | Assistant de configuration (obligatoire avant toute utilisation)             |
| `/config show`                                  | Gérer le serveur | Affiche tous les réglages et l'état du bot (actif, en pause et pourquoi)     |
| `/config channel\|role\|timezone\|language`     | Gérer le serveur | Change le salon, le rôle, le fuseau horaire (autocomplété) ou la langue      |
| `/config lock [mode] [délai]`                   | Gérer le serveur | Fermeture des votes : par journée ou par match, et combien de temps avant    |
| `/config reminders [actifs] [délai]`            | Gérer le serveur | Active, désactive ou décale les rappels                                      |
| `/config recap fréquence:…`                     | Gérer le serveur | Récap en fin de journée ou en fin de semaine                                 |
| `/config publish [jour] [heure] [minute]`       | Gérer le serveur | Jour et heure de publication des matchs de la semaine                        |
| `/config competitions compétition:… active:…`   | Gérer le serveur | Active ou désactive une compétition (au moins une doit rester active)        |
| `/matches [semaine] [compétition]`              | Tous             | Matchs de la semaine actuelle, précédente ou suivante, avec l'état des votes |
| `/mypronos [semaine] [compétition]`             | Tous             | Tes pronos de la semaine, les résultats, tes points et ton total             |
| `/prono [compétition]`                          | Tous             | Les pronos de tout le monde sur le round en cours, regroupés par choix       |
| `/leaderboard [période] [compétition] [saison]` | Tous             | Classement de la semaine, du split/tournoi (par défaut) ou all time          |
| `/stats [joueur]`                               | Tous             | Bilan d'un joueur (le tien par défaut) : rangs, réussite, séries, favoris    |
| `/admin open semaine:… \| match:…`              | Gérer le serveur | Rouvre les votes jusqu'au début de chaque match                              |
| `/admin close semaine:… \| match:…`             | Gérer le serveur | Ferme les votes immédiatement                                                |
| `/admin result match:… résultat:…`              | Gérer le serveur | Force ou corrige un résultat (ou revient à celui de Leaguepedia)             |
| `/admin cancel match:… [restaurer]`             | Gérer le serveur | Annule un match, ses pronos sont ignorés (`restaurer` annule l'annulation)   |
| `/admin recalc`                                 | Gérer le serveur | Recalcule tous les points du serveur                                         |
| `/admin ban joueur:… [raison]`                  | Gérer le serveur | Exclut un joueur des pronos, des classements et des récaps                   |
| `/admin unban joueur:…`                         | Gérer le serveur | Réintègre un joueur exclu, avec tous ses points                              |
| `/admin sync`                                   | Gérer le serveur | Force une synchro Leaguepedia et fait le point sur les logos manquants       |

Les réponses de `/matches`, `/mypronos`, `/config` et `/admin` sont éphémères ; `/leaderboard`, `/stats` et `/prono` répondent dans le salon, sans
mentionner personne. Sans compétition, `/leaderboard` additionne les compétitions activées (toutes pour l'all time) ; l'option `saison`
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
2. Sur <https://lol.fandom.com/wiki/Special:BotPasswords>, créer un bot (ex. `oracle`) et cocher
   _Create, query and delete data through the Cargo extension_.
3. Renseigner `LEAGUEPEDIA_BOT_USER=NomDuCompte@oracle` et `LEAGUEPEDIA_BOT_PASSWORD=<secret généré>`.

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
| `ALERT_WEBHOOK_URL`                                   | non     |                       | Webhook Discord des alertes (désactivé si vide)                    |
| `ALERT_MENTION_USER_ID`                               | non     |                       | Utilisateur mentionné sur les alertes d'erreur                     |
| `BACKUP_DIR`                                          | non     | `backups`             | Dossier des dumps (relatif au projet ou absolu)                    |
| `BACKUP_KEEP_DAILY` / `BACKUP_KEEP_WEEKLY`            | non     | `7` / `4`             | Dumps quotidiens / hebdomadaires conservés                         |
| `BACKUP_RSYNC_TARGET`                                 | non     |                       | Copie hors site par rsync (ex. `user@nas:/srv/backups/oracle`)     |
| `RESTIC_REPOSITORY` / `RESTIC_PASSWORD_FILE`          | non     |                       | Copie hors site dans un dépôt restic                               |

Les valeurs ne doivent pas contenir de `$` : docker compose l'interpréterait comme une variable (écrire `$$` sinon).

## Développement local

```bash
pnpm install
cp .env.example .env            # puis remplir les valeurs
cp docker-compose.override.example.yml docker-compose.override.yml   # expose PostgreSQL sur 127.0.0.1:5432
docker compose up -d postgres   # base locale
pnpm dev                        # bot en watch mode
```

Seuls les fichiers `*.example` sont versionnés : `.env` et `docker-compose.override.yml` restent sur ta machine (voir
`.gitignore`). Avec `pnpm dev`, `DATABASE_URL` doit pointer sur `localhost:5432`.

| Commande                                       | Effet                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm test`                                    | Tests unitaires                                                              |
| `pnpm test:integration`                        | Tests d'intégration sur un vrai PostgreSQL (Testcontainers, Docker requis)   |
| `pnpm test:all`                                | Tout, avec couverture et seuils (domaine et application ≥ 95 %)              |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Qualité                                                                      |
| `pnpm db:generate --name <nom>`                | Génère une migration après modification de `src/infrastructure/db/schema.ts` |
| `pnpm build`                                   | Compile vers `dist/`                                                         |

Les migrations versionnées (`drizzle/`) sont appliquées automatiquement au démarrage.

## Déploiement sur Debian (docker compose)

Le bot n'ouvre aucun port vers l'extérieur : il se connecte à Discord et à Leaguepedia, rien d'autre. Un petit VPS suffit
(1 vCPU, 1 Go de RAM).

1. **Installer Docker** depuis le dépôt officiel (<https://docs.docker.com/engine/install/debian/>) :

   ```bash
   sudo apt-get update && sudo apt-get install -y ca-certificates curl git
   sudo install -m 0755 -d /etc/apt/keyrings
   sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
     https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" |
     sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
   sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
   ```

2. **Créer un compte dédié** et récupérer le projet :

   ```bash
   sudo adduser --disabled-password --gecos '' oracle
   sudo usermod -aG docker oracle
   sudo mkdir -p /opt/oracle && sudo chown oracle: /opt/oracle
   sudo -iu oracle git clone <repo> /opt/oracle
   ```

3. **Configurer** : `cp .env.example .env`, puis remplir les tokens, le Bot Password, un `POSTGRES_PASSWORD` solide et,
   idéalement, `ALERT_WEBHOOK_URL`. Protéger le fichier : `chmod 600 .env`.

4. **Démarrer** :

   ```bash
   cd /opt/oracle
   docker compose up -d --build
   docker compose logs -f bot          # "Connected to Discord", puis "Schedule synced"
   ```

5. **Activer les sauvegardes** (voir [Sauvegardes](#sauvegardes)).

Fonctionnement en production :

- Les conteneurs redémarrent seuls (`restart: unless-stopped`), y compris après un reboot du serveur.
- Le conteneur `bot` expose un healthcheck Docker (`GET /health` : base joignable et connexion Discord prête).
- Les logs (JSON, pino) sont limités à 5 × 10 Mo par conteneur.
- Les migrations de base sont appliquées automatiquement au démarrage.
- Les jobs planifiés sont persistés par pg-boss dans le schéma `pgboss` et survivent aux redémarrages :
  - `schedule-sync` (toutes les 6 h) : sync Leaguepedia, calcul des points, récaps dus, emojis des logos, mise à jour des annonces ;
  - `guild-tick` (chaque minute) : publications dues, rappels avant le lock, révélation des votes après le lock ;
  - `results-poll` (toutes les 5 min) : uniquement pendant une fenêtre de match, récupère les résultats et calcule les points ;
    publie ensuite les récaps dus (y compris après une correction d'admin).

## Alertes

Avec `ALERT_WEBHOOK_URL` (un webhook Discord : _Paramètres du salon → Intégrations → Webhooks_), le bot prévient
l'exploitant dans un salon privé :

- 🔴 **chaque erreur** journalisée : job en échec, sync Leaguepedia impossible, publication refusée par Discord,
  interaction qui plante, exception non gérée. L'alerte reprend le message, le contexte (serveur, job, compétition…) et
  le début de la pile d'appels ;
- 🔴 **healthcheck en échec** pendant plus de 5 minutes (Discord déconnecté, base injoignable), puis 🟢 quand tout revient ;
- ℹ️ **démarrage** du bot : un redémarrage inattendu se voit tout de suite ;
- 🔴 **sauvegarde en échec** (envoyée par `scripts/backup.sh`).

Une même alerte part au plus une fois toutes les 30 minutes ; la suivante indique combien d'occurrences ont été
regroupées. Une boucle de crash produit donc un message, pas des centaines. `ALERT_MENTION_USER_ID` mentionne quelqu'un
sur les erreurs. Les secrets ne sont jamais inclus : seuls les champs simples du contexte sont repris.

## Sauvegardes

`scripts/backup.sh` tourne sur l'hôte. Il fait un `pg_dump` (format custom, compressé) de la base via le conteneur
`postgres`, vérifie que le dump est lisible, puis applique la rotation :

- `backups/daily/` : les 7 derniers dumps quotidiens ;
- `backups/weekly/` : une copie par semaine (dès que la dernière a 7 jours), les 4 dernières.

Le dossier est en `chmod 700`. Ensuite, si c'est configuré, le script copie les dumps **hors du serveur** :

- `BACKUP_RSYNC_TARGET` : `rsync --archive --delete` vers un NAS ou un autre serveur (clé SSH du compte `oracle`) ;
- `RESTIC_REPOSITORY` + `RESTIC_PASSWORD_FILE` : `restic backup`, puis `restic forget` avec la même rétention
  (initialiser le dépôt une fois avec `restic init`).

Installer rsync et/ou restic sur l'hôte selon le choix (`sudo apt-get install -y rsync restic`). Une sauvegarde qui
reste sur le même disque ne protège pas d'une panne du serveur : prévoir l'une des deux copies.

Planifier une exécution quotidienne avec le timer systemd fourni (adapter `User` et le chemin dans le `.service` si le
projet n'est pas dans `/opt/oracle`) :

```bash
sudo cp deploy/oracle-backup.service deploy/oracle-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now oracle-backup.timer
sudo systemctl start oracle-backup.service   # premier essai immédiat
journalctl -u oracle-backup -n 20            # résultat
systemctl list-timers oracle-backup.timer    # prochaine exécution (04:30)
```

Sans systemd, une ligne de crontab du compte `oracle` fait la même chose :
`30 4 * * * /opt/oracle/scripts/backup.sh >> /opt/oracle/backups/backup.log 2>&1`.

## Restauration

`scripts/restore.sh` remplace la base par un dump. Il sauvegarde d'abord l'état actuel dans
`backups/pre-restore-<date>.dump` (on peut donc revenir en arrière de la même façon), arrête le bot, recrée la base,
restaure, puis relance le bot. Celui-ci applique au démarrage les migrations plus récentes que le dump.

```bash
cd /opt/oracle
ls backups/daily backups/weekly
scripts/restore.sh backups/daily/oracle-2026-10-26T043000Z.dump   # demande de taper le nom de la base
```

`--yes` saute la confirmation (scripts). **Reconstruire un serveur perdu** :

1. Installer Docker, recréer le compte et cloner le projet (étapes 1 et 2 du déploiement).
2. Remettre le `.env` (gardez-en une copie dans un gestionnaire de mots de passe) et récupérer un dump :
   `rsync user@nas:/srv/backups/oracle/daily/<dump> backups/` ou `restic restore latest --target /tmp/restore`.
3. `docker compose build`, puis `scripts/restore.sh --yes <dump>` : le script démarre PostgreSQL, restaure et lance le bot.
4. Activer à nouveau le timer de sauvegarde.

Tester une restauration de temps en temps, par exemple sur une machine de test, est le seul moyen d'être sûr des sauvegardes.

## Exploitation au quotidien

| Besoin                      | Commande                                                      |
| --------------------------- | ------------------------------------------------------------- |
| Voir les logs               | `docker compose logs -f --since 1h bot`                       |
| État des conteneurs / santé | `docker compose ps` (colonne _STATUS_ : `healthy`)            |
| Mettre à jour               | `git pull && docker compose up -d --build`                    |
| Redémarrer le bot           | `docker compose restart bot`                                  |
| Forcer une synchro          | `/admin sync` sur Discord (une toutes les 10 minutes au plus) |
| Console SQL                 | `docker compose exec postgres psql -U oracle oracle`          |
| Lancer une sauvegarde       | `scripts/backup.sh`                                           |

En cas de problème :

- **Le bot ne répond plus** : `docker compose ps`, puis les logs. Un token invalide ou une variable manquante est
  signalé au démarrage (`Invalid environment: …`).
- **Plus de nouveaux matchs** : chercher `Schedule sync failed` dans les logs. Un Bot Password révoqué ou un email non
  confirmé empêche la connexion à Leaguepedia ; les erreurs 503 ou `ratelimited` sont temporaires et retentées seules.
- **Un serveur ne reçoit plus rien** : `/config show` sur ce serveur dit s'il est en pause (salon ou rôle supprimé) et
  comment le réactiver.
- **Logos absents** : vérifier que le bot a « Gérer les expressions » sur les serveurs `EMOJI_GUILD_IDS` et qu'il reste
  de la place (50 emojis sans boost). Si les logs disent `Logo host did not return an image (got text/html)`, le CDN de
  Fandom soumet le serveur à une vérification anti-bot : ajouter les logos à la main sur le serveur d'emojis, nommés
  comme le nom court de l'équipe, en majuscules (`T1`, `KC`, `IG`, `LYON`…). Le bot réutilise tout emoji qui porte déjà ce
  nom : `/admin sync` les associe tout de suite et liste les logos encore manquants.

## Architecture

Clean architecture / hexagonale. Les dépendances pointent vers le domaine, et des règles ESLint empêchent les imports interdits.

```
src/
├─ domain/          Règles métier pures : matchs, choix de prono, lock, points, classements, récaps, réglages serveur
├─ application/     Use cases + ports (interfaces) : MatchDataProvider, repositories, GuildMessenger…
├─ infrastructure/  Adapters : Drizzle/PostgreSQL, client Leaguepedia, pg-boss, pino, healthcheck, alertes webhook
├─ interfaces/
│  └─ discord/      Commandes, assistant /configure, parcours de pronos, embeds, i18n FR/EN
├─ config/          Validation de l'environnement (zod), catalogue des compétitions
└─ main.ts          Composition root (injection de dépendances, pas de singletons)
scripts/            Sauvegarde et restauration (sur l'hôte)
deploy/             Timer systemd des sauvegardes
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
filtre optionnel sur les pages de tournoi, barème. Aucun code métier à toucher. Les serveurs l'activent ensuite via `/configure`
ou `/config competitions`.

```ts
{ id: 'lck', name: 'LCK', source: { league: 'LoL Champions Korea' }, scoring: DEFAULT_SCORING }
```

## Licence

Code sous licence [MIT](LICENSE).

Les données de matchs viennent de [Leaguepedia](https://lol.fandom.com) (CC BY-SA 3.0) et ne sont pas incluses dans le
dépôt : le bot les télécharge et crédite la source dans ses messages.

Oracle isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved
in producing or managing Riot Games properties. Riot Games, League of Legends and all associated properties are
trademarks or registered trademarks of Riot Games, Inc.
