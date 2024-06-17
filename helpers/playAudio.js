const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const fs = require('fs');
const audioQueue = require('./queueClass'); // Import the queue

function joinChannel(channel) {
    return joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
    });
}

// Function to play audio from a local .mp3 file
async function playAudioFromMp3(channel, mp3FilePath) {
    try {
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });

        const stream = fs.createReadStream(mp3FilePath);
        const resource = createAudioResource(stream);
        const player = createAudioPlayer();

        player.play(resource);
        connection.subscribe(player);

        return new Promise((resolve, reject) => {
            player.on('stateChange', (oldState, newState) => {
                if (newState.status === 'idle') {
                    connection.destroy();
                    resolve();
                }
            });

            player.on('error', (error) => {
                console.error('Error playing audio:', error);
                connection.destroy();
                reject(error);
            });
        });
    } catch (error) {
        console.error('Error joining voice channel:', error);
        throw error;
    }
}

async function playAudioFromUrl(connection, url) {
    try {
        const stream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
        const resource = createAudioResource(stream);
        const player = createAudioPlayer();

        connection.subscribe(player);
        player.play(resource);

        player.on(AudioPlayerStatus.Idle, async () => {
            const nextUrl = audioQueue.getNext();
            if (nextUrl) {
                await playAudioFromUrl(connection, nextUrl);
            } else {
                audioQueue.emitQueueStatusUpdate();
                connection.destroy();
            }
        });

        player.on('error', error => {
            console.error('Error playing audio:', error);
            connection.destroy();
        });

    } catch (error) {
        console.error('Error playing audio:', error);
        connection.destroy();
        throw error;
    }
}

module.exports = {
    joinChannel,
    playAudioFromUrl,
    playAudioFromMp3,
};
