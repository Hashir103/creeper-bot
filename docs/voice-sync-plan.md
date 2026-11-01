# Voice sync: plan (not built)

**Status: a plan only. Nothing in this PR changes the bot.** It records what was tested, what was found, and how voice sync could be built, so it can be picked up later without redoing the research.

## Goal

The creeper bot joins a Discord voice channel and plays what the radio is playing, in sync: same song, same position, following skips and song changes.

## What was tested (2026-11-01)

Five songs the radio had just played were searched on YouTube as "artist title" with yt-dlp, and the best result was compared with the song's real length from the radio's log.

| Where | Songs matched (within 6s) | Notes |
|---|---|---|
| The VPS (OVH datacenter IP) | 0 of 5 | Every video: "Sign in to confirm you're not a bot". Tested with `yt-dlp[default]` (the JavaScript challenge solver) and Node enabled; an earlier test without the solver was flawed and was redone. |
| The Pi (home connection, Distributel) | 5 of 5, all within 1s | Most were auto-generated "Topic" audio uploads, the cleanest source. |

On the Pi the audio stream itself was fetchable (HTTP 206, 300 KB in 0.4s), and the standalone `yt-dlp` aarch64 binary ran with no JavaScript runtime. A search of 5 results took 8 to 10 seconds, so the next song has to be resolved ahead of time (the radio already knows it roughly a song early: `djUpNext`, and the song queued about 20 seconds before the end).

Test songs: FLiP ワンダーランド (227s), Fishmans "BABY BLUE" (369s), alex_g_offline "Break" (177s), The Beatles "Think For Yourself" (139s), Keane "Sovereign Light Café" (219s).

## Constraints that shape the design

1. **YouTube stream URLs are bound to the IP that resolved them.** The Pi must download the audio; the VPS cannot reuse a URL the Pi resolved.
2. **The VPS is walled by YouTube**, so it cannot resolve anything itself.
3. **The Pi has no `ffmpeg`** and no passwordless sudo, so it cannot install one or convert audio. It has Python 3.14, 4 cores and about 1.3 GB free memory. The VPS has `ffmpeg`.
4. The bot already runs on the VPS next to the radio and reads its state from `GET /api/now`.

## Proposed design

```
  radio (VPS)            creeper bot (VPS)                    relay (Pi)
  /api/now  ───────────► sync loop                           yt-dlp binary
  track, progress          │  next song + position              │
                           ├─ GET /audio?artist=&title=&secs= ─►│ search YouTube, pick the result
                           │  (over Tailscale)                  │ whose length is within 6s
                           │ ◄───────────── raw audio stream ───┘ (no conversion on the Pi)
                           ▼
                        ffmpeg (VPS): seek to the radio's position, convert to Opus
                           ▼
                        @discordjs/voice ──► the voice channel
```

**The relay (Pi).** A small Python program using only the standard library plus the `yt-dlp` binary, listening on the Pi's Tailscale address only. `GET /audio?artist=&title=&secs=` searches, picks the best match by length (preferring "Topic" and official channels), and streams the audio unconverted (YouTube's Opus-in-WebM where available). A `GET /health` for the bot to check. It keeps a short cache of resolved matches so a song is searched once.

**The bot (VPS).**
- `/radio join` and `/radio leave` (admin role to start with), plus a `VOICE_CHANNEL_ID` setting. The bot joins when asked and leaves when the channel has no one in it.
- A sync loop on the same snapshot the status uses. For the current song it asks the relay for the audio, starts `ffmpeg` with the right seek offset (the radio's position plus the time to start), and plays the result.
- **Staying in sync:** pre-resolve the next song while the current one plays; switch when the radio's song changes; if the radio's position and the voice position drift more than about 3 seconds (a seek, a pause, a resume), restart the stream at the right offset. Pause when the radio pauses.
- **Failure behaviour:** no match, the relay down, or the Pi walled by YouTube means silence and a note in the alerts channel, never a wrong song. The rest of the bot is unaffected.

**Dependencies and permissions.** `@discordjs/voice`, an Opus encoder and `libsodium-wrappers` on the VPS (the old bot used `@discordjs/opus` and `ytdl-core`, both removed); the `GuildVoiceStates` intent (not privileged); Connect and Speak permission in the voice channel.

## Risks

- **YouTube's terms.** Using yt-dlp is against them. One request per song is light, but the Pi's IP could be walled too if it is used heavily, and yt-dlp breaks whenever YouTube changes, so the Pi's binary needs updating regularly (a scheduled `yt-dlp -U`).
- **It plays the songs into a Discord call**, which is a gray area for a public server.
- **Wrong version.** The match is by title and length, so a live cut or remix of the same length could be picked. Preferring "Topic" and official channels reduces this; some songs will still be wrong or missing.
- **Offset.** Voice has its own delay, so it will trail the Jam by a fraction of a second to a few seconds; a fixed trim setting can compensate.
- **Not Spotify audio.** This path never touches Spotify audio, so it carries no risk to the Spotify account or developer key.

## Rejected alternatives

- **Capturing the Pi's audio output and streaming it to Discord.** It would be perfectly in sync, but it re-broadcasts Spotify audio, which risks the Spotify account and developer key.
- **Resolving on the VPS.** Walled (see above).
- **Using cookies from a logged-in YouTube account** to get past the wall. It puts that account at risk of a ban.
- **A second Discord bot on the Pi that does the voice part.** Works, but needs a second token and an app; the relay keeps one bot.

## Work breakdown

1. Relay on the Pi (about 150 lines of Python, run as a user service; the install needs a check on whether `loginctl enable-linger` works without sudo, otherwise it is started by hand or by cron `@reboot`) plus the update job.
2. Voice module in the bot: relay client, `ffmpeg` pipeline, voice player, sync loop, `/radio` commands.
3. Tests with a fake relay and a fake voice connection, then a live test with a few songs.
4. Docs: setup on the Pi, settings, how to turn it off.

## Open questions for later

- Which voice channel, and who may summon it?
- Should it join on its own when someone enters the channel, or only on `/radio join`?
- Is a Pi that is also the DJ's speaker the right home for this, given its load (currently very low)?

## Definition of done

Joined to a test channel, it plays the right song from the right position for at least ten songs in a row, follows a skip within about three seconds, goes silent (with an alert) when the relay is stopped, and does not affect the radio's playback, the status message or any existing command.
