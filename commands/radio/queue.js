const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { truncate } = require('../../helpers/format');

const line = (song, index) => `${index + 1}. **${truncate(song.title, 60)}** · ${truncate(song.artist, 40)}${song.addedBy ? ` · ${song.addedBy}` : ''}`;

module.exports = {
  data: new SlashCommandBuilder().setName('queue').setDescription("What is queued, and the DJ's next picks"),
  async execute(interaction, ctx = require('../../helpers/context')) {
    const snapshot = await ctx.radio.get({ fresh: true });
    if (!snapshot) return interaction.reply({ content: "I can't reach the radio right now.", flags: 64 });
    const queue = snapshot.queue || [];
    const picks = snapshot.djUpNext || [];
    const embed = new EmbedBuilder().setColor(0x4caf50).setTitle('Up next');
    embed.addFields({
      name: 'Queued by listeners',
      value: queue.length ? queue.slice(0, 10).map(line).join('\n') + (queue.length > 10 ? `\n…and ${queue.length - 10} more` : '') : 'Nothing queued: add a song on the site.'
    });
    if (picks.length) {
      embed.addFields({
        name: queue.length ? "Then the DJ's picks" : "The DJ's picks",
        value: picks.map((song, index) => `${line(song, index)}${song.queued ? ' · *lined up in the Jam*' : ''}`).join('\n')
      });
    }
    await interaction.reply({ embeds: [embed] });
  }
};
