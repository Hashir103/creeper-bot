const {SlashCommandBuilder} = require('@discordjs/builders');
const {getVoiceConnection} = require('@discordjs/voice');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Disconnects the bot from a voice channel if it is in one.'),
    async execute(interaction) {
        const connection = getVoiceConnection(interaction.guildId);
        if (connection) {
            connection.destroy();
            await interaction.reply('Left the voice channel!');
        } else {
            await interaction.reply('Not in a voice channel!');
        }
    }
}