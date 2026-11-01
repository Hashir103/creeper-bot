const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { rankLabel, formatScore, truncate } = require('../../helpers/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription("Whose songs the radio's listeners like most")
    .addIntegerOption((option) => option.setName('top').setDescription('How many to show (default 10)').setMinValue(3).setMaxValue(25)),
  async execute(interaction, ctx = require('../../helpers/context')) {
    const snapshot = await ctx.radio.get({ fresh: true });
    if (!snapshot) return interaction.reply({ content: "I can't reach the radio right now.", flags: 64 });
    const board = snapshot.leaderboard || [];
    if (!board.length) return interaction.reply('Nobody is on the board yet: songs need a 👍 or 👎 to score.');
    const top = interaction.options.getInteger('top') ?? 10;
    const lines = board.slice(0, top).map((entry, index) => `${rankLabel(index)} **${truncate(entry.username, 40)}** · ${formatScore(entry.score)} (👍 ${entry.likes} · 👎 ${entry.dislikes})`);
    const embed = new EmbedBuilder()
      .setColor(0xfacc15)
      .setTitle('🏆 The radio leaderboard')
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Score is 👍 minus 👎 on the songs each person added · ${board.length} on the board` });
    await interaction.reply({ embeds: [embed] });
  }
};
