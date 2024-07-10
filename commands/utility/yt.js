const { SlashCommandBuilder } = require('@discordjs/builders');
const { joinChannel, playAudioFromUrl } = require('../../helpers/playAudio');
const { searchYouTube } = require('../../helpers/youtubeSearch');
const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const audioQueue = require('../../helpers/queueClass');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('yt')
        .setDescription('Searches YouTube and plays the selected video\'s audio')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The search query for YouTube')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true }); // Defer the reply with ephemeral flag

        try {
            await interaction.editReply('Searching YouTube...'); // Initial message

            const query = interaction.options.getString('query');
            const results = await searchYouTube(query);

            if (results.length === 0) {
                return interaction.editReply('No results found!');
            }

            const selectMenuRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select')
                    .setPlaceholder('Select a video')
                    .addOptions(results.map((result, index) => ({
                        label: result.title,
                        value: result.url,
                        description: `Result ${index + 1}`
                    })))
            );

            const cancelButtonRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger)
            );

            await interaction.editReply({
                content: 'Select a video to play or cancel:',
                components: [selectMenuRow, cancelButtonRow]
            });

            // Wait for user to interact with the select menu or the cancel button
            const filter = i => (i.customId === 'select' || i.customId === 'cancel') && i.user.id === interaction.user.id;
            const collected = await interaction.channel.awaitMessageComponent({ filter, time: 15000 });

            if (!collected) {
                return interaction.editReply('No selection made, command canceled.');
            }

            if (collected.customId === 'cancel') {
                return interaction.editReply({
                    content: 'Search canceled.',
                    components: []
                
                });
            }

            const url = collected.values[0];

            // Match url with selection to get title
            const selected = results.find(result => result.url === url);

            const { channel } = interaction.member.voice;

            if (channel) {
                const connection = joinChannel(channel);
                // Add URL to the queue
                audioQueue.add(url, selected.title);
                if (audioQueue.getQueue().length === 1) {
                    // If the queue was empty before adding, start playing
                    if (await playAudioFromUrl(connection, url) == 'OK') {
                        await interaction.editReply({
                            content: `Playing audio: ${selected.title}`,
                            components: []
                        });
                    }
                    else {
                        await interaction.editReply({content:'An error occurred. ', components: [] });
                    }
                } else {
                    await interaction.editReply({
                        content: `Added ${selected.title} to the queue.`,
                        components: []
                    });
                }
            } else {
                await interaction.editReply('You need to join a voice channel first!');
            }

        } catch (error) {
            console.error(error);
            await interaction.editReply({
                content:'Ran out of time',
                components: []});
        }
    }
};
