const { SlashCommandBuilder } = require('@discordjs/builders');
const audioQueue = require('../../helpers/queueClass'); // Import the queue

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete')
        .setDescription('Deletes a specific item from the audio queue')
        .addIntegerOption(option =>
            option.setName('index')
                .setDescription('The index of the item to delete')
                .setRequired(true)),
    async execute(interaction) {
        const index = interaction.options.getInteger('index'); // Convert to 0-based index
        const queue = audioQueue.getQueue();

        if (index > 0 && index < queue.length) {
            audioQueue.remove(index);
            await interaction.reply(`Removed item ${index} from the queue.`);
        } else {
            await interaction.reply('Invalid index. Please provide a valid index number.');
        }
    }
};
