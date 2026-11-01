const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const config = require('./helpers/config');
const ctx = require('./helpers/context');
const { createStore } = require('./helpers/store');
const { createPresence } = require('./helpers/presence');
const { createStatusMessage } = require('./helpers/statusMessage');
const { createAlerts, createTailer } = require('./helpers/alerts');
const { createGithubWatcher, createDeployWatcher } = require('./helpers/github');
const { loadCommands } = require('./helpers/commands');

if (!config.token) {
	console.error('No bot token: set token, clientId and guildId in .env (see .env.example).');
	process.exit(1);
}

// Slash commands only need the Guilds intent; none of the privileged ones.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection(loadCommands(path.join(__dirname, 'commands')).map((command) => [command.data.name, command]));

// Runs a repeating job one at a time, so a slow one is never started twice, and
// one that throws only logs.
function every(name, ms, job) {
	let running = false;
	setInterval(async () => {
		if (running) return;
		running = true;
		try {
			await job();
		} catch (error) {
			console.warn(`[${name}]`, error.message || error);
		} finally {
			running = false;
		}
	}, ms);
}

async function sendTo(channelId, text) {
	if (!channelId) return;
	const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
	if (channel?.isTextBased?.()) await channel.send({ content: text, allowedMentions: { parse: [] } });
}

client.once(Events.ClientReady, (readyClient) => {
	console.log(`Logged in as ${readyClient.user.tag}`);
	const store = createStore();
	// Two channels: the updates channel is what listeners see (the live now-playing
	// message); the alerts channel is for the people running the radio: outages,
	// the pull request and code-update feed, and who ran what with /dev.
	const alertsSend = (text) => sendTo(config.alertsChannelId, text).catch((error) => console.warn('[alerts]', error.message));
	ctx.setAnnouncer(alertsSend);

	const presence = createPresence({ client, radio: ctx.radio });
	const status = createStatusMessage({ client, channelId: config.updatesChannelId, radio: ctx.radio, store, radioUrl: config.radioUrl });
	every('presence', config.statusEveryMs, () => presence.update());
	every('status', config.statusEveryMs, () => status.update());

	const alerts = createAlerts({ send: alertsSend });
	const tailer = createTailer({ djDir: config.djDir, onEntry: (entry) => alerts.handle(entry) });
	every('logs', config.logEveryMs, async () => tailer.poll());

	const github = createGithubWatcher({ run: ctx.run, repo: config.githubRepo, store, send: alertsSend });
	const deploys = createDeployWatcher({ run: ctx.run, djDir: config.djDir, store, send: alertsSend });
	every('github', config.githubEveryMs, () => github.poll());
	every('deploys', 60 * 1000, () => deploys.poll());
});

client.on(Events.InteractionCreate, async (interaction) => {
	if (!interaction.isChatInputCommand()) return;
	const command = interaction.client.commands.get(interaction.commandName);
	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}
	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		const reply = { content: 'There was an error while running that command.', flags: 64 };
		if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
		else await interaction.reply(reply).catch(() => {});
	}
});

process.on('unhandledRejection', (error) => console.error('Unhandled rejection:', error));

client.login(config.token);
