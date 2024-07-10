const { SlashCommandBuilder } = require('@discordjs/builders');
const { playAudioFromUrl, joinChannel } = require('../../helpers/playAudio');
const audioQueue = require('../../helpers/queueClass');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('url')
        .setDescription('Play audio from a Youtube URL')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The URL of the Youtube video')
                .setRequired(true)),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            await interaction.editReply('Playing audio...');

            const url = interaction.options.getString('query');
            const { channel } = interaction.member.voice;

            if (channel) {
                const connection = joinChannel(channel);
                // Add URL to the queue
                audioQueue.add(url, `URL by ${interaction.user.tag}`);
                if (audioQueue.getQueue().length === 1) {
                    // If the queue was empty before adding, start playing
                    if (await playAudioFromUrl(connection, url) == 'OK') {
                        await interaction.editReply({
                            content: `Playing audio: URL by ${interaction.user.tag}`,
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
            console.error('Error playing audio:', error);
            await interaction.editReply('Error playing audio');
        }
    }
}