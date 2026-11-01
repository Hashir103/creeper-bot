const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { isAdmin } = require('../../helpers/admin');
const { readEvents, isWarnOrError, summarize } = require('../../helpers/logs');
const { formatDuration, formatTime, truncate, plural } = require('../../helpers/format');

const EPHEMERAL = 64;
const CONFIRM_MS = 30000;
// A restart this soon after the last one is almost certainly a double click.
const MIN_UPTIME_MS = 60000;

// Runs a lookup that may fail without taking the whole reply with it.
async function safe(work, fallback = null) {
  try {
    return await work();
  } catch (error) {
    return fallback ?? { error: error.message };
  }
}

// Asks the admin to press a button before something that changes the radio.
// Resolves to true on confirm; the reply is then theirs to edit.
async function confirm(interaction, prompt, label) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dev-confirm').setLabel(label).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('dev-cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
  );
  await interaction.reply({ content: prompt, components: [row], flags: EPHEMERAL });
  const message = await interaction.fetchReply();
  try {
    const press = await message.awaitMessageComponent({ filter: (candidate) => candidate.user.id === interaction.user.id, time: CONFIRM_MS });
    if (press.customId !== 'dev-confirm') {
      await press.update({ content: 'Cancelled. Nothing changed.', components: [] });
      return false;
    }
    await press.update({ content: `${prompt}\n⏳ Working…`, components: [] });
    return true;
  } catch (error) {
    await interaction.editReply({ content: 'No answer in 30 seconds. Nothing changed.', components: [] });
    return false;
  }
}

