const { truncate } = require('./format');

// Pull requests on the radio's repo, announced as they open, merge or close.
// The first poll only remembers what is already there. It uses the gh CLI on
// this machine, which is already signed in, so the bot holds no GitHub token.
function createGithubWatcher({ run, repo, store, send }) {
  async function poll() {
    const out = await run('gh', ['api', `repos/${repo}/pulls?state=all&per_page=15&sort=updated&direction=desc`]);
    const pulls = JSON.parse(out);
    const seen = store.get('prs');
    const next = { ...(seen || {}) };
    for (const pr of pulls) {
      const state = pr.merged_at ? 'merged' : pr.state;
      const before = next[pr.number];
      next[pr.number] = state;
      if (!seen || before === state) continue;
      const link = `[#${pr.number} ${truncate(pr.title, 100)}](${pr.html_url})`;
      if (state === 'merged') send(`✅ Merged: ${link}`);
      else if (state === 'closed') send(`🚫 Closed without merging: ${link}`);
      else if (!before) send(`🔀 New pull request: ${link} by ${pr.user?.login || 'someone'}`);
    }
    store.set('prs', next);
  }
  return { poll };
}

// The radio's code changing on this machine (a pull), which is when an update
// has been deployed, even before the service restarts.
function createDeployWatcher({ run, djDir, store, send }) {
  async function poll() {
    const out = await run('git', ['-C', djDir, 'log', '-1', '--format=%h%x1f%s']);
    const [sha, subject] = out.trim().split('\x1f');
    const before = store.get('djHead');
    if (sha && sha !== before) {
      store.set('djHead', sha);
      if (before) send(`🚀 **Radio code updated** to \`${sha}\`: ${truncate(subject, 120)}. It takes effect when the service restarts.`);
    }
  }
  return { poll };
}

module.exports = { createGithubWatcher, createDeployWatcher };
