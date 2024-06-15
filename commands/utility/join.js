const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Joins your voice channel'),
    async execute(interaction) {
        const { channel } = interaction.member.voice;
        if (channel) {
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
            });
            await interaction.reply(`Joined ${channel.name}`);
        } else {
            await interaction.reply('You need to join a voice channel first!');
        }
    }
}