const { SlashCommandBuilder } = require('@discordjs/builders');
const { getVoiceConnection } = require('@discordjs/voice');
const { playAudioFromMp3 } = require('../../helpers/playAudio');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Disconnects the bot from the voice channel.'),
    async execute(interaction) {
        const connection = getVoiceConnection(interaction.guildId);
        await interaction.deferReply(); // Defer the reply to avoid timeout

        if (connection) {
            try {
                const channel = interaction.member.voice.channel;

                // Check if there is an active player playing audio
                if (connection.state.subscription) {
                    await interaction.editReply('Stopping current playback...');
                    connection.state.subscription.player.stop(); // Stop the player
                }

                // Play the creeper.mp3 if the bot is still in a voice channel
                if (channel) {
                    const audioPath = path.join(__dirname, '../../resources/creeper.mp3');
                    await playAudioFromMp3(channel, audioPath);
                } else {
                    console.log('User is not in a voice channel.');
                }
                
                await interaction.editReply('Left the voice channel!');
            } catch (error) {
                console.error('Error handling leave command:', error);
                await interaction.editReply('Failed to handle leave command.');
            }
        } else {
            await interaction.editReply('Not in a voice channel!');
        }
    }
}
