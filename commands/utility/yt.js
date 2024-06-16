const { SlashCommandBuilder } = require('@discordjs/builders');
const { joinChannel, playAudioFromUrl } = require('../../helpers/playAudio');
const { searchYouTube } = require('../../helpers/youtubeSearch');
const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

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

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select')
                    .setPlaceholder('Select a video')
                    .addOptions(results.map((result, index) => ({
                        label: result.title,
                        value: result.url,
                        description: `Result ${index + 1}`
                    })))
            );

            await interaction.editReply({
                content: 'Select a video to play:',
                components: [row]
            });

            // Wait for user to interact with the select menu
            const filter = i => i.customId === 'select' && i.user.id === interaction.user.id;
            const collected = await interaction.channel.awaitMessageComponent({ filter, time: 15000 });

            if (!collected) {
                return interaction.editReply('No selection made, command canceled.');
            }

            const url = collected.values[0];

            // match url with selection to get title
            const selected = results.find(result => result.url === url);

            const { channel } = interaction.member.voice;

            if (channel) {
                const connection = joinChannel(channel);
                await interaction.editReply({
                    content: `Playing video: ${selected.title}`,
                    components: []});

                await playAudioFromUrl(connection, url);

                await interaction.editReply('Finished playing video!');

            } else {
                await interaction.editReply('You need to join a voice channel first!');
            }

        } catch (error) {
            console.error(error);
            await interaction.editReply('An error occurred while processing your request.');
        }
    }
};
