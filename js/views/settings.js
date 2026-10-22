/* Teacher tools: class details, rating settings, PIN, backups, publishing, exports and resets.
   On a view-only copy this page explains where the scores come from instead. */
(() => {
  const { esc } = Utils;

  Views.settings = { render, downloadBackup };

  function render(root) {
    if (Store.mode !== 'main') { renderViewer(root); return; }
    const s = Store.state;
    root.innerHTML = `<div class="page">
      <section class="page-head">
        <div><h1>Settings</h1><p class="muted">Teacher tools: class details, ratings, PIN, backups, sharing and exports.</p></div>
      </section>
      <div class="settings-grid">
        ${classCard(s)}
        ${ratingsCard(s)}
        ${pinCard()}
        ${backupCard(s)}
        ${shareCard(s)}
        ${exportCard()}
        ${seasonCard(s)}
        ${dangerCard(s)}
      </div>
    </div>`;
    bind(root.querySelector('.page'));
  }

  /* ---------- Cards ---------- */

  function classCard(s) {
    return `<section class="card">
      <h2 class="card-title">Class and season</h2>
      <form data-form="meta" class="stack-sm" novalidate>
        <label class="field"><span class="label">Site title</span><input name="title" maxlength="60" value="${esc(s.meta.title)}"></label>
        <label class="field"><span class="label">Season</span><input name="season" maxlength="60" value="${esc(s.meta.season)}" placeholder="e.g. Fall 2026"></label>
        <div class="form-actions"><button type="submit" class="btn btn-primary">Save</button></div>
      </form>
    </section>`;
  }

  function ratingsCard(s) {
    const st = s.settings;
    const pick = (values, current, label) => values.map(v => `<option value="${v}"${v === current ? ' selected' : ''}>${label(v)}</option>`).join('');
    return `<section class="card">
      <h2 class="card-title">Ratings and match defaults</h2>
      <form data-form="settings" class="stack-sm" novalidate>
        <div class="form-grid">
          <label class="field"><span class="label">Starting rating</span>
            <input type="number" name="startRating" min="100" max="3000" step="50" value="${st.startRating}"></label>
          <label class="field"><span class="label">K-factor (most points per set)</span>
            <input type="number" name="kFactor" min="1" max="100" value="${st.kFactor}"></label>
          <label class="field"><span class="label">Sets until a rating is settled</span>
            <input type="number" name="provisionalSets" min="0" max="20" value="${st.provisionalSets}"></label>
          <label class="field"><span class="label">Default format</span>
            <select name="bestOf">${pick([1, 3, 5], st.bestOf, v => 'Best of ' + v)}</select></label>
          <label class="field"><span class="label">Default stocks</span>
            <select name="stocks">${pick([1, 2, 3, 4, 5], st.stocks, v => Utils.plural(v, 'stock'))}</select></label>
        </div>
        <p class="muted small">Changing the starting rating or K-factor recalculates every rating from the first match.</p>
        <div class="form-actions"><button type="submit" class="btn btn-primary">Save</button></div>
      </form>
    </section>`;
  }

  function pinCard() {
    const has = Store.hasPin();
    const locked = Store.isLocked();
    const status = !has ? 'No PIN is set. Anyone using this computer can change scores.'
      : locked ? 'A PIN is set and the site is <strong>locked</strong>. Anyone can look around, but changes need the PIN.'
        : 'A PIN is set. Changes are <strong>unlocked</strong> in this tab until you lock it or close the tab.';
    return `<section class="card">
      <h2 class="card-title">Teacher PIN</h2>
      <p>${status}</p>
      <div class="row">${has
        ? '<button type="button" class="btn btn-secondary" data-pin="change">Change PIN</button>' +
          '<button type="button" class="btn btn-secondary" data-pin="remove">Remove PIN</button>' +
          (locked ? '' : '<button type="button" class="btn btn-primary" data-pin="lock">Lock now</button>')
        : '<button type="button" class="btn btn-primary" data-pin="set">Set a PIN</button>'}</div>
      <p class="muted small">The PIN stops casual changes on a shared computer. It isn't strong security: someone who knows
        the browser's developer tools can get around it.</p>
    </section>`;
  }

  function backupCard(s) {
    return `<section class="card">
      <h2 class="card-title">Backup and restore</h2>
      <p>Scores are saved in this browser on this computer. Clearing browser data, or a school computer that resets,
        erases them. Download a backup now and then and keep it on a school drive.</p>
      <p class="muted small">Last backup: ${s.meta.lastBackupAt ? esc(Utils.fmtDateTime(s.meta.lastBackupAt)) : 'never'}</p>
      <div class="row">
        <button type="button" class="btn btn-primary" data-action="backup">Download backup</button>
        <button type="button" class="btn btn-secondary" data-action="restore">Restore from a backup…</button>
        <input type="file" accept=".json,.js,application/json,text/javascript" data-restore-file hidden>
      </div>
    </section>`;
  }

  function shareCard(s) {
    const since = Store.matchesSince(s.meta.lastPublishedAt);
    const hide = Store.prefs.get('publishHideNames', true) !== false;
    return `<section class="card card-wide">
      <h2 class="card-title">Share with the class</h2>
      <p>Students can check the scores on their own phones or Chromebooks. Put the site online once (free),
        then publish whenever you want to update what they see. Their copy is view-only.</p>
      <p class="muted small">Last published: ${s.meta.lastPublishedAt
        ? `${esc(Utils.fmtDateTime(s.meta.lastPublishedAt))}${since ? ` · ${Utils.plural(since, 'new match', 'new matches')} since then` : ' · up to date'}`
        : 'never'}</p>
      <label class="check"><input type="checkbox" data-hide-names${hide ? ' checked' : ''}>
        Show gamertags only and hide real names (recommended: anyone with the link can open the published file)</label>
      <div class="row"><button type="button" class="btn btn-primary" data-action="publish">Download published-data.js</button></div>
      <details class="howto">
        <summary>How to put the site online (free, about 10 minutes)</summary>
        <ol>
          <li>Make a free account at <strong>github.com</strong>. Create a new <strong>public</strong> repository, for example <code>smash-rankings</code>.</li>
          <li>In the repository choose <strong>Add file → Upload files</strong>. Drag in everything in this site's folder:
            <code>index.html</code>, <code>published-data.js</code>, and the <code>assets</code>, <code>css</code> and <code>js</code> folders.
            First replace <code>published-data.js</code> with one you just downloaded here. Click <strong>Commit changes</strong>.</li>
          <li>Open the repository's <strong>Settings → Pages</strong>. Under <em>Build and deployment</em> choose
            <strong>Deploy from a branch</strong>, pick <code>main</code> and <code>/ (root)</code>, and click <strong>Save</strong>.</li>
          <li>A minute or two later the site is live at <code>https://your-username.github.io/smash-rankings/</code>.
            Share that link with the class.</li>
        </ol>
        <p><strong>To update the scores later:</strong> click <em>Download published-data.js</em> above. In the repository choose
          <strong>Add file → Upload files</strong>, drop in the new file (it replaces the old one) and commit.
          Visitors see the new scores within a few minutes.</p>
        <p class="muted small">Keep scoring on this computer, and open the site the same way each time. The online copy has its
          own separate storage and shows the published scores as view-only.</p>
      </details>
    </section>`;
  }

  function exportCard() {
    return `<section class="card">
      <h2 class="card-title">Export for grading</h2>
      <p>Spreadsheet files that open in Excel or Google Sheets. Standings include every student, so you can also see
        who hasn't played yet.</p>
      <div class="row">
        <button type="button" class="btn btn-secondary" data-action="csv-standings">Standings (CSV)</button>
        <button type="button" class="btn btn-secondary" data-action="csv-matches">Match log (CSV)</button>
        <button type="button" class="btn btn-secondary" data-action="print">Print standings</button>
      </div>
    </section>`;
  }

  function seasonCard(s) {
    return `<section class="card">
      <h2 class="card-title">New season</h2>
      <p>Start fresh for a new term. Players stay on the roster. Matches, brackets and ratings are cleared, and a backup
        of the old season downloads first.</p>
      <p class="muted small">This season: ${esc(s.meta.season || 'not named')} · ${Utils.plural(s.matches.length, 'match', 'matches')}</p>
      <div class="row"><button type="button" class="btn btn-secondary" data-action="season">Start a new season…</button></div>
    </section>`;
  }

  function dangerCard(s) {
    const empty = !s.players.length && !s.matches.length;
    if (s.meta.isSample) {
      return `<section class="card card-danger">
        <h2 class="card-title">Remove the sample data</h2>
        <p>The made-up class is still loaded. Erase it when you're ready to add your real roster.</p>
        <div class="row"><button type="button" class="btn btn-danger-solid" data-action="erase">Erase sample data</button></div>
      </section>`;
    }
    return `<section class="card card-danger">
      <h2 class="card-title">Erase everything</h2>
      <p>Deletes all players, matches, brackets and settings from this browser. A backup downloads first.</p>
      <div class="row"><button type="button" class="btn btn-danger" data-action="erase"${empty ? ' disabled' : ''}>Erase everything…</button>
        ${empty ? '<button type="button" class="btn btn-secondary" data-action="sample">Load sample data</button>' : ''}</div>
    </section>`;
  }

  /* ---------- Actions ---------- */

  function bind(page) {
    page.querySelector('[data-form="meta"]').addEventListener('submit', e => {
      e.preventDefault();
      const form = e.target;
      UI.guard(() => {
        Store.setMeta({ title: form.elements.title.value, season: form.elements.season.value });
        UI.toast('Saved.', { kind: 'success' });
      });
    });

    page.querySelector('[data-form="settings"]').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target.elements;
      UI.guard(() => {
        Store.setSettings({
          startRating: f.startRating.value, kFactor: f.kFactor.value, provisionalSets: f.provisionalSets.value,
          bestOf: f.bestOf.value, stocks: f.stocks.value
        });
        UI.toast('Saved. Ratings were recalculated.', { kind: 'success' });
      });
    });

    page.querySelector('[data-hide-names]').addEventListener('change', e => Store.prefs.set('publishHideNames', e.target.checked));

    const fileInput = page.querySelector('[data-restore-file]');
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (file) restoreFrom(file);
    });

    page.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const pin = btn.dataset.pin;
      if (pin === 'set' || pin === 'change') UI.guard(setPinDialog);
      else if (pin === 'remove') UI.guard(removePin);
      else if (pin === 'lock') { Store.lock(); UI.toast('Locked. The PIN is needed to make changes.'); }

      switch (btn.dataset.action) {
        case 'backup': downloadBackup(); break;
        case 'restore': UI.guard(() => fileInput.click()); break;
        case 'publish': publish(page); break;
        case 'csv-standings': UI.guard(() => Utils.download(`smash-standings-${Utils.todayKey()}.csv`, standingsCSV(), 'text/csv')); break;
        case 'csv-matches': UI.guard(() => Utils.download(`smash-match-log-${Utils.todayKey()}.csv`, matchesCSV(), 'text/csv')); break;
        case 'print': location.hash = '#/'; setTimeout(() => window.print(), 300); break;
        case 'season': UI.guard(newSeasonDialog); break;
        case 'erase': UI.guard(eraseDialog); break;
        case 'sample': UI.guard(() => { Store.loadSample(); UI.toast('Sample data loaded.', { kind: 'success' }); location.hash = '#/'; }); break;
        default: break;
      }
    });
  }

  function saveBackupFile() {
    Utils.download(`smash-rankings-backup-${Utils.todayKey()}.json`, Store.backupText(), 'application/json');
  }

  function downloadBackup() {
    UI.guard(() => {
      saveBackupFile();
      Store.markBackedUp();
      UI.toast('Backup downloaded. Keep it somewhere safe, like a school drive.', { kind: 'success' });
    });
  }

  async function restoreFrom(file) {
    let text;
    try { text = await Utils.readFile(file); }
    catch (err) { UI.toast('That file could not be read.', { kind: 'error' }); return; }
    let preview;
    try {
      // Check the file before asking, so a wrong file never replaces anything.
      const parsed = JSON.parse(text);
      const data = parsed && parsed.data ? parsed.data : parsed;
      preview = { players: (data.players || []).length, matches: (data.matches || []).length, when: parsed.exportedAt || parsed.publishedAt };
    } catch (err) {
      const js = /window\.PUBLISHED_DATA\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(text);
      try {
        const parsed = JSON.parse(js[1]);
        preview = { players: parsed.data.players.length, matches: parsed.data.matches.length, when: parsed.publishedAt };
      } catch (_) {
        UI.toast("That file isn't a backup from this site.", { kind: 'error' });
        return;
      }
    }
    const ok = await UI.confirm({
      title: 'Restore this backup?',
      message: `It has ${Utils.plural(preview.players, 'player')} and ${Utils.plural(preview.matches, 'match', 'matches')}` +
        `${preview.when ? ` (saved ${Utils.fmtDateTime(preview.when)})` : ''}. Everything currently on this computer is replaced.`,
      confirmLabel: 'Replace and restore',
      danger: true
    });
    if (!ok) return;
    UI.attempt(() => {
      const result = Store.restore(text);
      UI.toast(`Restored ${Utils.plural(result.players, 'player')} and ${Utils.plural(result.matches, 'match', 'matches')}.`, { kind: 'success' });
    });
  }

  function publish(page) {
    UI.guard(() => {
      const hideNames = page.querySelector('[data-hide-names]').checked;
      Utils.download('published-data.js', Store.publishText({ hideNames }), 'text/javascript');
      Store.markPublished();
      UI.toast('Downloaded published-data.js. Upload it to your site to update what students see.', { kind: 'success', timeout: 9000 });
    });
  }

  function setPinDialog() {
    const has = Store.hasPin();
    UI.modal({
      title: has ? 'Change the PIN' : 'Set a teacher PIN',
      body: `<p class="muted">Use 4 to 8 digits. Pick something students won't guess.</p>
        <div class="form-grid">
          <label class="field"><span class="label">New PIN</span><input type="password" inputmode="numeric" autocomplete="new-password" maxlength="8" data-pin1></label>
          <label class="field"><span class="label">Type it again</span><input type="password" inputmode="numeric" autocomplete="new-password" maxlength="8" data-pin2></label>
        </div>`,
      actions: [
        { label: 'Cancel' },
        {
          label: 'Save PIN', kind: 'primary', onClick: api => {
            const a = api.el.querySelector('[data-pin1]').value.trim();
            const b = api.el.querySelector('[data-pin2]').value.trim();
            if (!/^\d{4,8}$/.test(a)) throw new Error('The PIN must be 4 to 8 digits.');
            if (a !== b) throw new Error('The two PINs don\'t match.');
            Store.setPin(a);
            UI.toast('PIN saved. Changes stay unlocked in this tab until you lock them.', { kind: 'success', timeout: 8000 });
          }
        }
      ]
    });
  }

  async function removePin() {
    const ok = await UI.confirm({ title: 'Remove the PIN?', message: 'Anyone using this computer will be able to change scores.', confirmLabel: 'Remove PIN', danger: true });
    if (!ok) return;
    Store.removePin();
    UI.toast('PIN removed.');
  }

  function newSeasonDialog() {
    const current = Store.state.meta.season;
    const suggested = Utils.seasonName() !== current ? Utils.seasonName() : '';
    UI.modal({
      title: 'Start a new season',
      body: `<p>Players stay on the roster. Matches, brackets and ratings are cleared. A backup of
          ${current ? esc(current) : 'the current season'} downloads first.</p>
        <label class="field"><span class="label">New season name</span><input name="season" maxlength="60" value="${esc(suggested)}" placeholder="e.g. Spring 2027"></label>`,
      actions: [
        { label: 'Cancel' },
        {
          label: 'Back up and start', kind: 'danger', onClick: api => {
            const name = api.el.querySelector('[name="season"]').value;
            saveBackupFile();
            Store.newSeason(name);
            UI.toast('New season started. The old season\'s backup was downloaded.', { kind: 'success', timeout: 8000 });
          }
        }
      ]
    });
  }

  async function eraseDialog() {
    const sample = Store.state.meta.isSample;
    const ok = await UI.confirm({
      title: sample ? 'Erase the sample data?' : 'Erase everything?',
      message: sample ? 'The made-up players, matches and brackets are removed.'
        : 'All players, matches, brackets and settings are deleted from this browser. A backup downloads first, just in case.',
      confirmLabel: sample ? 'Erase sample data' : 'Back up and erase',
      danger: true
    });
    if (!ok) return;
    if (!sample) saveBackupFile();
    Store.eraseAll();
    UI.toast(sample ? 'Sample data erased. Add your class on the Players page.' : 'Everything was erased.', { kind: 'success' });
    location.hash = sample ? '#/players' : '#/';
  }

  /* ---------- Spreadsheet exports ---------- */

  function standingsCSV() {
    const st = Store.stats();
    const ranks = {};
    Stats.MODES.forEach(mode => {
      ranks[mode] = new Map(Stats.rankings(st, mode, Store.activePlayers()).ranked.map(r => [r.player.id, r.rank]));
    });
    const rows = [[
      'Gamertag', 'Name', 'Class period', 'Main',
      'Singles rank', 'Singles rating', 'Singles sets won', 'Singles sets lost', 'Singles win %', 'Singles games won', 'Singles games lost',
      'Doubles rank', 'Doubles rating', 'Doubles sets won', 'Doubles sets lost', 'Doubles win %',
      'Total sets played', 'Last played', 'Archived'
    ]];
    for (const p of Store.allPlayers()) {
      const a = st.singles.get(p.id);
      const b = st.doubles.get(p.id);
      const last = [a && a.lastPlayed, b && b.lastPlayed].filter(Boolean).sort().pop();
      const winPct = r => (r && r.sets ? Math.round((r.wins / r.sets) * 100) : '');
      rows.push([
        p.tag, p.name, p.period, p.main,
        ranks.singles.get(p.id) || '', a && a.sets ? Math.round(a.rating) : '', a ? a.wins : 0, a ? a.losses : 0, winPct(a),
        a ? a.gamesWon : 0, a ? a.gamesLost : 0,
        ranks.doubles.get(p.id) || '', b && b.sets ? Math.round(b.rating) : '', b ? b.wins : 0, b ? b.losses : 0, winPct(b),
        (a ? a.sets : 0) + (b ? b.sets : 0), last ? Utils.dayKey(last) : '', p.archived ? 'yes' : ''
      ]);
    }
    return Utils.toCSV(rows);
  }

  function matchesCSV() {
    const st = Store.stats();
    const sources = { manual: 'Record page', live: 'Live scoreboard', bracket: 'Bracket' };
    const rows = [[
      'Date', 'Time', 'Type', 'Best of', 'Side 1', 'Side 2', 'Side 1 games', 'Side 2 games', 'Winner',
      'Side 1 characters', 'Side 2 characters', 'Side 1 rating change', 'Side 2 rating change', 'Entered from', 'Bracket'
    ]];
    for (const m of Stats.sortMatches(Store.state.matches)) {
      const d = st.deltas.get(m.id) || {};
      rows.push([
        Utils.dayKey(m.playedAt), Utils.fmtTime(m.playedAt), m.type, m.bestOf,
        Store.sideName(m.sides[0]), Store.sideName(m.sides[1]), m.score[0], m.score[1], Store.sideName(m.sides[m.winner]),
        UI.charsUsed(m, 0).join(' / '), UI.charsUsed(m, 1).join(' / '),
        Math.round(d[m.sides[0][0]] || 0), Math.round(d[m.sides[1][0]] || 0),
        sources[m.source] || '', m.bracket ? m.bracket.name : ''
      ]);
    }
    return Utils.toCSV(rows);
  }

  /* ---------- View-only copy ---------- */

  function renderViewer(root) {
    const pub = Store.published || {};
    root.innerHTML = `<div class="page">
      <section class="page-head"><div><h1>About these scores</h1></div></section>
      <div class="settings-grid">
        <section class="card">
          <div class="about-brand">
            <img class="about-logo" src="${esc(Brand.logo)}" alt="${esc(Brand.logoAlt)}" width="88" height="89">
            <div>
              <h2 class="card-title">View-only copy</h2>
              <p class="muted">${esc(Brand.org)}</p>
            </div>
          </div>
          <p>These are the class scores${pub.publishedAt ? ` as of <strong>${esc(Utils.fmtDateTime(pub.publishedAt))}</strong>` : ''}.
            Your teacher keeps score on the main computer and updates this page from time to time.</p>
          ${pub.hideNames ? '<p class="muted">Only gamertags are shown here.</p>' : ''}
          <p class="muted small">Rankings use Elo ratings: beating higher-rated players moves you up faster.
            See "How ratings work" on the leaderboard.</p>
        </section>
        <section class="card">
          <h2 class="card-title">For the teacher</h2>
          <p>To keep score from this browser instead, make it the main scorekeeping device. That copies the published
            scores into this browser so they can be edited here.</p>
          <div class="row"><button type="button" class="btn btn-secondary" data-action="become-main">Make this the main scorekeeping device…</button></div>
        </section>
      </div>
    </div>`;
    root.querySelector('[data-action="become-main"]').addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: 'Keep score from this browser?',
        message: 'The published scores are copied into this browser and become editable here. Students viewing the online site still see the published copy until you publish again.' +
          (pub.hideNames ? ' Real names were hidden in the published copy, so only gamertags come across.' : ''),
        confirmLabel: 'Make this the main device'
      });
      if (!ok) return;
      Store.becomeMain();
      UI.toast('This browser now keeps score. Set a PIN in Settings if others use it.', { kind: 'success', timeout: 8000 });
    });
  }
})();
