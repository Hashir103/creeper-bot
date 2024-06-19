const { SlashCommandBuilder } = require('@discordjs/builders');
const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const audioQueue = require('../../helpers/queueClass'); // Import the queue

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete')
        .setDescription('Deletes a specific item from the audio queue'),
    async execute(interaction) {
        const queue = audioQueue.getQueue();

        if (queue.length <= 1) {
            return interaction.reply('There are no items in the queue to delete.');
        }

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select-delete')
                .setPlaceholder('Select an item to delete')
                .addOptions(queue.slice(1).map((item, index) => ({
                    label: item,
                    value: (index + 1).toString(), // The value needs to be a string
                })))
        );

        const cancelButtonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({
            content: 'Select an item to delete from the queue or cancel:',
            components: [row, cancelButtonRow],
            ephemeral: true,
        });

        // Wait for user to interact with the select menu or the cancel button
        const filter = i => (i.customId === 'select-delete' || i.customId === 'cancel') && i.user.id === interaction.user.id;
        const collected = await interaction.channel.awaitMessageComponent({ filter, time: 15000 });

        if (!collected) {
            return interaction.editReply({content:'No selection made, command canceled.', components: []});
        }

        if (collected.customId === 'cancel') {
            return interaction.editReply({content:'Deletion canceled.', components: []});
        }

        const index = parseInt(collected.values[0], 10);

        if (index > 0 && index < queue.length) {
            audioQueue.remove(index);
            await interaction.editReply({content:`Removed song from the queue.`, components: []});
        } else {
            await interaction.editReply({content:'Invalid index. Please provide a valid index number.', components: []});
        }
    }
};
