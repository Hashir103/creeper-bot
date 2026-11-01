const fs = require('node:fs');
const path = require('node:path');

// Every command module under commands/<folder>/*.js that has both `data` and
// `execute`; anything else is reported and skipped.
function loadCommands(commandsPath) {
  const commands = [];
  for (const folder of fs.readdirSync(commandsPath)) {
    const folderPath = path.join(commandsPath, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    for (const file of fs.readdirSync(folderPath).filter((name) => name.endsWith('.js'))) {
      const command = require(path.join(folderPath, file));
      if ('data' in command && 'execute' in command) commands.push(command);
      else console.log(`[WARNING] The command at ${path.join(folderPath, file)} is missing a required "data" or "execute" property.`);
    }
  }
  return commands;
}

module.exports = { loadCommands };
