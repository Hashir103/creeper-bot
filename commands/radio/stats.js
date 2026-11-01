const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { readEvents, isStatEvent, radioStats } = require('../../helpers/logs');
const { plural, truncate } = require('../../helpers/format');

const list = (rows, empty) => (rows.length ? rows.map((row) => `${truncate(row.name, 30)} (${row.count})`).join(' · ') : empty);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription("The radio's numbers: songs played, who asked, genres, and how the speaker did")
    .addIntegerOption((option) => option.setName('days').setDescription('How many days back (default 1)').setMinValue(1).setMaxValue(7)),
  async execute(interaction, ctx = require('../../helpers/context')) {
    const days = interaction.options.getInteger('days') ?? 1;
    await interaction.deferReply();
    const events = await readEvents({ djDir: ctx.config.djDir, sinceMs: Date.now() - days * 24 * 60 * 60 * 1000, prefilter: isStatEvent });
    const stats = radioStats(events);
    if (!stats.plays) return interaction.editReply('No songs in that time, or I can\'t read the radio\'s logs.');
    const embed = new EmbedBuilder()
      .setColor(0x4caf50)
      .setTitle(`📊 The radio, last ${days === 1 ? '24 hours' : `${days} days`}`)
      .addFields(
        { name: 'Songs played', value: `${stats.plays} (${stats.uniqueSongs} different)`, inline: true },
        { name: 'The DJ chose', value: String(stats.djPicks), inline: true },
        { name: 'Skipped', value: String(stats.skips), inline: true },
        { name: 'Most songs added', value: list(stats.topAdders, 'No one yet') },
        { name: 'Genre blocks the DJ played', value: list(stats.topGenres, 'None') },
        { name: 'Speaker', value: stats.speakerDrops ? `dropped ${plural(stats.speakerDrops, 'time')}` : 'no drops 🎉', inline: true },
        { name: 'Radio restarts', value: String(stats.restarts), inline: true }
      );
    await interaction.editReply({ embeds: [embed] });
  }
};
