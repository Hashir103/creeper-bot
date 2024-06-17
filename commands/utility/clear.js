const { SlashCommandBuilder } = require('@discordjs/builders');
const audioQueue = require('../../helpers/queueClass'); // Import the queue

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clears the audio queue'),
    async execute(interaction) {
        audioQueue.clear();
        await interaction.reply('The queue has been cleared.');
    }
};
