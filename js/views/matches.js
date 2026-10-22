/* Match history: every set, newest first, grouped by day, with filters. */
(() => {
  const { esc } = Utils;
  const filters = { player: '', type: '', source: '' };
  const PAGE = 60;
  let limit = PAGE;

  Views.matches = { render };

  function render(root, params = []) {
    // #/matches/<playerId> opens the history filtered to one player.
    if (params[0]) {
      filters.player = Store.player(params[0]) ? params[0] : '';
      filters.type = '';
      filters.source = '';
      location.replace('#/matches');
      return;
    }
    const s = Store.state;
    const main = Store.mode === 'main';
    if (filters.player && !Store.player(filters.player)) filters.player = '';

    let list = Stats.sortMatches(s.matches).reverse();
    if (filters.player) list = list.filter(m => m.sides.some(side => side.includes(filters.player)));
    if (filters.type) list = list.filter(m => m.type === filters.type);
    if (filters.source) list = list.filter(m => m.source === filters.source);
    const total = list.length;

    const groups = [];
    let lastKey = null;
    for (const m of list.slice(0, limit)) {
      const key = Utils.dayKey(m.playedAt);
      if (key !== lastKey) { groups.push({ label: Utils.fmtDay(m.playedAt), items: [] }); lastKey = key; }
      groups[groups.length - 1].items.push(m);
    }

    const option = (value, label, current) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;
    root.innerHTML = `<div class="page">
      <section class="page-head">
        <div><h1>Match history</h1><p class="muted">${Utils.plural(s.matches.length, 'match', 'matches')}${s.meta.season ? ' in ' + esc(s.meta.season) : ''}.</p></div>
        ${main ? '<div class="toolbar"><a class="btn btn-primary" href="#/record">Record a match</a></div>' : ''}
      </section>
      <div class="filters card">
        <label class="field"><span class="label">Player</span>
          <select data-filter="player">${option('', 'Everyone', filters.player)}${Store.allPlayers().map(p => option(p.id, p.tag, filters.player)).join('')}</select></label>
        <label class="field"><span class="label">Type</span>
          <select data-filter="type">${option('', 'Singles and doubles', filters.type)}${option('singles', 'Singles', filters.type)}${option('doubles', 'Doubles', filters.type)}</select></label>
        <label class="field"><span class="label">Entered from</span>
          <select data-filter="source">${option('', 'Anywhere', filters.source)}${option('manual', 'Record page', filters.source)}${option('live', 'Live scoreboard', filters.source)}${option('bracket', 'Bracket', filters.source)}</select></label>
      </div>
      ${total ? groups.map(g => `<section class="day-group">
          <h2 class="day-title">${esc(g.label)}</h2>
          <ul class="match-list">${g.items.map(row).join('')}</ul>
        </section>`).join('')
        : UI.emptyState(s.matches.length
          ? { title: 'No matches fit these filters', text: 'Try changing or clearing a filter.' }
          : { title: 'No matches yet', text: 'Recorded matches will show up here.', actions: main ? '<a class="btn btn-primary" href="#/record">Record a match</a>' : '' })}
      ${total > limit ? `<div class="row row-center"><button type="button" class="btn btn-secondary" data-action="more">Show more (${total - limit} left)</button></div>` : ''}
    </div>`;

    const page = root.querySelector('.page');
    page.querySelectorAll('[data-filter]').forEach(sel => sel.addEventListener('change', () => {
      filters[sel.dataset.filter] = sel.value;
      limit = PAGE;
      render(root);
      root.querySelector(`[data-filter="${sel.dataset.filter}"]`).focus();
    }));
    page.addEventListener('click', e => {
      if (e.target.closest('[data-action="more"]')) { limit += PAGE; render(root); return; }
      const del = e.target.closest('[data-delete]');
      if (del) remove(del.dataset.delete);
    });
  }

  function row(m) {
    const main = Store.mode === 'main';
    const managed = Store.isBracketManaged(m);
    const b = managed ? Store.bracket(m.bracket.id) : null;
    const bracketLabel = m.bracket ? esc(m.bracket.name || 'Bracket') + (b ? ' · ' + esc(Bracket.roundName(b, m.bracket.round)) : '') : '';
    const badges = [
      `<span class="badge${m.type === 'doubles' ? ' badge-doubles' : ''}">${m.type === 'doubles' ? 'Doubles' : 'Singles'}</span>`,
      `<span class="badge">Bo${m.bestOf}</span>`,
      m.source === 'live' ? '<span class="badge badge-live">Live</span>' : '',
      m.bracket ? `<span class="badge badge-bracket">${bracketLabel}</span>` : ''
    ].join('');
    let actions = '';
    if (main && managed) {
      actions = `<a class="btn btn-sm btn-ghost" href="#/brackets/${encodeURIComponent(m.bracket.id)}">Open bracket</a>`;
    } else if (main) {
      actions = `<a class="btn btn-sm btn-ghost" href="#/record/${encodeURIComponent(m.id)}">Edit</a>` +
        `<button type="button" class="btn btn-sm btn-ghost btn-danger" data-delete="${esc(m.id)}">Delete</button>`;
    }
    return `<li class="match-row">
      <div class="mr-meta"><time datetime="${esc(m.playedAt)}">${esc(Utils.fmtTime(m.playedAt))}</time>${badges}</div>
      ${UI.matchSides(m)}
      <div class="mr-foot">
        <details class="mr-games"><summary>Game details</summary>${UI.gamesList(m)}</details>
        ${actions ? `<div class="mr-actions">${actions}</div>` : ''}
      </div>
    </li>`;
  }

  function remove(id) {
    UI.guard(async () => {
      const m = Store.match(id);
      if (!m) return;
      const ok = await UI.confirm({
        title: 'Delete this match?',
        message: `${Store.sideName(m.sides[0])} vs ${Store.sideName(m.sides[1])}, ${m.score[0]}–${m.score[1]} (${Utils.fmtDateTime(m.playedAt)}). Everyone's ratings will be recalculated without it.`,
        confirmLabel: 'Delete match',
        danger: true
      });
      if (!ok) return;
      const removed = UI.attempt(() => Store.deleteMatch(id));
      if (removed) UI.toast('Match deleted.', { action: { label: 'Undo', onClick: () => Store.restoreMatch(removed) } });
    });
  }
})();