const handlers = {
  async status(interaction, ctx) {
    await interaction.deferReply({ flags: EPHEMERAL });
    const [service, speaker, snapshot, events] = await Promise.all([
      safe(() => ctx.host.serviceInfo()),
      safe(() => ctx.host.speaker()),
      ctx.radio.get({ fresh: true }),
      safe(() => readEvents({ djDir: ctx.config.djDir, sinceMs: Date.now() - 60 * 60 * 1000, prefilter: isWarnOrError }), [])
    ]);
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🛠️ Radio status');
    if (service.error) {
      embed.addFields({ name: 'Service', value: truncate(`Could not read it: ${service.error}`, 300) });
    } else {
      const up = service.startedAt ? `up ${formatDuration(Date.now() - service.startedAt)}` : 'no process';
      const stale = service.staleFiles.length
        ? `⚠️ ${plural(service.staleFiles.length, 'file')} changed since it started (restart needed): ${service.staleFiles.slice(0, 4).join(', ')}`
        : '✅ running the latest code on disk';
      embed.addFields(
        { name: ctx.config.djService, value: `${service.active} (${service.sub}), ${up}`, inline: true },
        { name: 'Code', value: `\`${service.head.sha}\` ${truncate(service.head.subject, 80)}\n${stale}` }
      );
    }
    if (speaker.error) {
      embed.addFields({ name: 'Speaker (soloist)', value: truncate(`🔴 ${speaker.error}`, 300) });
    } else {
      embed.addFields({ name: 'Speaker (soloist)', value: `🟢 ${speaker.status}${speaker.title ? `: ${truncate(speaker.title, 60)} at ${formatTime(speaker.positionMs)}` : ''}` });
    }
    if (snapshot) {
      embed.addFields({ name: 'Room', value: `${plural(snapshot.listeners ?? 0, 'listener')}, ${plural((snapshot.queue || []).length, 'song')} queued, host device ${snapshot.hostDeviceOnline ? 'online' : '**offline**'}${snapshot.spotifyLimited ? ', Spotify rate limited' : ''}` });
    } else {
      embed.addFields({ name: 'Room', value: '🔴 the radio is not answering on its local port' });
    }
    const warnings = Array.isArray(events) ? events.length : 0;
    embed.setFooter({ text: `${plural(warnings, 'warning')} or error in the last hour · /dev logs for details` });
    await interaction.editReply({ embeds: [embed] });
  },

  async logs(interaction, ctx) {
    const minutes = interaction.options.getInteger('minutes') ?? 30;
    const level = interaction.options.getString('level') ?? 'warn';
    await interaction.deferReply({ flags: EPHEMERAL });
    const events = (await readEvents({ djDir: ctx.config.djDir, sinceMs: Date.now() - minutes * 60 * 1000, prefilter: isWarnOrError }))
      .filter((entry) => level === 'warn' || entry.level === 'error');
    if (!events.length) return interaction.editReply(`No ${level === 'warn' ? 'warnings or errors' : 'errors'} in the last ${minutes} minutes. 🎉`);
    const counts = summarize(events).slice(0, 8).map((row) => `${String(row.count).padStart(3)}× ${row.key}`);
    const recent = events.slice(-6).map((entry) => `${new Date(entry.at).toISOString().slice(11, 19)}Z ${entry.event}${entry.error?.message ? ` — ${truncate(entry.error.message, 70)}` : ''}`);
    const body = `Last ${minutes} min, ${plural(events.length, 'entry', 'entries')}\n\n${counts.join('\n')}\n\nMost recent:\n${recent.join('\n')}`;
    await interaction.editReply(`\`\`\`\n${truncate(body, 1800)}\n\`\`\``);
  },

  async speaker(interaction, ctx) {
    await interaction.deferReply({ flags: EPHEMERAL });
    const speaker = await safe(() => ctx.host.speaker());
    if (speaker.error) return interaction.editReply(`🔴 ${speaker.error}`);
    const upcoming = speaker.upcoming.length
      ? speaker.upcoming.map((entry, index) => `${index + 1}. [${entry.source}] ${truncate(entry.title, 70)}`).join('\n')
      : 'nothing';
    await interaction.editReply(`**${speaker.status}**${speaker.title ? `: ${truncate(speaker.title, 70)} at ${formatTime(speaker.positionMs)}` : ''}\nContext: \`${speaker.context || 'none'}\`\n\n**Coming up on the speaker** (queue = added to the queue, context = the Jam's own list)\n\`\`\`\n${upcoming}\n\`\`\``);
  },

  async prs(interaction, ctx) {
    await interaction.deferReply({ flags: EPHEMERAL });
    const out = await safe(() => ctx.run('gh', ['pr', 'list', '--repo', ctx.config.githubRepo, '--limit', '10', '--json', 'number,title,author,url']).then(JSON.parse));
    if (out.error) return interaction.editReply(`Could not read the pull requests: ${truncate(out.error, 200)}`);
    if (!out.length) return interaction.editReply('No open pull requests.');
    await interaction.editReply(out.map((pr) => `[#${pr.number}](${pr.url}) ${truncate(pr.title, 90)} · ${pr.author?.login || '?'}`).join('\n'));
  },

  async restart(interaction, ctx) {
    const service = await safe(() => ctx.host.serviceInfo());
    if (!service.error && service.startedAt && Date.now() - service.startedAt < MIN_UPTIME_MS) {
      return interaction.reply({ content: 'It restarted under a minute ago. Give it a moment.', flags: EPHEMERAL });
    }
    if (!await confirm(interaction, `Restart **${ctx.config.djService}**? Listeners reconnect after a few seconds.`, 'Restart')) return;
    try {
      await ctx.host.restart();
      await interaction.editReply('✅ Restarted. `/dev status` in a few seconds will confirm.');
      await ctx.announce(`🛠️ <@${interaction.user.id}> restarted the radio.`);
    } catch (error) {
      await interaction.editReply(`❌ Restart failed: ${truncate(error.message, 300)}`);
    }
  },

  async deploy(interaction, ctx) {
    const incoming = await safe(() => ctx.host.pending());
    if (incoming.error) return interaction.reply({ content: `Could not check for updates: ${truncate(incoming.error, 300)}`, flags: EPHEMERAL });
    if (!incoming.commits.length) return interaction.reply({ content: 'Nothing to deploy: the radio code is already up to date with `main`.', flags: EPHEMERAL });
    if (incoming.needsInstall) {
      return interaction.reply({ content: `This update changes the dependencies (\`package.json\`). Run \`npm ci\` on the host first, then restart. I won't do that part from Discord.\n${incoming.commits.map((c) => `• ${truncate(c, 90)}`).join('\n')}`, flags: EPHEMERAL });
    }
    const list = incoming.commits.slice(0, 8).map((commit) => `• ${truncate(commit, 90)}`).join('\n');
    const prompt = `Deploy ${plural(incoming.commits.length, 'commit')} from \`main\` and restart **${ctx.config.djService}**?\n${list}\n${plural(incoming.files.length, 'file')} change.`;
    if (!await confirm(interaction, prompt, 'Deploy and restart')) return;
    try {
      const pulled = await ctx.host.pull();
      await ctx.host.restart();
      await interaction.editReply(`✅ Deployed ${plural(pulled.commits.length, 'commit')} and restarted.`);
      await ctx.announce(`🛠️ <@${interaction.user.id}> deployed ${plural(pulled.commits.length, 'commit')} to the radio:\n${list}`);
    } catch (error) {
      await interaction.editReply(`❌ Deploy failed: ${truncate(error.message, 300)}`);
    }
  }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dev')
    .setDescription('Radio admin tools (admin role only)')
    .addSubcommand((sub) => sub.setName('status').setDescription('The service, the speaker, the room and the code version'))
    .addSubcommand((sub) => sub.setName('logs').setDescription('Recent warnings and errors from the radio')
      .addIntegerOption((option) => option.setName('minutes').setDescription('How far back (default 30)').setMinValue(5).setMaxValue(180))
      .addStringOption((option) => option.setName('level').setDescription('warn (default) or error').addChoices({ name: 'warnings and errors', value: 'warn' }, { name: 'errors only', value: 'error' })))
    .addSubcommand((sub) => sub.setName('speaker').setDescription("What the Pi's speaker is playing and has queued"))
    .addSubcommand((sub) => sub.setName('prs').setDescription('Open pull requests on the radio repo'))
    .addSubcommand((sub) => sub.setName('restart').setDescription('Restart the radio service'))
    .addSubcommand((sub) => sub.setName('deploy').setDescription('Pull the latest main and restart the radio')),

  async execute(interaction, ctx = require('../../helpers/context')) {
    if (!isAdmin(interaction, { adminRoleId: ctx.config.adminRoleId, guildId: ctx.config.guildId })) {
      return interaction.reply({ content: 'That one is for the admin role.', flags: EPHEMERAL });
    }
    const handler = handlers[interaction.options.getSubcommand()];
    if (!handler) return interaction.reply({ content: 'Unknown /dev command.', flags: EPHEMERAL });
    return handler(interaction, ctx);
  }
};
