/* Brackets: the list, the "new bracket" form, and each bracket's page. */
(() => {
  const { esc } = Utils;
  let draft = null;   // the new-bracket form, kept while the page redraws

  Views.brackets = { render };

  function render(root, params) {
    if (params[0] === 'new') {
      if (Store.mode !== 'main') { location.replace('#/brackets'); return; }
      renderNew(root);
    } else if (params[0]) {
      renderBracket(root, params[0]);
    } else {
      renderList(root);
    }
  }

  const sideName = players => players.map(Store.nameOf).join(' & ');

  /* ---------- List ---------- */

  function renderList(root) {
    const s = Store.state;
    const main = Store.mode === 'main';
    const list = s.brackets.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    root.innerHTML = `<div class="page">
      <section class="page-head">
        <div><h1>Brackets</h1><p class="muted">Single-elimination tournaments. Bracket matches count toward the rankings too.</p></div>
        ${main ? '<div class="toolbar"><a class="btn btn-primary" href="#/brackets/new">New bracket</a></div>' : ''}
      </section>
      ${list.length ? `<div class="bracket-cards">${list.map(card).join('')}</div>` : UI.emptyState({
        title: 'No brackets yet',
        text: 'Run a class tournament. Players are seeded by rating so the best players meet in the final.',
        actions: main ? '<a class="btn btn-primary" href="#/brackets/new">New bracket</a>' : ''
      })}
    </div>`;
  }

  function card(b) {
    const champ = Bracket.champion(b);
    const next = Bracket.playable(b);
    const unit = b.type === 'doubles' ? 'team' : 'player';
    const progress = champ ? 'Finished' : next.length
      ? `${Bracket.roundName(b, next[0].round)}: ${Utils.plural(next.length, 'match', 'matches')} ready` : 'Waiting for results';
    return `<a class="card bracket-card" href="#/brackets/${encodeURIComponent(b.id)}">
      <div class="bc-top">
        <h2>${esc(b.name)}</h2>
        ${champ ? '<span class="badge badge-bracket">Finished</span>' : '<span class="badge badge-live">In progress</span>'}
      </div>
      ${champ ? `<p class="bc-champ"><span class="label">Champion</span> ${esc(sideName(champ.players))}</p>` : ''}
      <p class="muted small">${b.type === 'doubles' ? 'Doubles' : 'Singles'} · ${Utils.plural(b.entrants.length, unit)} · ${formatText(b)}</p>
      <p class="muted small">${esc(progress)} · Created ${esc(Utils.fmtDay(b.createdAt))}</p>
    </a>`;
  }

  function formatText(b) {
    return `Best of ${b.bestOf}` + (b.finalsBestOf !== b.bestOf ? `, final best of ${b.finalsBestOf}` : '');
  }

  /* ---------- New bracket ---------- */

  function newDraft() {
    const bestOf = Store.state.settings.bestOf;
    return {
      name: 'Tournament · ' + Utils.fmtShortDate(new Date().toISOString()),
      type: 'singles', bestOf, finalsBestOf: bestOf === 5 ? 5 : bestOf + 2, seeding: 'rating',
      selected: [], teamMethod: 'balanced', teams: [], teamsFor: '', teamsMethod: ''
    };
  }

  function renderNew(root) {
    if (!draft) draft = newDraft();
    const people = Store.activePlayers();
    if (people.length < 2) {
      root.innerHTML = UI.emptyState({ title: 'Add players first', text: 'A bracket needs at least two players.', actions: '<a class="btn btn-primary" href="#/players">Add players</a>' });
      return;
    }
    draft.selected = draft.selected.filter(id => people.some(p => p.id === id));
    const st = Store.stats();
    const periods = Store.periods();
    const boOptions = value => [1, 3, 5].map(n => `<option value="${n}"${n === value ? ' selected' : ''}>Best of ${n}</option>`).join('');

    root.innerHTML = `<div class="page">
      <section class="page-head">
        <div><p class="crumb"><a href="#/brackets">Brackets</a> /</p><h1>New bracket</h1>
          <p class="muted">Single elimination. Seeds come from the current ratings, so the top players meet last.</p></div>
      </section>
      <form class="card stack" data-new novalidate>
        <div class="form-row">
          <label class="field grow"><span class="label">Bracket name</span><input name="bracketName" maxlength="60" value="${esc(draft.name)}"></label>
          <div class="field"><span class="label">Type</span>
            ${UI.seg('bk-type', [{ value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' }], draft.type, { label: 'Type' })}</div>
        </div>
        <div class="form-row">
          <label class="field"><span class="label">Each match</span><select name="bestOf">${boOptions(draft.bestOf)}</select></label>
          <label class="field"><span class="label">Final</span><select name="finalsBestOf">${boOptions(draft.finalsBestOf)}</select></label>
          <div class="field"><span class="label">Seeding</span>
            ${UI.seg('bk-seed', [{ value: 'rating', label: 'By rating' }, { value: 'random', label: 'Random' }], draft.seeding, { label: 'Seeding' })}</div>
        </div>
        <fieldset class="entrants">
          <legend class="label">Who's playing?</legend>
          <div class="row entrant-tools">
            <button type="button" class="btn btn-sm btn-secondary" data-select="all">Everyone</button>
            <button type="button" class="btn btn-sm btn-secondary" data-select="none">No one</button>
            ${periods.length > 1 ? periods.map(per => `<button type="button" class="btn btn-sm btn-secondary" data-period="${esc(per)}">${esc(per)}</button>`).join('') : ''}
            <span class="entrant-count" data-count aria-live="polite"></span>
          </div>
          <div class="entrant-grid">${people.map(p => `
            <label class="entrant">
              <input type="checkbox" value="${esc(p.id)}"${draft.selected.includes(p.id) ? ' checked' : ''}>
              ${UI.avatar(p)}
              <span class="entrant-name">${esc(p.tag)}</span>
              <span class="entrant-rating">${Math.round(Stats.seedRating(st, draft.type, p.id))}</span>
            </label>`).join('')}</div>
        </fieldset>
        <div data-teams></div>
        <p class="form-error" role="alert" hidden></p>
        <div class="form-actions">
          <a class="btn btn-secondary" href="#/brackets">Cancel</a>
          <button type="submit" class="btn btn-primary btn-lg">Create bracket</button>
        </div>
      </form>
    </div>`;

    const form = root.querySelector('[data-new]');
    const teamsEl = form.querySelector('[data-teams]');
    const field = name => form.querySelector(`[name="${name}"]`);

    field('bracketName').addEventListener('input', e => { draft.name = e.target.value; });
    field('bestOf').addEventListener('change', e => { draft.bestOf = Number(e.target.value); });
    field('finalsBestOf').addEventListener('change', e => { draft.finalsBestOf = Number(e.target.value); });
    form.querySelectorAll('input[name="bk-seed"]').forEach(r => r.addEventListener('change', () => { draft.seeding = r.value; }));
    form.querySelectorAll('input[name="bk-type"]').forEach(r => r.addEventListener('change', () => {
      draft.type = r.value;
      renderNew(root);
      root.querySelector('input[name="bk-type"]:checked').focus();
    }));

    const boxes = () => [...form.querySelectorAll('.entrant-grid input[type="checkbox"]')];
    const syncBoxes = () => boxes().forEach(box => { box.checked = draft.selected.includes(box.value); });
    form.querySelector('.entrant-grid').addEventListener('change', e => {
      if (e.target.type !== 'checkbox') return;
      draft.selected = boxes().filter(b => b.checked).map(b => b.value);
      refreshTeams(form);
    });
    form.querySelector('.entrant-tools').addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.select === 'all') draft.selected = people.map(p => p.id);
      else if (btn.dataset.select === 'none') draft.selected = [];
      else if (btn.dataset.period) draft.selected = people.filter(p => p.period === btn.dataset.period).map(p => p.id);
      syncBoxes();
      refreshTeams(form);
    });

    teamsEl.addEventListener('change', e => {
      if (e.target.name === 'bk-teams') {
        draft.teamMethod = e.target.value;
        refreshTeams(form);
        const again = form.querySelector('input[name="bk-teams"]:checked');
        if (again) again.focus();
      } else if (e.target.matches('[data-team]')) {
        const [ti, k] = e.target.dataset.team.split('-').map(Number);
        const chosen = e.target.value;
        const previous = draft.teams[ti][k];
        // Swap with wherever the chosen player was, so nobody is on two teams.
        draft.teams.forEach((team, tj) => team.forEach((pid, kj) => {
          if (pid === chosen && !(tj === ti && kj === k)) draft.teams[tj][kj] = previous;
        }));
        draft.teams[ti][k] = chosen;
        refreshTeams(form);
        const again = form.querySelector(`[data-team="${ti}-${k}"]`);
        if (again) again.focus();
      }
    });
    teamsEl.addEventListener('click', e => {
      if (e.target.closest('[data-reshuffle]')) { ensureTeams(true); refreshTeams(form); }
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      UI.guard(() => create(form));
    });

    refreshTeams(form);
  }

  // Works out doubles teams again when the players or the method change.
  function ensureTeams(force = false) {
    const members = draft.selected.slice().sort().join(',');
    const method = draft.teamMethod;
    const stale = force || draft.teamsFor !== members || (method !== 'manual' && draft.teamsMethod !== method);
    if (!stale) return;
    const st = Store.stats();
    draft.teams = Bracket.makeTeams(draft.selected, method === 'random' ? 'random' : 'balanced', id => Stats.seedRating(st, 'doubles', id));
    draft.teamsFor = members;
    draft.teamsMethod = method === 'manual' ? 'balanced' : method;
  }

  function refreshTeams(form) {
    const n = draft.selected.length;
    const doubles = draft.type === 'doubles';
    form.querySelector('[data-count]').textContent = doubles
      ? `${n} selected${n >= 2 ? ` · ${Math.floor(n / 2)} teams` : ''}` : `${n} selected`;
    const teamsEl = form.querySelector('[data-teams]');
    if (!doubles) { teamsEl.innerHTML = ''; return; }
    if (n < 4) { teamsEl.innerHTML = '<p class="muted">Pick at least four players for a doubles bracket.</p>'; return; }
    if (n % 2) { teamsEl.innerHTML = `<div class="notice">Pick an even number of players so everyone has a partner (${n} selected).</div>`; return; }
    ensureTeams();
    const manual = draft.teamMethod === 'manual';
    const help = {
      balanced: 'Balanced pairs the highest-rated player with the lowest-rated, the second-highest with the second-lowest, and so on.',
      random: 'Teams are drawn at random.',
      manual: 'Choose the players for each team.'
    }[draft.teamMethod];
    const options = selected => draft.selected.map(id =>
      `<option value="${esc(id)}"${id === selected ? ' selected' : ''}>${esc(Store.nameOf(id))}</option>`).join('');
    teamsEl.innerHTML = `<fieldset class="teams">
      <legend class="label">Teams</legend>
      <div class="row">
        ${UI.seg('bk-teams', [{ value: 'balanced', label: 'Balanced' }, { value: 'random', label: 'Random' }, { value: 'manual', label: 'Pick myself' }], draft.teamMethod, { label: 'How teams are made' })}
        ${draft.teamMethod === 'random' ? '<button type="button" class="btn btn-sm btn-secondary" data-reshuffle>Shuffle again</button>' : ''}
      </div>
      <p class="muted small">${help}</p>
      <ol class="team-list">${draft.teams.map((team, ti) => `<li class="team-row">
        <span class="team-no">Team ${ti + 1}</span>
        ${manual
          ? team.map((pid, k) => `<select data-team="${ti}-${k}" aria-label="Team ${ti + 1}, player ${k + 1}">${options(pid)}</select>`).join('<span class="amp">&amp;</span>')
          : `<span class="team-names">${esc(Store.nameOf(team[0]))} &amp; ${esc(Store.nameOf(team[1]))}</span>`}
      </li>`).join('')}</ol>
    </fieldset>`;
  }

  function create(form) {
    const errorEl = form.querySelector('.form-error');
    const fail = message => { errorEl.textContent = message; errorEl.hidden = false; };
    const doubles = draft.type === 'doubles';
    if (doubles) {
      if (draft.selected.length < 4) return fail('Pick at least four players for a doubles bracket.');
      if (draft.selected.length % 2) return fail('Pick an even number of players so everyone has a partner.');
      ensureTeams();
    } else if (draft.selected.length < 2) {
      return fail('Pick at least two players.');
    }
    try {
      const b = Store.createBracket({
        name: draft.name, type: draft.type, bestOf: draft.bestOf, finalsBestOf: draft.finalsBestOf, seeding: draft.seeding,
        teams: doubles ? draft.teams : draft.selected.map(id => [id])
      });
      draft = null;
      UI.toast(`Bracket created with ${Utils.plural(b.entrants.length, doubles ? 'team' : 'player')}.`, { kind: 'success' });
      location.hash = '#/brackets/' + encodeURIComponent(b.id);
    } catch (err) {
      fail(err.message);
    }
  }

  /* ---------- One bracket ---------- */

  function renderBracket(root, id) {
    const b = Store.bracket(id);
    if (!b) {
      root.innerHTML = UI.emptyState({ title: 'Bracket not found', text: 'It may have been deleted.', actions: '<a class="btn btn-secondary" href="#/brackets">All brackets</a>' });
      return;
    }
    const main = Store.mode === 'main';
    const champ = Bracket.champion(b);
    root.innerHTML = `<div class="page">
      <section class="page-head">
        <div><p class="crumb"><a href="#/brackets">Brackets</a> /</p><h1>${esc(b.name)}</h1>
          <p class="muted">${b.type === 'doubles' ? 'Doubles' : 'Singles'} · ${Utils.plural(b.entrants.length, b.type === 'doubles' ? 'team' : 'player')} ·
            ${formatText(b)} · Seeded ${b.seeding === 'random' ? 'at random' : 'by rating'}</p></div>
        ${main ? '<div class="toolbar"><button type="button" class="btn btn-secondary btn-danger" data-action="delete">Delete bracket</button></div>' : ''}
      </section>
      ${champ ? `<div class="champion card"><span class="trophy" aria-hidden="true">🏆</span>
        <div><p class="label">Champion</p><p class="champion-name">${champ.players.map(UI.nameLink).join(' &amp; ')}</p></div></div>` : ''}
      <div class="bk-scroll" tabindex="0" role="region" aria-label="Bracket. Scroll sideways to see every round.">${tree(b, main)}</div>
      ${main && !champ ? '<p class="muted small">When both sides of a match are set, use <strong>Report</strong> to enter the result or <strong>Play live</strong> to keep score on the big screen. A result can be undone until the winner plays their next match.</p>' : ''}
    </div>`;

    const page = root.querySelector('.page');
    page.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const ref = key => btn.dataset[key].split('-').map(Number);
      if (btn.dataset.report) report(b.id, ...ref('report'));
      else if (btn.dataset.live) { const [r, i] = ref('live'); UI.guard(() => Views.live.startFromBracket(b.id, r, i)); }
      else if (btn.dataset.undo) undoResult(b.id, ...ref('undo'));
      else if (btn.dataset.action === 'delete') removeBracket(b.id);
    });
  }

  function tree(b, main) {
    return `<div class="bk-tree">${b.rounds.map((round, r) => `
      <div class="bk-round">
        <h2 class="bk-round-title">${esc(Bracket.roundName(b, r))} <span class="muted">· Bo${Bracket.bestOfFor(b, r)}</span></h2>
        <div class="bk-round-body">${round.map((m, i) => `<div class="bk-slot">${matchCard(b, m, r, i, main)}</div>`).join('')}</div>
      </div>`).join('')}</div>`;
  }

  function matchCard(b, m, r, i, main) {
    const ready = m.slots[0] && m.slots[1] && m.winner === null;
    const lines = [0, 1].map(k => {
      const e = m.slots[k] ? Bracket.entrant(b, m.slots[k]) : null;
      const won = m.winner === k;
      const lost = m.winner !== null && !won;
      const name = e ? sideName(e.players) : (m.bye ? 'Bye' : 'TBD');
      // Each entrant's main, so the bracket reads like a tournament overlay.
      const mains = e ? e.players.map(pid => { const p = Store.player(pid); return p && p.main ? UI.charIcon(p.main, 20) : ''; }).join('') : '';
      return `<div class="bk-line${won ? ' is-winner' : ''}${lost ? ' is-loser' : ''}${e ? '' : ' is-empty'}">
        <span class="bk-seed">${e ? e.seed : ''}</span>
        <span class="bk-name" title="${esc(name)}">${mains ? `<span class="bk-mains">${mains}</span>` : ''}${esc(name)}</span>
        <span class="bk-score">${m.score ? m.score[k] : ''}</span>
      </div>`;
    }).join('');
    let actions = '';
    if (main && ready) {
      actions = `<div class="bk-actions">
        <button type="button" class="btn btn-sm btn-primary" data-report="${r}-${i}">Report</button>
        <button type="button" class="btn btn-sm btn-secondary" data-live="${r}-${i}">Play live</button>
      </div>`;
    } else if (main && Bracket.canUndo(b, r, i)) {
      actions = `<div class="bk-actions"><button type="button" class="btn btn-sm btn-ghost" data-undo="${r}-${i}">Undo result</button></div>`;
    }
    return `<div class="bk-match${m.bye ? ' is-bye' : ''}${ready ? ' is-ready' : ''}">${lines}${actions}</div>`;
  }

  function report(bracketId, r, i) {
    UI.guard(() => {
      const b = Store.bracket(bracketId);
      const bm = b && b.rounds[r][i];
      if (!bm || !bm.slots[0] || !bm.slots[1] || bm.winner !== null) return;
      const sides = bm.slots.map(id => Bracket.entrant(b, id).players.slice());
      let entry = null;
      UI.modal({
        title: `${Bracket.roundName(b, r)}: ${sideName(sides[0])} vs ${sideName(sides[1])}`,
        wide: true,
        body: '<div data-entry></div>',
        onOpen: api => {
          entry = UI.setEntry(api.el.querySelector('[data-entry]'), {
            type: b.type, sides, bestOf: Bracket.bestOfFor(b, r), stocks: Store.state.settings.stocks
          });
        },
        actions: [
          { label: 'Cancel' },
          {
            label: 'Save result', kind: 'primary', onClick: () => {
              const res = entry.result();
              if (!res) throw new Error('Finish the set first: pick who won each game.');
              const m = Store.reportBracketResult(bracketId, r, i, { games: res.games, source: 'bracket' });
              Views.record.announce(m);
              const champ = Bracket.champion(Store.bracket(bracketId));
              if (champ) UI.toast(`🏆 ${sideName(champ.players)} won ${b.name}!`, { kind: 'success', timeout: 10000 });
            }
          }
        ]
      });
    });
  }

  function undoResult(bracketId, r, i) {
    UI.guard(async () => {
      const b = Store.bracket(bracketId);
      const bm = b && b.rounds[r][i];
      if (!bm) return;
      const ok = await UI.confirm({
        title: 'Undo this result?',
        message: `${sideName(Bracket.entrant(b, bm.slots[0]).players)} vs ${sideName(Bracket.entrant(b, bm.slots[1]).players)} goes back to unplayed, and the match is removed from the history.`,
        confirmLabel: 'Undo result',
        danger: true
      });
      if (ok) UI.attempt(() => { Store.undoBracketResult(bracketId, r, i); UI.toast('Result undone.'); });
    });
  }

  function removeBracket(bracketId) {
    UI.guard(async () => {
      const b = Store.bracket(bracketId);
      if (!b) return;
      const ok = await UI.confirm({
        title: `Delete "${b.name}"?`,
        message: 'The bracket is removed. Matches already played stay in the match history and still count toward ratings.',
        confirmLabel: 'Delete bracket',
        danger: true
      });
      if (!ok) return;
      Store.deleteBracket(bracketId);
      UI.toast('Bracket deleted.');
      location.hash = '#/brackets';
    });
  }
})();
