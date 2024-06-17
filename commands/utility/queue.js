const { SlashCommandBuilder } = require('@discordjs/builders');
const audioQueue = require('../../helpers/queueClass'); // Import the queue

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Displays the current audio queue'),
    async execute(interaction) {
        const queue = audioQueue.getQueue();

        if (queue.length === 0) {
            return interaction.reply('The queue is empty!');
        }

        let queueList = '';
        for (let i = 0; i < queue.length; i++) {
            if (i === 0) {
                queueList += `**Now Playing:** ${queue[i]}\n`;
            } else {
                queueList += `**${i}.** ${queue[i]}\n`;
            }
        }
        await interaction.reply(`${queueList}`);
    }
};
