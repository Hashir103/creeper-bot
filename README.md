# creeper-bot

A Discord bot for the Public Radio Project (https://dj.hashir.tech). It runs on the same machine as the radio and mirrors it into Discord.

## What it does

**Live status**
- Its own "Listening to" status shows the song, the artist and who added it, with the adder's leaderboard rank, like the desktop app does on a listener's profile. Discord only lets bots set a name and one line of state, so there is no album art, progress bar or buttons on the status itself.
- **Updates channel** (`UPDATES_CHANNEL_ID`, what listeners see): one message that edits itself every 15 seconds: now playing, a progress bar, album art, what is next, listeners, and whether the speaker is online.
- **Alerts channel** (`ALERTS_CHANNEL_ID`, for whoever runs the radio): the speaker dropping and coming back (after 45 seconds, so short blips stay quiet), the radio restarting, Jam guest controls being on, soloist logging out, pull requests opening, merging or closing on the repo, the radio's code being updated on the machine, and who ran `/dev restart` or `/dev deploy`.

**Fun commands (everyone)**
- `/nowplaying`, `/queue`, `/leaderboard [top]`, `/vibe` (which genre the DJ is in)
- `/stats [days]`: songs played, who added most, the genres, skips, speaker drops and restarts, read from the radio's logs

**Admin commands (the admin role only, replies only you can see)**
- `/dev status`: service state and uptime, the code version, whether the running code is older than what is on disk, the speaker, the room, and recent warnings
- `/dev logs [minutes] [level]`: recent warnings and errors, counted and the latest few
- `/dev speaker`: what the Pi's speaker is playing and what it has queued (including entries from the Jam's own list)
- `/dev prs`: open pull requests
- `/dev restart` and `/dev deploy`: each asks for a button press first. `deploy` pulls `main` (fast-forward only) and restarts, and refuses if the update changes `package.json`, because dependencies are for you to install. Both are announced in the alerts channel with who ran them.

There is no way to run an arbitrary command from Discord: each action is a fixed command in `helpers/host.js`.

## Setup

1. In the [Discord developer portal](https://discord.com/developers/applications), use the existing application (or make one). Under Bot, copy the token. **No privileged intents are needed** (the old version asked for Message Content; you can switch it off). Invite the bot with the `bot` and `applications.commands` scopes, with permission to view, send messages and embed links in the updates channel.
2. Copy `.env.example` to `.env` and fill in `token`, `clientId`, `guildId`, `ADMIN_ROLE_ID`, `UPDATES_CHANNEL_ID` and `ALERTS_CHANNEL_ID` (the same channel is fine while testing).
3. `npm install`, then `npm start`. It registers the slash commands (replacing the old music ones) and starts the bot.
4. To keep it running, install `creeper-bot.service` (edit the paths if yours differ): `sudo cp creeper-bot.service /etc/systemd/system/ && sudo systemctl enable --now creeper-bot`.

## Needs from the radio

- `GET /api/now` on the radio server (added in Hashir103/public-dj-project#83). Until that is deployed, the status shows the radio as not answering and `/nowplaying`, `/queue` and `/leaderboard` say they can't reach it. Logs, `/stats`, `/vibe` and `/dev` work without it.
- Read access to the radio's directory (`DJ_DIR`) for its logs and genre state. The bot only reads there, except `/dev deploy`, which runs `git pull --ff-only` in it.
- `gh` signed in on this machine, for the pull request feed and `/dev prs`. The bot holds no GitHub token.
- Restart rights: `/dev restart` runs `sudo -n systemctl restart dj`. If you'd rather not give the bot's user full sudo, allow just that: `ubuntu ALL=(root) NOPASSWD: /usr/bin/systemctl restart dj` in `/etc/sudoers.d/creeper-bot`.

## Tests

`npm test` (Node 18+). Nothing in the tests talks to Discord, the radio or GitHub.

## Not in this version

Playing the radio into a voice channel. The old music code (YouTube search, queue, voice) was removed; it is in the git history.
