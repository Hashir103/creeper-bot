// Shared test data. (node --test runs every file in test/, so this has no tests of its own.)

const snapshot = (overrides = {}) => ({
  ok: true,
  receivedAt: 1000000,
  track: { title: 'Showdown', artist: 'Flummoxed Buffer', uri: 'spotify:track:3dkeGDiZUvM4aipctvLapz', albumArt: 'https://i.scdn.co/art.jpg', addedBy: 'jackie', durationMs: 200000, progressMs: 50000, isPlaying: true, thumbsUp: 1, thumbsDown: 0 },
  queue: [{ title: 'Next One', artist: 'Someone', uri: 'spotify:track:n1', addedBy: 'ben' }],
  djUpNext: [{ title: 'A Pick', artist: 'DJ Artist', uri: 'spotify:track:p1', addedBy: null, queued: true }],
  listeners: 3,
  voters: 2,
  skipVotes: 0,
  hostDeviceOnline: true,
  spotifyLimited: false,
  leaderboard: [
    { username: 'hash1r', likes: 54, dislikes: 4, score: 50 },
    { username: 'jackie', likes: 38, dislikes: 1, score: 37 },
    { username: 'ben', likes: 2, dislikes: 0, score: 2 }
  ],
  ...overrides
});

// A fake slash command interaction; calls records what the command did.
function interaction({ options = {}, sub = null, roles = [], guildId = 'G', userId = 'U1', press = null } = {}) {
  const calls = [];
  const fake = {
    guildId,
    user: { id: userId },
    member: { roles },
    options: { getSubcommand: () => sub, getInteger: (name) => options[name] ?? null, getString: (name) => options[name] ?? null },
    reply: async (payload) => { calls.push(['reply', payload]); fake.replied = true; },
    deferReply: async (payload) => { calls.push(['defer', payload]); fake.deferred = true; },
    editReply: async (payload) => { calls.push(['edit', payload]); },
    fetchReply: async () => ({
      awaitMessageComponent: async ({ filter }) => {
        if (!press) throw new Error('timed out');
        if (!filter(press)) throw new Error('not their button');
        return press;
      }
    }),
    calls
  };
  return fake;
}

const button = (customId, userId = 'U1') => ({ customId, user: { id: userId }, update: async function update(payload) { this.updated = payload; } });

module.exports = { snapshot, interaction, button };
