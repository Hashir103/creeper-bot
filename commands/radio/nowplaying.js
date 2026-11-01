const { SlashCommandBuilder } = require('discord.js');
const { buildNowEmbed } = require('../../helpers/radio');

module.exports = {
  data: new SlashCommandBuilder().setName('nowplaying').setDescription('What is playing on the radio right now'),
  async execute(interaction, ctx = require('../../helpers/context')) {
    const snapshot = await ctx.radio.get({ fresh: true });
    await interaction.reply({ embeds: [buildNowEmbed(snapshot, { radioUrl: ctx.config.radioUrl })] });
  }
};
