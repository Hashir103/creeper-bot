const path = require('node:path');
const { REST, Routes } = require('discord.js');
const config = require('./helpers/config');
const { loadCommands } = require('./helpers/commands');

const missing = ['token', 'clientId', 'guildId'].filter((name) => !config[name]);
if (missing.length) {
	console.error(`Missing from .env: ${missing.join(', ')} (see .env.example).`);
	process.exit(1);
}

const commands = loadCommands(path.join(__dirname, 'commands')).map((command) => command.data.toJSON());
const rest = new REST().setToken(config.token);

// Replaces the guild's commands with the current set, so commands removed from
// the code (the old music ones) disappear from Discord too.
(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);
		const data = await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		console.error(error);
		process.exit(1);
	}
})();
