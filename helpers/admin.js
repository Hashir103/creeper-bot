const config = require('./config');

// The admin gate for /dev: the member must be in the configured guild and have
// the configured role. With no role configured, nobody passes.
function isAdmin(interaction, { adminRoleId = config.adminRoleId, guildId = config.guildId } = {}) {
  if (!adminRoleId) return false;
  if (guildId && interaction.guildId !== guildId) return false;
  const roles = interaction.member?.roles;
  if (!roles) return false;
  // A cached member has a role manager; a raw API member has a list of ids.
  if (Array.isArray(roles)) return roles.includes(adminRoleId);
  return roles.cache?.has(adminRoleId) === true;
}

module.exports = { isAdmin };
