/* One player's page: ratings, rating chart, head-to-head, characters, partners, recent matches. */
(() => {
  const { esc } = Utils;

  Views.profile = { render };

  function render(root, params) {
    const p = Store.player(params[0]);
    if (!p) {
      root.innerHTML = UI.emptyState({ title: 'Player not found', text: 'They may have been deleted.', actions: '<a class="btn btn-secondary" href="#/players">All players</a>' });
      return;
    }
    const st = Store.stats();
    const recs = { singles: st.singles.get(p.id), doubles: st.doubles.get(p.id) };
    const played = m => !!(recs[m] && recs[m].sets);
    let mode = Store.prefs.get('profileMode', 'singles') === 'doubles' ? 'doubles' : 'singles';
    const other = mode === 'singles' ? 'doubles' : 'singles';
    if (!played(mode) && played(other)) mode = other;
    const rec = recs[mode];
    const rankOf = m => {
      const list = Stats.rankings(st, m, Store.activePlayers()).ranked;
      const row = list.find(r => r.player.id === p.id);
      return row ? { rank: row.rank, of: list.length } : null;
    };

    root.innerHTML = `<div class="page">
      <section class="card profile-head">
        ${UI.avatar(p, 'avatar-xl')}
        <div class="profile-id">
          <h1>${esc(p.tag)}</h1>
          <p class="muted">${[p.name !== p.tag ? esc(p.name) : '', p.period ? esc(p.period) : ''].filter(Boolean).join(' · ')}
            ${p.archived ? '<span class="badge">Archived</span>' : ''}</p>
          ${p.main ? `<p class="profile-main"><span class="label">Main</span> ${UI.charPill(p.main)}</p>` : ''}
        </div>
        ${Store.mode === 'main' ? '<div class="profile-actions"><button type="button" class="btn btn-secondary" data-edit>Edit player</button></div>' : ''}
      </section>

      <div class="stat-cards">${['singles', 'doubles'].map(m => statCard(m, recs[m], rankOf(m))).join('')}</div>

      ${played('singles') || played('doubles') ? `
        <div class="section-head">
          <h2>${mode === 'doubles' ? 'Doubles' : 'Singles'} details</h2>
          ${UI.seg('profile-mode', [{ value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' }], mode, { label: 'Show details for' })}
        </div>
        ${played(mode) ? details(p, mode, rec, st) : UI.emptyState({ title: `No ${mode} sets yet`, text: `${p.tag} hasn't played ${mode} yet.` })}`
      : UI.emptyState({ title: 'No matches yet', text: `Once ${p.tag} plays a set, their rating history, rivals and characters show up here.` })}
    </div>`;

    const page = root.querySelector('.page');
    const editBtn = page.querySelector('[data-edit]');
    if (editBtn) editBtn.addEventListener('click', () => Views.players.openEditor(p.id));
    page.querySelectorAll('input[name="profile-mode"]').forEach(radio => radio.addEventListener('change', () => {
      Store.prefs.set('profileMode', radio.value);
      render(root, params);
      const again = root.querySelector('input[name="profile-mode"]:checked');
      if (again) again.focus();
    }));
    const chartEl = page.querySelector('[data-chart]');
    if (chartEl) UI.mountRatingChart(chartEl, { points: chartPoints(p, rec, st), start: st.start });
  }

  function statCard(mode, rec, rank) {
    const title = mode === 'doubles' ? 'Doubles' : 'Singles';
    if (!rec || !rec.sets) {
      return `<div class="card stat-card"><div class="stat-head"><h2 class="card-title">${title}</h2></div>
        <p class="muted">No sets yet.</p></div>`;
    }
    const prov = rec.sets < Store.state.settings.provisionalSets;
    return `<div class="card stat-card">
      <div class="stat-head"><h2 class="card-title">${title}</h2>${rank ? `<span class="badge">#${rank.rank} of ${rank.of}</span>` : ''}</div>
      <p class="stat-big">${Math.round(rec.rating)}${prov ? '<span class="prov" title="Provisional: still settling">*</span>' : ''}
        <span class="stat-unit">rating</span></p>
      <dl class="mini-stats">
        <div><dt>Record</dt><dd>${rec.wins}–${rec.losses}</dd></div>
        <div><dt>Win %</dt><dd>${Utils.pct(rec.wins, rec.sets)}</dd></div>
        <div><dt>Peak</dt><dd>${Math.round(rec.peak)}</dd></div>
        <div><dt>Streak</dt><dd>${UI.streak(rec.streak)}</dd></div>
      </dl>
    </div>`;
  }

  // Short description of one set from this player's side.
  function setLine(p, m) {
    const si = m.sides[0].includes(p.id) ? 0 : 1;
    const won = m.winner === si;
    const partner = m.sides[si].filter(id => id !== p.id).map(Store.nameOf)[0];
    return {
      si, won,
      text: `${won ? 'Won' : 'Lost'} ${m.score[si]}–${m.score[1 - si]} vs ${Store.sideName(m.sides[1 - si])}${partner ? ` (with ${partner})` : ''}`
    };
  }

  function chartPoints(p, rec, st) {
    const byId = new Map(Store.state.matches.map(m => [m.id, m]));
    return [{ rating: st.start, date: null, title: 'Starting rating', detail: '' }].concat(rec.history.map((h, i) => {
      const m = byId.get(h.matchId);
      return {
        rating: h.rating,
        date: h.playedAt,
        title: `Set ${i + 1} · ${Utils.fmtShortDate(h.playedAt)}`,
        detail: `${setLine(p, m).text} · ${Utils.signed(h.delta)}`
      };
    }));
  }

  function details(p, mode, rec, st) {
    const byId = new Map(Store.state.matches.map(m => [m.id, m]));
    const sets = rec.history.map((h, i) => ({ ...h, n: i + 1, m: byId.get(h.matchId) })).reverse();

    const h2h = [...(st.h2h[mode].get(p.id) || new Map()).entries()]
      .map(([opp, r]) => ({ opp, ...r }))
      .sort((a, b) => b.sets - a.sets || String(b.last).localeCompare(String(a.last)));

    const chars = [...(st.chars[mode].get(p.id) || new Map()).entries()]
      .map(([name, c]) => ({ name, ...c }))
      .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));

    const partners = mode === 'doubles'
      ? [...(st.partners.get(p.id) || new Map()).entries()].map(([id, r]) => ({ id, ...r })).sort((a, b) => b.sets - a.sets)
      : [];

    const stockLine = mode === 'singles' && rec.stockGames
      ? `<p class="muted small">Average stocks left in game wins: <strong>${(rec.stocksInWins / rec.stockGames).toFixed(1)}</strong></p>` : '';

    return `
      <section class="card">
        <h3 class="card-title">Rating over time</h3>
        <div data-chart></div>
        <details class="chart-table">
          <summary>Show as a table</summary>
          <div class="table-wrap table-wrap-flat"><table class="table table-compact">
            <thead><tr><th scope="col" class="num">Set</th><th scope="col">Date</th><th scope="col">Result</th>
              <th scope="col" class="num">Change</th><th scope="col" class="num">Rating</th></tr></thead>
            <tbody>${sets.map(h => `<tr>
              <td class="num">${h.n}</td>
              <td class="nowrap">${esc(Utils.fmtShortDate(h.playedAt))}</td>
              <td>${esc(setLine(p, h.m).text)}</td>
              <td class="num">${UI.delta(h.delta)}</td>
              <td class="num">${Math.round(h.rating)}</td>
            </tr>`).join('')}</tbody>
          </table></div>
        </details>
      </section>

      <div class="grid-2">
        <section class="card">
          <h3 class="card-title">Head-to-head</h3>
          ${h2h.length ? `<div class="table-wrap table-wrap-flat"><table class="table table-compact">
            <thead><tr><th scope="col">Opponent</th><th scope="col" class="num">Sets</th><th scope="col" class="num">Games</th><th scope="col" class="num hide-sm">Last played</th></tr></thead>
            <tbody>${h2h.map(r => `<tr>
              <td>${UI.playerLink(Store.player(r.opp), { showName: false })}</td>
              <td class="num"><span class="${r.wins > r.losses ? 'pos' : r.wins < r.losses ? 'neg' : ''}">${r.wins}–${r.losses}</span></td>
              <td class="num">${r.gamesWon}–${r.gamesLost}</td>
              <td class="num hide-sm">${esc(Utils.fmtShortDate(r.last))}</td>
            </tr>`).join('')}</tbody>
          </table></div>` : '<p class="muted">No opponents yet.</p>'}
        </section>
        <section class="card">
          <h3 class="card-title">Characters played</h3>
          ${chars.length ? UI.barList(chars.map(c => ({
            label: c.name,
            labelHtml: `${UI.charIcon(c.name, 24)}<span>${esc(c.name)}</span>`,
            value: c.games,
            valueHtml: `${c.games} <span class="muted">· ${Utils.pct(c.wins, c.games)} won</span>`,
            title: `${c.name}: ${Utils.plural(c.games, 'game')}, won ${c.wins}`
          }))) : '<p class="muted">No characters recorded yet.</p>'}
          ${stockLine}
        </section>
      </div>

      ${partners.length ? `<section class="card">
        <h3 class="card-title">Doubles partners</h3>
        <div class="table-wrap table-wrap-flat"><table class="table table-compact">
          <thead><tr><th scope="col">Partner</th><th scope="col" class="num">Sets together</th><th scope="col" class="num">Record</th><th scope="col" class="num hide-sm">Last played</th></tr></thead>
          <tbody>${partners.map(r => `<tr>
            <td>${UI.playerLink(Store.player(r.id), { showName: false })}</td>
            <td class="num">${r.sets}</td>
            <td class="num">${r.wins}–${r.losses}</td>
            <td class="num hide-sm">${esc(Utils.fmtShortDate(r.last))}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </section>` : ''}

      <section class="card">
        <h3 class="card-title">Recent ${mode} matches</h3>
        <ul class="match-list match-list-compact">${sets.slice(0, 8).map(h => `<li class="match-row">
          <div class="mr-meta"><time datetime="${esc(h.playedAt)}">${esc(Utils.fmtDateTime(h.playedAt))}</time>
            ${h.m.bracket ? `<span class="badge badge-bracket">${esc(h.m.bracket.name || 'Bracket')}</span>` : ''}</div>
          ${UI.matchSides(h.m)}
        </li>`).join('')}</ul>
        ${sets.length > 8 ? `<a class="side-more" href="#/matches/${encodeURIComponent(p.id)}">All of ${esc(p.tag)}'s matches →</a>` : ''}
      </section>`;
  }
})();
