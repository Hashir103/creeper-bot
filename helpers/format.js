// Small text helpers shared by the status, embeds and commands.

function formatTime(ms) {
  const seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function progressBar(progressMs, durationMs, width = 14) {
  if (!durationMs) return '';
  const filled = Math.max(0, Math.min(width, Math.round((progressMs / durationMs) * width)));
  return `${'▰'.repeat(filled)}${'▱'.repeat(width - filled)}`;
}

function truncate(text, max) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value;
}

// Discord rejects status text shorter than 2 or longer than 128 characters.
function statusText(text) {
  const value = String(text || '').trim();
  if (!value) return undefined;
  return truncate(value.length < 2 ? `${value} ` : value, 128);
}

function trackUrl(uri) {
  const match = String(uri || '').match(/^spotify:track:([A-Za-z0-9]+)$/);
  return match ? `https://open.spotify.com/track/${match[1]}` : undefined;
}

function formatScore(score) {
  return score > 0 ? `+${score}` : String(score);
}

const MEDALS = ['🥇', '🥈', '🥉'];
function rankLabel(index) {
  return MEDALS[index] || `**${index + 1}.**`;
}

function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

// "3m", "2h 5m", "1d 4h": how long ago or how long for.
function formatDuration(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

module.exports = { formatTime, progressBar, truncate, statusText, trackUrl, formatScore, rankLabel, plural, formatDuration };
