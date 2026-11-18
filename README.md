# Oracle

[![CI](https://github.com/dangoquidev/Oracle/actions/workflows/ci.yml/badge.svg)](https://github.com/dangoquidev/Oracle/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Discord bot for week-by-week predictions on League of Legends esports matches.
No money and no virtual currency: just points and leaderboards. Competitions at launch: **Worlds** and **LEC**.

Data (schedule, teams, logos, results) comes from the [Leaguepedia](https://lol.fandom.com) Cargo API and is cached in
PostgreSQL. Discord commands never hit the API directly.

> Version **1.0.0**. Onboarding and `/configure`, Leaguepedia sync, weekly publishing, button voting, reminders and vote
> breakdown at lock time, results and scoring, `/matches`, `/mypronos`, `/leaderboard`, `/stats`, automatic recaps,
> `/config`, `/admin`, webhook alerts, backups and restore.

## Table of contents

- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Creating the Discord bot](#creating-the-discord-bot)
- [Leaguepedia access](#leaguepedia-access)
- [Environment variables](#environment-variables)
- [Local development](#local-development)
- [Deploying on Debian (docker compose)](#deploying-on-debian-docker-compose)
- [Alerts](#alerts)
- [Backups](#backups)
- [Restore](#restore)
- [Day-to-day operations](#day-to-day-operations)
- [Architecture](#architecture)
- [Adding a competition](#adding-a-competition)
- [License](#license)

## How it works

1. When it joins a server, the bot sends a welcome message (FR/EN): in the system channel, otherwise in the first channel
   it can write to, otherwise as a DM to the owner. It stays **inactive** until an admin runs `/configure`.
2. `/configure` (requires "Manage Server") opens a 9-step ephemeral wizard: language, role to mention, channel,
   competitions, time zone, publishing day and time, vote lock mode and delay, recap, reminders.
   Every step offers "Keep the default". Nothing is saved before "Confirm", which first checks the bot's permissions in the
   selected channel.
3. The schedule is synced from Leaguepedia every 6 hours. A **week** maps to a tab of the Leaguepedia schedule
   ("Week 3", "Round 2", "Quarterfinals"…). A **match day** maps to its `MatchDay`.
4. At the publishing slot (Tuesday 10:00 by default), the bot publishes the weeks that start before the next slot.
   It mentions the role and adds a "Make my predictions" button. A week whose matchups are not all known yet (Worlds Swiss
   rounds, playoffs) is published **day by day**: each match day goes out as soon as Leaguepedia has its matchups, or 24 h
   before its first match with whatever is known (matches still to be determined open for voting in the same announcement
   as soon as they are known).
5. The button opens an ephemeral match-by-match flow: winner for a Bo1, exact score for a Bo3/Bo5.
   Predictions can be edited until voting closes. A vote counts if the Discord interaction happened before the lock.
   As soon as a player has a prediction on every match still open in the announcement, the bot posts their picks in the
   channel ("📝 Predictions locked in", without pinging them), and again every time they change them.
6. If reminders are enabled, the bot mentions the role X minutes before each vote lock (once per group of matches that
   lock together).
7. Everyone's picks are public: `/prono` shows who predicted what for the current round, even before the lock.
   At lock time, the bot publishes the server's vote breakdown (e.g. 70% G2 / 30% FNC, with the most picked score), which
   is also shown in the prediction flow and in `/matches`.
8. The published announcement is updated automatically when the schedule changes (teams known, times, logos), without
   mentioning the role a second time.
9. During match windows, results are fetched every 5 minutes, then points are computed: correct winner 1 pt, exact score
   (Bo3/Bo5) +2 pts, scoring configurable per competition. Scoring is idempotent: it can run as many times as needed
   without skewing points.
10. An admin can correct a result or cancel a match for their server. A cancelled match is neither won nor lost: its
    predictions are ignored.
11. Once all results of a match day or week are known (depending on the "Recap" setting), the bot publishes a recap per
    competition: results, the server's share of correct predictions on each match, top predictors for the period and the
    split/tournament top 5. When a split or tournament ends, it publishes the final standings. Recaps mention nobody and
    only cover weeks published on the server.
12. Leaderboards are computed on read from scored predictions: week, split/tournament (a Leaguepedia "season": regular
    season + playoffs, or Play-In + Main Event) and all time. They reset every split; past splits remain viewable. A player
    who joins midway starts at 0; ties stay tied (1, 1, 3).
13. If the configured role or channel is deleted, the bot pauses and notifies the admins. It resumes as soon as an admin
    picks a new role or channel (`/config role`, `/config channel` or `/configure`).
14. Each setting can also be changed on its own with `/config <setting>`, with the same checks as the wizard (valid
    values, bot permissions in the channel). A subcommand run without options shows the current value.
15. An admin can ban a player (`/admin ban`): they can no longer vote and disappear from leaderboards and recaps. Their
    predictions are kept, so `/admin unban` gives their points back.
16. `/admin sync` triggers a Leaguepedia sync immediately, without waiting for the next one. Since the schedule is shared
    by all servers, only one manual sync is accepted every 10 minutes.
17. `/stats [user]` shows a player's record on the server across all competitions: all-time and current split/tournament
    rank, points, correct winner rate, exact scores on Bo3/Bo5, current and best correct-winner streak, best week, most
    often picked team (and its success rate), and a per-competition breakdown.

### Commands

| Command                                        | Who           | Effect                                                                      |
| ---------------------------------------------- | ------------- | --------------------------------------------------------------------------- |
| `/configure`                                   | Manage Server | Setup wizard (required before any use)                                      |
| `/config show`                                 | Manage Server | Shows all settings and the bot's state (active, paused and why)             |
| `/config channel\|role\|timezone\|language`    | Manage Server | Changes the channel, role, time zone (autocompleted) or language            |
| `/config lock [mode] [delay]`                  | Manage Server | Vote lock: per match day or per match, and how long before                  |
| `/config reminders [enabled] [delay]`          | Manage Server | Enables, disables or shifts reminders                                       |
| `/config recap frequency:…`                    | Manage Server | Recap at the end of each match day or each week                             |
| `/config publish [day] [hour] [minute]`        | Manage Server | Day and time when the week's matches are published                          |
| `/config competitions competition:… active:…`  | Manage Server | Enables or disables a competition (at least one must stay active)           |
| `/matches [week] [competition]`                | Everyone      | Matches of the current, previous or next week, with voting status           |
| `/mypronos [week] [competition]`               | Everyone      | Your predictions for the week, results, your points and total, shown to all |
| `/prono [competition]`                         | Everyone      | Everyone's predictions for the current round, grouped by pick               |
| `/leaderboard [period] [competition] [season]` | Everyone      | Leaderboard for the week, the split/tournament (default) or all time        |
| `/stats [user]`                                | Everyone      | A player's record (yours by default): ranks, accuracy, streaks, favorites   |
| `/admin open week:… \| match:…`                | Manage Server | Reopens voting until each match starts                                      |
| `/admin close week:… \| match:…`               | Manage Server | Closes voting immediately                                                   |
| `/admin result match:… score:…`                | Manage Server | Forces or corrects a result (or reverts to Leaguepedia's)                   |
| `/admin cancel match:… [restore]`              | Manage Server | Cancels a match, its predictions are ignored (`restore` undoes it)          |
| `/admin recalc`                                | Manage Server | Recomputes all points on the server                                         |
| `/admin ban user:… [reason]`                   | Manage Server | Bans a player from predictions, leaderboards and recaps                     |
| `/admin unban user:…`                          | Manage Server | Reinstates a banned player, with all their points                           |
| `/admin sync`                                  | Manage Server | Forces a Leaguepedia sync and reports missing logos                         |

Option names are shown in English; French-language Discord clients see localized names.

The bot operator (`ADMIN_ID`) has "Manage Server" rights everywhere and can run `/admin` on a server that is not configured
yet (notably `/admin sync`, which does not depend on any server).

`/matches`, `/mypronos`, `/prono`, `/leaderboard` and `/stats` post their output as a bot message in the channel, visible
to everyone and without mentioning anyone. The prediction flow, `/config`, `/admin` and error messages stay visible only
to the person concerned. Without a competition, `/leaderboard` adds up the enabled competitions (all of them for all time);
the `season` option autocompletes past splits and tournaments. The `week`, `match` and `score` options of `/admin`
autocomplete their values: upcoming matches for `open`/`close`, recent matches for `result`/`cancel`, and for `score`, the
possible scores for the match format.

## Requirements

- Node.js 26 and pnpm 10 (development)
- Docker and Docker Compose (database, integration tests, deployment)

## Creating the Discord bot

1. On <https://discord.com/developers/applications>, create an application.
2. Copy the **Application ID** (_General Information_ tab): this is `DISCORD_CLIENT_ID`.
3. _Bot_ tab: generate the **token** (`DISCORD_TOKEN`). No _privileged intent_ is required.
4. Invite the bot to the game server with the `bot` and `applications.commands` scopes. Permissions: view channels,
   send messages, embed links, use external emojis, mention all roles (412672).

   `https://discord.com/oauth2/authorize?client_id=<CLIENT_ID>&scope=bot+applications.commands&permissions=412672`

5. **Emoji server(s)** (team logos): create a dedicated server, invite the bot with the "Manage Expressions" permission
   (1073741824), then put its id in `EMOJI_GUILD_IDS`. A bot can use emojis from every server it is in, so logos show up
   everywhere. A server without boosts holds 50 emojis; just add more ids, comma-separated, when it is full.

   `https://discord.com/oauth2/authorize?client_id=<CLIENT_ID>&scope=bot&permissions=1073741824`

Slash commands are registered automatically on startup. They are global by default, or limited to
`DISCORD_DEV_GUILD_ID` for instant updates during development.

## Leaguepedia access

Fandom throttles anonymous Cargo queries to the point of making them unusable. An account is required:

1. Create a Fandom account and **confirm the email address** (<https://lol.fandom.com/wiki/Special:Preferences>).
2. On <https://lol.fandom.com/wiki/Special:BotPasswords>, create a bot (e.g. `oracle`) and check
   _Create, query and delete data through the Cargo extension_.
3. Set `LEAGUEPEDIA_BOT_USER=AccountName@oracle` and `LEAGUEPEDIA_BOT_PASSWORD=<generated secret>`.

The client serializes requests: one every `LEAGUEPEDIA_MIN_INTERVAL_MS` ms, 8 s by default. It checks the session on every
call (`assert=user`) and applies exponential backoff on rate limits and transient errors.

## Environment variables

Copy `.env.example` to `.env`. The `.env` file is never committed.

| Variable                                              | Required | Default               | Purpose                                                       |
| ----------------------------------------------------- | -------- | --------------------- | ------------------------------------------------------------- |
| `DISCORD_TOKEN`                                       | yes      |                       | Bot token                                                     |
| `DISCORD_CLIENT_ID`                                   | yes      |                       | Application ID                                                |
| `DISCORD_DEV_GUILD_ID`                                | no       |                       | Registers commands on this server only                        |
| `EMOJI_GUILD_IDS`                                     | no       |                       | Servers hosting the logo emojis (comma-separated)             |
| `LEAGUEPEDIA_BOT_USER`                                | yes      |                       | `Account@BotName`                                             |
| `LEAGUEPEDIA_BOT_PASSWORD`                            | yes      |                       | Bot Password secret                                           |
| `LEAGUEPEDIA_CONTACT`                                 | no       | `https://github.com/` | Contact added to the User-Agent                               |
| `LEAGUEPEDIA_MIN_INTERVAL_MS`                         | no       | `8000`                | Minimum delay between two requests                            |
| `DATABASE_URL`                                        | yes      |                       | PostgreSQL URL (built automatically by docker compose)        |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | compose  |                       | Database credentials                                          |
| `NODE_ENV`                                            | no       | `production`          | `development` enables human-readable logs                     |
| `LOG_LEVEL`                                           | no       | `info`                | `fatal` to `trace`                                            |
| `HEALTH_PORT`                                         | no       | `3000`                | Port for `GET /health`                                        |
| `ALERT_WEBHOOK_URL`                                   | no       |                       | Discord webhook for alerts (disabled if empty)                |
| `ADMIN_ID`                                            | no       |                       | Your Discord id: mentioned on alerts, admin on every server   |
| `BACKUP_DIR`                                          | no       | `backups`             | Dump directory (relative to the project or absolute)          |
| `BACKUP_KEEP_DAILY` / `BACKUP_KEEP_WEEKLY`            | no       | `7` / `4`             | Daily / weekly dumps kept                                     |
| `BACKUP_RSYNC_TARGET`                                 | no       |                       | Off-site copy via rsync (e.g. `user@nas:/srv/backups/oracle`) |
| `RESTIC_REPOSITORY` / `RESTIC_PASSWORD_FILE`          | no       |                       | Off-site copy to a restic repository                          |

Values must not contain `$`: docker compose would read it as a variable (write `$$` instead).

## Local development

```bash
pnpm install
cp .env.example .env            # then fill in the values
cp docker-compose.override.example.yml docker-compose.override.yml   # exposes PostgreSQL on 127.0.0.1:5432
docker compose up -d postgres   # local database
pnpm dev                        # bot in watch mode
```

Only the `*.example` files are versioned: `.env` and `docker-compose.override.yml` stay on your machine (see
`.gitignore`). With `pnpm dev`, `DATABASE_URL` must point to `localhost:5432`.

| Command                                        | Effect                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm test`                                    | Unit tests                                                              |
| `pnpm test:integration`                        | Integration tests against a real PostgreSQL (Testcontainers, Docker)    |
| `pnpm test:all`                                | Everything, with coverage and thresholds (domain and application ≥ 95%) |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Code quality                                                            |
| `pnpm db:generate --name <name>`               | Generates a migration after changing `src/infrastructure/db/schema.ts`  |
| `pnpm build`                                   | Compiles to `dist/`                                                     |

Versioned migrations (`drizzle/`) are applied automatically on startup.

## Deploying on Debian (docker compose)

The bot opens no inbound port: it only connects to Discord and Leaguepedia. A small VPS is enough (1 vCPU, 1 GB RAM).

1. **Install Docker** from the official repository (<https://docs.docker.com/engine/install/debian/>):

   ```bash
   sudo apt-get update && sudo apt-get install -y ca-certificates curl git
   sudo install -m 0755 -d /etc/apt/keyrings
   sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
     https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" |
     sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
   sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
   ```

2. **Create a dedicated user** and fetch the project:

   ```bash
   sudo adduser --disabled-password --gecos '' oracle
   sudo usermod -aG docker oracle
   sudo mkdir -p /opt/oracle && sudo chown oracle: /opt/oracle
   sudo -iu oracle git clone <repo> /opt/oracle
   ```

3. **Configure**: `cp .env.example .env`, then fill in the tokens, the Bot Password, a strong `POSTGRES_PASSWORD` and,
   ideally, `ALERT_WEBHOOK_URL`. Protect the file: `chmod 600 .env`.

4. **Start**:

   ```bash
   cd /opt/oracle
   docker compose up -d --build
   docker compose logs -f bot          # "Connected to Discord", then "Schedule synced"
   ```

5. **Enable backups** (see [Backups](#backups)).

In production:

- Containers restart on their own (`restart: unless-stopped`), including after a server reboot.
- The `bot` container exposes a Docker healthcheck (`GET /health`: database reachable and Discord connection ready).
- Logs (JSON, pino) are capped at 5 × 10 MB per container.
- Database migrations are applied automatically on startup.
- Scheduled jobs are persisted by pg-boss in the `pgboss` schema and survive restarts:
  - `schedule-sync` (every 6 h): Leaguepedia sync, scoring, due recaps, logo emojis, announcement updates;
  - `guild-tick` (every minute): due publications, reminders before the lock, vote reveal after the lock;
  - `results-poll` (every 5 min): only during a match window, fetches results and computes points;
    then publishes due recaps (including after an admin correction).

## Alerts

With `ALERT_WEBHOOK_URL` (a Discord webhook: _Channel settings → Integrations → Webhooks_), the bot notifies the operator
in a private channel:

- 🔴 **every logged error**: failed job, Leaguepedia sync impossible, publication rejected by Discord, crashing
  interaction, unhandled exception. The alert includes the message, the context (server, job, competition…) and the top of
  the stack trace;
- 🔴 **failing healthcheck** for more than 5 minutes (Discord disconnected, database unreachable), then 🟢 when everything
  is back;
- ℹ️ **bot startup**: an unexpected restart is visible right away;
- 🔴 **failed backup** (sent by `scripts/backup.sh`).

The same alert is sent at most once every 30 minutes; the next one says how many occurrences were grouped. A crash loop
therefore produces one message, not hundreds. `ADMIN_ID` mentions the operator on errors. Secrets are never included:
only simple context fields are copied.

## Backups

`scripts/backup.sh` runs on the host. It takes a `pg_dump` (custom format, compressed) of the database through the
`postgres` container, checks that the dump is readable, then applies rotation:

- `backups/daily/`: the last 7 daily dumps;
- `backups/weekly/`: one copy per week (once the latest is 7 days old), the last 4.

The directory is `chmod 700`. Then, if configured, the script copies the dumps **off the server**:

- `BACKUP_RSYNC_TARGET`: `rsync --archive --delete` to a NAS or another server (SSH key of the `oracle` user);
- `RESTIC_REPOSITORY` + `RESTIC_PASSWORD_FILE`: `restic backup`, then `restic forget` with the same retention
  (initialize the repository once with `restic init`).

Install rsync and/or restic on the host as needed (`sudo apt-get install -y rsync restic`). A backup that stays on the
same disk does not protect against a server failure: set up one of the two copies.

Schedule a daily run with the provided systemd timer (adjust `User` and the path in the `.service` if the project is not
in `/opt/oracle`):

```bash
sudo cp deploy/oracle-backup.service deploy/oracle-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now oracle-backup.timer
sudo systemctl start oracle-backup.service   # immediate first run
journalctl -u oracle-backup -n 20            # result
systemctl list-timers oracle-backup.timer    # next run (04:30)
```

Without systemd, a crontab line for the `oracle` user does the same:
`30 4 * * * /opt/oracle/scripts/backup.sh >> /opt/oracle/backups/backup.log 2>&1`.

## Restore

`scripts/restore.sh` replaces the database with a dump. It first saves the current state to
`backups/pre-restore-<date>.dump` (so you can roll back the same way), stops the bot, recreates the database, restores,
then restarts the bot, which applies any migrations newer than the dump on startup.

```bash
cd /opt/oracle
ls backups/daily backups/weekly
scripts/restore.sh backups/daily/oracle-2026-10-26T043000Z.dump   # asks you to type the database name
```

`--yes` skips the confirmation (for scripts). **Rebuilding a lost server**:

1. Install Docker, recreate the user and clone the project (deployment steps 1 and 2).
2. Put the `.env` back (keep a copy in a password manager) and fetch a dump:
   `rsync user@nas:/srv/backups/oracle/daily/<dump> backups/` or `restic restore latest --target /tmp/restore`.
3. `docker compose build`, then `scripts/restore.sh --yes <dump>`: the script starts PostgreSQL, restores and starts the bot.
4. Re-enable the backup timer.

Testing a restore from time to time, for example on a test machine, is the only way to be sure the backups work.

## Day-to-day operations

| Need                      | Command                                                  |
| ------------------------- | -------------------------------------------------------- |
| View logs                 | `docker compose logs -f --since 1h bot`                  |
| Container status / health | `docker compose ps` (_STATUS_ column: `healthy`)         |
| Update                    | `git pull && docker compose up -d --build`               |
| Restart the bot           | `docker compose restart bot`                             |
| Force a sync              | `/admin sync` on Discord (at most once every 10 minutes) |
| SQL console               | `docker compose exec postgres psql -U oracle oracle`     |
| Run a backup              | `scripts/backup.sh`                                      |

Troubleshooting:

- **The bot no longer responds**: `docker compose ps`, then the logs. An invalid token or a missing variable is reported
  on startup (`Invalid environment: …`).
- **No new matches**: look for `Schedule sync failed` in the logs. A revoked Bot Password or an unconfirmed email
  prevents logging in to Leaguepedia; 503 or `ratelimited` errors are temporary and retried automatically.
- **A server no longer receives anything**: `/config show` on that server says whether it is paused (channel or role
  deleted) and how to reactivate it.
- **Missing logos**: check that the bot has "Manage Expressions" on the `EMOJI_GUILD_IDS` servers and that there is room
  left (50 emojis without boosts). If the logs say `Logo host did not return an image (got text/html)`, Fandom's CDN is
  putting the server through an anti-bot check: add the logos manually on the emoji server, named after the team's short
  name in uppercase (`T1`, `KC`, `IG`, `LYON`…). The bot reuses any emoji that already has that name: `/admin sync`
  links them right away and lists the logos still missing.

## Architecture

Clean / hexagonal architecture. Dependencies point toward the domain, and ESLint rules forbid disallowed imports.

```
src/
├─ domain/          Pure business rules: matches, picks, lock, scoring, leaderboards, recaps, server settings
├─ application/     Use cases + ports (interfaces): MatchDataProvider, repositories, GuildMessenger…
├─ infrastructure/  Adapters: Drizzle/PostgreSQL, Leaguepedia client, pg-boss, pino, healthcheck, webhook alerts
├─ interfaces/
│  └─ discord/      Commands, /configure wizard, prediction flow, embeds, FR/EN i18n
├─ config/          Environment validation (zod), competition catalog
└─ main.ts          Composition root (dependency injection, no singletons)
scripts/            Backup and restore (on the host)
deploy/             systemd timer for backups
```

- **Injectable clock**: everything time-dependent is tested with a fixed clock.
- **Locks computed, never stored**: if Leaguepedia moves a match, the vote lock follows automatically.
- **Stateless Discord flows**: `customId`s carry the whole context (publication, match, pick), so a flow survives a
  restart. Only the `/configure` draft lives in memory (15 min), since nothing is saved before confirmation.
- **Leaderboards computed on read**: SQL aggregates over scored predictions, nothing to resync after a correction.
- **Exactly-once notifications**: reminders, reveals and recaps go through a dispatch log (`dispatch_log`).
- **Multi-server**: everything is scoped by `guild_id`, with no hard-coded server id.

## Adding a competition

Add an entry to `src/config/competitions.ts`: identifier, name, Leaguepedia `league` (`Tournaments` table), optional
filter on tournament pages, scoring. No business code to touch. Servers then enable it via `/configure` or
`/config competitions`.

```ts
{ id: 'lck', name: 'LCK', source: { league: 'LoL Champions Korea' }, scoring: DEFAULT_SCORING }
```

## License

Code licensed under [MIT](LICENSE).

Match data comes from [Leaguepedia](https://lol.fandom.com) (CC BY-SA 3.0) and is not included in the repository: the bot
downloads it and credits the source in its messages.

Oracle isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved
in producing or managing Riot Games properties. Riot Games, League of Legends and all associated properties are
trademarks or registered trademarks of Riot Games, Inc.
