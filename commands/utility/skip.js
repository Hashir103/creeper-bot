const { SlashCommandBuilder } = require('@discordjs/builders');
const { getVoiceConnection } = require('@discordjs/voice');
const audioQueue = require('../../helpers/queueClass');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skips the current song and plays the next one in the queue'),
    async execute(interaction) {
        const connection = getVoiceConnection(interaction.guildId);

        if (!connection) {
            return interaction.reply('I am not in a voice channel!');
        }

        if (connection.state.subscription.player.state.status === 'idle') {
            return interaction.reply('There is no song playing!');
        }
        const song = audioQueue.getQueue()[0];
        connection.state.subscription.player.stop(); // This triggers the player.on(AudioPlayerStatus.Idle)
        await interaction.reply(`Skipped ${song}!`);
    }
};
