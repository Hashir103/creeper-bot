const { SlashCommandBuilder } = require('@discordjs/builders');
const { getVoiceConnection } = require('@discordjs/voice');
const { playAudio } = require('../../helpers/playAudio');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Disconnects the bot from a voice channel.'),
    async execute(interaction) {
        const connection = getVoiceConnection(interaction.guildId);
        await interaction.deferReply(); // Defer the reply to avoid timeout

        if (connection) {
            const audioPath = path.join(__dirname, '../../resources/creeper.mp3');
            await playAudio(connection, audioPath);
            connection.destroy();
            await interaction.editReply('Left the voice channel!');
        } else {
            await interaction.editReply('Not in a voice channel!');
        }
    }
}
