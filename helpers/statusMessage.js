const { buildNowEmbed } = require('./radio');

// One message in the updates channel that edits itself: what is playing now, its
// progress, what is next, the speaker. It is remembered by id, so a restart
// carries on editing the same message; if it was deleted, a new one is posted.
function createStatusMessage({ client, channelId, radio, store, radioUrl, now = Date.now }) {
  let lastKey = null;

  async function channel() {
    if (!channelId) return null;
    const found = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
    return found?.isTextBased?.() ? found : null;
  }

  async function post(target, payload) {
    const message = await target.send(payload);
    store.set('statusMessageId', message.id);
    return message;
  }

  async function update() {
    const target = await channel();
    if (!target) return false;
    const snapshot = await radio.get();
    const embed = buildNowEmbed(snapshot, { radioUrl, at: now() });
    const key = JSON.stringify(embed.toJSON());
    if (key === lastKey) return false;
    const payload = { embeds: [embed], content: '' };
    const id = store.get('statusMessageId');
    try {
      if (id) {
        const message = await target.messages.fetch(id);
        await message.edit(payload);
      } else {
        await post(target, payload);
      }
    } catch (error) {
      // Deleted, or no longer ours to edit: start a new one.
      await post(target, payload);
    }
    lastKey = key;
    return true;
  }

  return { update };
}

module.exports = { createStatusMessage };
