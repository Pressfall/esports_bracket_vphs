/* Leaderboard: top-3 podium, the standings table and recent activity. */
(() => {
  const { esc } = Utils;

  Views.leaderboard = { render };

  function render(root) {
    const s = Store.state;
    if (!s.players.length) {
      root.innerHTML = welcome();
      bindWelcome(root);
      return;
    }

    const mode = Store.prefs.get('lbMode', 'singles') === 'doubles' ? 'doubles' : 'singles';
    const modeLabel = mode === 'doubles' ? 'Doubles' : 'Singles';
    const periods = Store.periods();
    let period = Store.prefs.get('lbPeriod', '');
    if (!periods.includes(period)) period = '';
    const { ranked, unranked } = Stats.rankings(Store.stats(), mode, Store.activePlayers(), { period });
    const main = Store.mode === 'main';

    root.innerHTML = `<div class="page">
      ${s.meta.isSample && main ? `<div class="notice no-print"><span><strong>This is sample data</strong> for trying the site out.
        When you're ready for your class, erase it in Settings.</span><a class="btn btn-sm btn-secondary" href="#/settings">Settings</a></div>` : ''}
      <section class="page-head no-print">
        <div>
          <h1>Leaderboard</h1>
          <p class="muted">${modeLabel} rankings${period ? ' · ' + esc(period) : ''}${s.meta.season ? ' · ' + esc(s.meta.season) : ''}</p>
        </div>
        <div class="toolbar">
          ${UI.seg('lb-mode', [{ value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' }], mode, { label: 'Ranking type' })}
          ${periods.length > 1 ? `<label><span class="visually-hidden">Class period</span><select class="select-inline" data-period>
            <option value="">All periods</option>${periods.map(p => `<option${p === period ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></label>` : ''}
          <button type="button" class="btn btn-secondary" data-action="how">How ratings work</button>
          <button type="button" class="btn btn-secondary" data-action="print">Print</button>
        </div>
      </section>
      <div class="lb-layout">
        <div class="lb-main">
          ${ranked.length ? podium(ranked.slice(0, 3)) + table(ranked, modeLabel, period) : UI.emptyState({
            title: `No ${modeLabel.toLowerCase()} sets yet`,
            text: 'Rankings show up here after the first match is recorded.',
            actions: main ? '<a class="btn btn-primary" href="#/record">Record a match</a><a class="btn btn-secondary" href="#/live">Start a live match</a>' : ''
          })}
          ${unranked.length ? `<div class="unranked no-print"><span class="label">Haven't played ${modeLabel.toLowerCase()} yet</span>
            ${unranked.map(p => `<a class="chip-link" href="#/player/${encodeURIComponent(p.id)}">${esc(p.tag)}</a>`).join('')}</div>` : ''}
        </div>
        <aside class="lb-side no-print" aria-label="Activity">${sidebar(mode)}</aside>
      </div>
    </div>`;

    root.querySelectorAll('input[name="lb-mode"]').forEach(radio => radio.addEventListener('change', () => {
      Store.prefs.set('lbMode', radio.value);
      render(root);
      const again = root.querySelector('input[name="lb-mode"]:checked');
      if (again) again.focus();
    }));
    const periodSelect = root.querySelector('[data-period]');
    if (periodSelect) periodSelect.addEventListener('change', () => {
      Store.prefs.set('lbPeriod', periodSelect.value);
      render(root);
      root.querySelector('[data-period]').focus();
    });
    root.querySelector('[data-action="how"]').addEventListener('click', explain);
    root.querySelector('[data-action="print"]').addEventListener('click', () => window.print());
  }

  function podium(top) {
    const places = ['1st', '2nd', '3rd'];
    return `<ol class="podium no-print" aria-label="Top ${top.length}">${top.map((row, i) => `
      <li class="podium-card podium-${i + 1}">
        <span class="podium-place">${places[i]}</span>
        ${UI.avatar(row.player, 'avatar-lg')}
        <a class="podium-name" href="#/player/${encodeURIComponent(row.player.id)}">${esc(row.player.tag)}</a>
        <span class="podium-rating">${Math.round(row.rec.rating)}</span>
        <span class="podium-meta">${row.rec.wins}–${row.rec.losses}${row.player.main ? ' · ' + esc(row.player.main) : ''}</span>
      </li>`).join('')}</ol>`;
  }

  function table(ranked, modeLabel, period) {
    const s = Store.state;
    const printLine = [s.meta.season, modeLabel + ' standings', period, 'Printed ' + new Date().toLocaleDateString()].filter(Boolean).join(' · ');
    const provisional = ranked.some(row => row.rec.sets < s.settings.provisionalSets);
    return `
      <div class="print-only print-head">
        <img class="print-logo" src="${esc(Brand.logo)}" alt="">
        <div><h1>${esc(s.meta.title)}</h1><p><strong>${esc(Brand.org)}</strong></p><p>${esc(printLine)}</p></div>
      </div>
      <div class="table-wrap">
        <table class="table lb-table">
          <thead><tr>
            <th scope="col" class="num">#</th>
            <th scope="col">Player</th>
            <th scope="col" class="hide-md">Main</th>
            <th scope="col" class="num">Rating</th>
            <th scope="col" class="num">Sets W–L</th>
            <th scope="col" class="num hide-sm">Win %</th>
            <th scope="col" class="num hide-lg"><span title="Games won minus games lost">Games ±</span></th>
            <th scope="col" class="hide-sm">Streak</th>
            <th scope="col" class="hide-lg">Last 5</th>
          </tr></thead>
          <tbody>${ranked.map(row => {
            const r = row.rec;
            const diff = r.gamesWon - r.gamesLost;
            return `<tr>
              <td class="num"><span class="rank rank-${row.rank}">${row.rank}</span></td>
              <td>${UI.playerLink(row.player)}</td>
              <td class="hide-md">${UI.charPill(row.player.main) || '<span class="muted">—</span>'}</td>
              <td class="num nowrap">${UI.rating(r)}${UI.delta(r.lastDelta)}</td>
              <td class="num">${r.wins}–${r.losses}</td>
              <td class="num hide-sm">${Utils.pct(r.wins, r.sets)}</td>
              <td class="num hide-lg">${diff > 0 ? '+' + diff : diff < 0 ? '−' + Math.abs(diff) : '0'}</td>
              <td class="hide-sm">${UI.streak(r.streak)}</td>
              <td class="hide-lg">${UI.resultDots(r.results)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
      ${provisional ? `<p class="footnote">* Provisional: fewer than ${s.settings.provisionalSets} sets played, so the rating is still settling.</p>` : ''}`;
  }

  function sidebar(mode) {
    const s = Store.state;
    const parts = [];

    const live = Store.mode === 'main' ? Store.getLive() : null;
    if (live && (live.phase === 'playing' || live.phase === 'between') && Array.isArray(live.sides)) {
      parts.push(`<div class="card side-card live-card">
        <h2 class="side-title"><span class="live-dot" aria-hidden="true"></span>Live match</h2>
        <p>${esc(Store.sideName(live.sides[0]))} <span class="muted">vs</span> ${esc(Store.sideName(live.sides[1]))}</p>
        <a class="btn btn-primary btn-block" href="#/live">Back to the scoreboard</a>
      </div>`);
    }

    s.brackets.filter(b => !Bracket.champion(b)).slice(0, 2).forEach(b => {
      const next = Bracket.playable(b);
      parts.push(`<div class="card side-card">
        <h2 class="side-title">Bracket in progress</h2>
        <p><strong>${esc(b.name)}</strong></p>
        ${next.length ? `<p class="muted small">${esc(Bracket.roundName(b, next[0].round))}: ${Utils.plural(next.length, 'match', 'matches')} ready</p>` : ''}
        <a class="btn btn-secondary btn-block" href="#/brackets/${encodeURIComponent(b.id)}">View bracket</a>
      </div>`);
    });

    const recent = Stats.sortMatches(s.matches.filter(m => m.type === mode)).slice(-5).reverse();
    parts.push(`<div class="card side-card">
      <h2 class="side-title">Recent ${mode} matches</h2>
      ${recent.length ? `<ul class="recent">${recent.map(m => {
        const w = m.winner;
        return `<li>
          <span>${m.sides[w].map(UI.nameLink).join(' &amp; ')} <span class="muted">beat</span> ${m.sides[1 - w].map(UI.nameLink).join(' &amp; ')}</span>
          <span class="recent-meta"><strong>${m.score[w]}–${m.score[1 - w]}</strong> · ${esc(Utils.fmtDay(m.playedAt))}</span>
        </li>`;
      }).join('')}</ul><a class="side-more" href="#/matches">All matches →</a>` : '<p class="muted small">None yet.</p>'}
    </div>`);
    return parts.join('');
  }

  function explain() {
    const { kFactor: k, startRating: start, provisionalSets } = Store.state.settings;
    UI.modal({
      title: 'How ratings work',
      body: `
        <p>Everyone starts at <strong>${start}</strong>. When you win a set, you take rating points from the
        player you beat. When you lose, they take points from you.</p>
        <ul class="plain-list">
          <li><strong>Beat someone rated higher</strong> and you gain more points, up to ${k}.</li>
          <li><strong>Beat someone rated lower</strong> and you gain fewer.</li>
          <li>Two players with the same rating play for ${Math.round(k / 2)} points.</li>
          <li>Only who wins the set counts. A 2–0 and a 2–1 are worth the same.</li>
          <li>Singles and doubles ratings are separate. In doubles, your team plays at the average rating of you
            and your partner, and you both gain or lose the same amount.</li>
          ${provisionalSets ? `<li>A <strong>*</strong> means fewer than ${provisionalSets} sets played, so the rating is still settling.</li>` : ''}
        </ul>
        <p class="muted small">This is the Elo system used in chess and many esports rankings (K = ${k}).</p>`
    });
  }

  function welcome() {
    const s = Store.state;
    const main = Store.mode === 'main';
    return `<div class="page">
      <section class="hero card">
        <div class="hero-text">
          <p class="hero-kicker">${esc(Brand.org)}</p>
          <h1 class="hero-title">${esc(s.meta.title)}</h1>
          <p class="hero-lead">Super Smash Bros. results for our esports class: Elo rankings for singles and doubles,
            tournament brackets, and a live scoreboard for the projector.${s.meta.season ? ` ${esc(s.meta.season)} season.` : ''}</p>
          ${main ? `<div class="row">
              <a class="btn btn-primary btn-lg" href="#/players">Add your players</a>
              <button type="button" class="btn btn-secondary btn-lg" data-action="sample">Try with sample data</button>
            </div>
            <p class="muted small">Sample data is a made-up class you can click around in. You can erase it from Settings.</p>`
          : '<p class="muted">No scores have been published yet.</p>'}
        </div>
        <img class="hero-logo" src="${esc(Brand.logo)}" alt="${esc(Brand.logoAlt)}" width="240" height="243">
      </section>
      <ol class="steps">
        <li class="card"><span class="step-no">1</span><h2>Add players</h2><p>Type in your roster, or paste a whole list at once.</p></li>
        <li class="card"><span class="step-no">2</span><h2>Play and record</h2><p>Enter results after a set, or keep score live on the big screen.</p></li>
        <li class="card"><span class="step-no">3</span><h2>Climb the rankings</h2><p>Ratings update after every set. Run brackets for tournament days.</p></li>
      </ol>
    </div>`;
  }

  function bindWelcome(root) {
    const sample = root.querySelector('[data-action="sample"]');
    if (sample) sample.addEventListener('click', () => UI.guard(() => {
      Store.loadSample();
      UI.toast('Sample data loaded. Erase it from Settings when you\'re done exploring.', { kind: 'success' });
    }));
  }
})();
