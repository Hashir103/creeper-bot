const { createAudioPlayer, createAudioResource, joinVoiceChannel, VoiceConnectionStatus, AudioPlayerStatus } = require('@discordjs/voice');
const { entersState } = require('@discordjs/voice');
const path = require('path');

async function playAudio(connection, filePath) {
    const player = createAudioPlayer();
    const resource = createAudioResource(filePath);

    connection.subscribe(player);
    player.play(resource);

    return entersState(player, AudioPlayerStatus.Playing, 5e3)
        .then(() => {
            return entersState(player, AudioPlayerStatus.Idle, 30e3);
        })
        .catch(error => {
            console.error(error);
            player.stop();
        });
}

function joinChannel(channel) {
    return joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
    });
}

module.exports = { playAudio, joinChannel };
