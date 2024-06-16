const { SlashCommandBuilder } = require('discord.js');
const { joinChannel } = require('../../helpers/playAudio');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Joins your voice channel and stays there'),
    async execute(interaction) {
        const { channel } = interaction.member.voice;
        if (channel) {
            joinChannel(channel);
            await interaction.reply(`Joined ${channel.name}`);
        } else {
            await interaction.reply('You need to join a voice channel first!');
        }
    }
}
