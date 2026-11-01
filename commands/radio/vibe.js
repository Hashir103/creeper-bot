const fs = require('node:fs');
const path = require('node:path');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// The same genres the radio rotates through (its genres.js); the DJ plays five
// songs from one, then moves on round the ring.
const GENRES = {
  chill: 'Chill & Lo-fi', folk: 'Folk, Country & Acoustic', indie: 'Indie & Alternative', rock: 'Rock', heavy: 'Metal & Punk',
  electronic: 'Electronic & Dance', pop: 'Pop', unsorted: 'Unsorted', global: 'Latin & Global', hiphop: 'Hip-Hop & Rap',
  rnb: 'R&B', soul: 'Soul, Jazz & Blues', classical: 'Classical & Soundtracks'
};
const SONGS_PER_GENRE = 5;

module.exports = {
  data: new SlashCommandBuilder().setName('vibe').setDescription('Which genre the DJ is in, and how far through its block'),
  async execute(interaction, ctx = require('../../helpers/context')) {
    let cycle;
    try {
      cycle = JSON.parse(fs.readFileSync(path.join(ctx.config.djDir, '.data', 'genre-cycle.json'), 'utf8'));
    } catch (error) {
      return interaction.reply({ content: "I can't read the DJ's genre state.", flags: 64 });
    }
    if (!cycle.bucket) return interaction.reply('The DJ has not picked a genre yet.');
    const done = Math.min(cycle.playedInBlock || 0, SONGS_PER_GENRE);
    const dots = '●'.repeat(done) + '○'.repeat(SONGS_PER_GENRE - done);
    const embed = new EmbedBuilder()
      .setColor(0xe879f9)
      .setTitle(`🎛️ ${GENRES[cycle.bucket] || cycle.bucket}`)
      .setDescription(`${dots}  song ${Math.max(1, done)} of ${SONGS_PER_GENRE} in this genre's block`)
      .setFooter({ text: `Going ${cycle.direction === -1 ? 'back' : 'forward'} round the genre ring` });
    await interaction.reply({ embeds: [embed] });
  }
};
