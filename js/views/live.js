/* Live scoreboard: count stocks on the big screen during a set.
   The set saves to match history (and its bracket) by itself when it ends.
   Its progress is kept in browser storage, so a refresh doesn't lose it. */
(() => {
  const { esc } = Utils;
  const PHASES = ['setup', 'playing', 'between', 'done'];
  let root = null;
  let live = null;        // the match on the scoreboard (same shape as what's stored)
  let setupForm = null;   // the setup form, kept while the page redraws
  let keysOn = false;

  // Manages its own redraws, so it isn't redrawn when scores change elsewhere.
  Views.live = { manual: true, render, leave, startFromBracket };

  const mainOf = pid => { const p = pid && Store.player(pid); return (p && p.main) || ''; };
  const sideLabel = si => Store.sideName(live.sides[si]);
  const needed = () => Math.ceil(live.bestOf / 2);
  const score = () => [0, 1].map(si => live.games.filter(g => g.winner === si).length);
  const sideTotal = si => live.stocksNow[si].reduce((a, b) => a + b, 0);
  const maxStocks = () => (live.type === 'doubles' ? live.stocks * 2 : live.stocks);
  const persist = () => Store.setLive(live);

  // Keyboard slots: singles 1 = left, 2 = right. Doubles 1–2 = red team, 3–4 = blue team.
  function slots() {
    const list = [];
    live.sides.forEach((side, si) => side.forEach((_, pi) => list.push([si, pi])));
    return list;
  }
  function slotKey(si, pi) {
    return slots().findIndex(([a, b]) => a === si && b === pi) + 1;
  }

  function load() {
    const saved = Store.getLive();
    if (!saved || !PHASES.includes(saved.phase) || !Array.isArray(saved.sides) || saved.sides.length !== 2) return null;
    const size = saved.type === 'doubles' ? 2 : 1;
    if (saved.sides.some(side => !Array.isArray(side) || side.length !== size)) return null;
    if (saved.phase !== 'setup') {
      if (saved.sides.flat().some(id => !Store.player(id))) return null;
      if (!Array.isArray(saved.games) || !Array.isArray(saved.stocksNow) || !Array.isArray(saved.undo) || !Array.isArray(saved.chars)) return null;
    }
    return saved;
  }

  function render(el) {
    root = el;
    live = load();
    if (!live) Store.clearLive();
    if (!live || live.phase === 'setup') renderSetup();
    else renderStage();
  }

  function leave() {
    setKeys(false);
    document.body.classList.remove('stage-mode');
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }

  /* ---------- Setup ---------- */

  function blankSides(type) {
    return type === 'doubles' ? [['', ''], ['', '']] : [[''], ['']];
  }

  function renderSetup() {
    setKeys(false);
    document.body.classList.remove('stage-mode');
    const s = Store.state;
    if (!setupForm) {
      const pre = live && live.phase === 'setup' ? live : null;
      const type = pre ? pre.type : (Store.prefs.get('liveType', 'singles') === 'doubles' ? 'doubles' : 'singles');
      const sides = pre ? Utils.clone(pre.sides) : blankSides(type);
      setupForm = {
        type, sides,
        bestOf: pre ? pre.bestOf : s.settings.bestOf,
        stocks: pre && pre.stocks ? pre.stocks : s.settings.stocks,
        chars: pre && Array.isArray(pre.chars) ? Utils.clone(pre.chars) : sides.map(side => side.map(mainOf)),
        bracketRef: pre ? pre.bracketRef || null : null
      };
    }
    const form = setupForm;
    const b = form.bracketRef ? Store.bracket(form.bracketRef.bracketId) : null;
    if (form.bracketRef && !b) {
      Store.clearLive();
      live = null;
      setupForm = null;
      renderSetup();
      return;
    }
    const locked = !!b;
    const people = locked ? Store.allPlayers() : Store.activePlayers();
    if (people.length < 2) {
      root.innerHTML = UI.emptyState({ title: 'Add players first', text: 'You need at least two players for a match.', actions: '<a class="btn btn-primary" href="#/players">Add players</a>' });
      return;
    }
    const size = form.type === 'doubles' ? 2 : 1;
    const titles = size === 2 ? ['Orange team', 'Green team'] : ['Player 1', 'Player 2'];
    const slotName = (si, pi) => titles[si] + (size === 2 ? `, player ${pi + 1}` : '');
    const charBtn = (si, pi) => UI.charButton(form.chars[si][pi], { attrs: `data-char="${si}-${pi}"`, label: `${slotName(si, pi)} character` });

    const side = si => `<div class="live-side versus-side versus-${si}">
        <span class="versus-title">${titles[si]}</span>
        ${Utils.range(size).map(pi => `<div class="live-pick">
          <label class="visually-hidden" for="lp-${si}-${pi}">${slotName(si, pi)}</label>
          <select id="lp-${si}-${pi}" data-pick="${si}-${pi}"${locked ? ' disabled' : ''}>${UI.playerOptions(people, form.sides[si][pi])}</select>
          ${charBtn(si, pi)}
        </div>`).join('')}
      </div>`;

    root.innerHTML = `<div class="page">
      <section class="page-head">
        <div><h1>Live scoreboard</h1>
          <p class="muted">Keep score on the big screen while you play. The result saves to match history as soon as the set ends.</p></div>
      </section>
      ${locked ? `<div class="notice"><span><strong>${esc(b.name)}</strong> · ${esc(Bracket.roundName(b, form.bracketRef.round))}.
        The bracket sets the players and format.</span><button type="button" class="btn btn-sm btn-secondary" data-cancel-bracket>Not now</button></div>` : ''}
      <form class="card live-setup" novalidate>
        <div class="form-row">
          <div class="field"><span class="label">Match type</span>
            ${UI.seg('live-type', [{ value: 'singles', label: 'Singles 1v1' }, { value: 'doubles', label: 'Doubles 2v2' }], form.type, { disabled: locked, label: 'Match type' })}</div>
          <div class="field"><span class="label">Format</span>${UI.seg('live-bestof', UI.bestOfOptions(), form.bestOf, { disabled: locked, label: 'Format' })}</div>
          <div class="field"><span class="label">Stocks each</span>
            ${UI.seg('live-stocks', [1, 2, 3, 4, 5].map(n => ({ value: n, label: String(n) })), form.stocks, { label: 'Stocks each' })}</div>
        </div>
        <div class="versus live-versus">${side(0)}<div class="versus-vs" aria-hidden="true">VS</div>${side(1)}</div>
        <p class="form-error" role="alert" hidden></p>
        <div class="form-actions"><button type="submit" class="btn btn-primary btn-lg">Start match</button></div>
      </form>
      <p class="muted small keys-help">On the scoreboard, press <kbd>1</kbd>–<kbd>${size === 2 ? 4 : 2}</kbd> when a player loses a stock,
        <kbd>Shift</kbd> + the number to give one back, <kbd>Z</kbd> to undo and <kbd>F</kbd> for full screen.</p>
    </div>`;

    const page = root.querySelector('.page');
    const formEl = page.querySelector('form');
    const errorEl = formEl.querySelector('.form-error');

    const syncPicks = () => {
      const selects = [...formEl.querySelectorAll('[data-pick]')];
      const chosen = selects.map(sel => sel.value);
      selects.forEach((sel, i) => [...sel.options].forEach(opt => {
        opt.disabled = !!opt.value && chosen.some((v, j) => j !== i && v === opt.value);
      }));
    };
    syncPicks();

    formEl.addEventListener('change', e => {
      const t = e.target;
      if (t.name === 'live-type') {
        form.type = t.value;
        form.sides = blankSides(form.type);
        form.chars = form.sides.map(side2 => side2.map(() => ''));
        Store.prefs.set('liveType', form.type);
        renderSetup();
        root.querySelector('input[name="live-type"]:checked').focus();
      } else if (t.name === 'live-bestof') {
        form.bestOf = Number(t.value);
      } else if (t.name === 'live-stocks') {
        form.stocks = Number(t.value);
      } else if (t.matches('[data-pick]')) {
        const [si, pi] = t.dataset.pick.split('-').map(Number);
        const oldMain = mainOf(form.sides[si][pi]);
        form.sides[si][pi] = t.value;
        // Switch the character to the new player's main unless someone already picked one.
        if (!form.chars[si][pi] || form.chars[si][pi] === oldMain) {
          form.chars[si][pi] = mainOf(t.value);
          formEl.querySelector(`[data-char="${si}-${pi}"]`).outerHTML = charBtn(si, pi);
        }
        syncPicks();
      }
    });

    formEl.addEventListener('click', async e => {
      const btn = e.target.closest('[data-char]');
      if (!btn) return;
      const [si, pi] = btn.dataset.char.split('-').map(Number);
      const pid = form.sides[si][pi];
      const picked = await UI.pickCharacter({ current: form.chars[si][pi], title: `${pid ? Store.nameOf(pid) : slotName(si, pi)}'s character` });
      if (picked === null) return;
      form.chars[si][pi] = picked;
      const current = formEl.querySelector(`[data-char="${si}-${pi}"]`);
      current.outerHTML = charBtn(si, pi);
      formEl.querySelector(`[data-char="${si}-${pi}"]`).focus();
    });

    formEl.addEventListener('submit', e => {
      e.preventDefault();
      const all = form.sides.flat();
      if (all.some(id => !id)) { errorEl.textContent = size === 2 ? 'Pick all four players.' : 'Pick both players.'; errorEl.hidden = false; return; }
      if (new Set(all).size !== all.length) { errorEl.textContent = 'A player can only be on one side.'; errorEl.hidden = false; return; }
      UI.guard(() => start(form));
    });

    const cancel = page.querySelector('[data-cancel-bracket]');
    if (cancel) cancel.addEventListener('click', () => {
      Store.clearLive();
      live = null;
      setupForm = null;
      renderSetup();
    });
  }

  function start(form) {
    live = {
      phase: 'playing', type: form.type, sides: Utils.clone(form.sides), bestOf: form.bestOf, stocks: form.stocks,
      bracketRef: form.bracketRef || null, games: [], chars: Utils.clone(form.chars),
      stocksNow: form.sides.map(side => side.map(() => form.stocks)),
      undo: [], savedMatchId: null, startedAt: new Date().toISOString()
    };
    setupForm = null;
    persist();
    renderStage();
  }

  // Called from a bracket's "Play live" button.
  function startFromBracket(bracketId, r, i) {
    const b = Store.bracket(bracketId);
    const bm = b && b.rounds[r] && b.rounds[r][i];
    if (!bm || !bm.slots[0] || !bm.slots[1] || bm.winner !== null) {
      UI.toast('That bracket match is not ready to play.', { kind: 'warn' });
      return;
    }
    const go = () => {
      const sides = bm.slots.map(id => Bracket.entrant(b, id).players.slice());
      Store.setLive({
        phase: 'setup', type: b.type, sides, bestOf: Bracket.bestOfFor(b, r), stocks: Store.state.settings.stocks,
        chars: sides.map(side => side.map(mainOf)), bracketRef: { bracketId: b.id, round: r, index: i }
      });
      setupForm = null;
      location.hash = '#/live';
    };
    const existing = load();
    if (existing && (existing.phase === 'playing' || existing.phase === 'between')) {
      UI.confirm({
        title: 'Replace the live match?',
        message: `A live match is in progress (${Store.sideName(existing.sides[0])} vs ${Store.sideName(existing.sides[1])}). Starting this bracket match throws that score away.`,
        confirmLabel: 'Throw it away',
        danger: true
      }).then(ok => { if (ok) go(); });
    } else {
      go();
    }
  }

  /* ---------- The scoreboard ---------- */

  function renderStage() {
    document.body.classList.add('stage-mode');
    setKeys(true);
    const sc = score();
    const b = live.bracketRef ? Store.bracket(live.bracketRef.bracketId) : null;
    const status = live.phase === 'done' ? 'Set over'
      : live.phase === 'between' ? `Game ${live.games.length + 1} up next` : `Game ${live.games.length + 1}`;
    const where = b ? `${esc(b.name)} · ${esc(Bracket.roundName(b, live.bracketRef.round))} · ` : '';

    root.innerHTML = `<div class="stage" data-phase="${live.phase}">
      <div class="stage-top">
        <button type="button" class="stage-btn" data-exit>← Exit</button>
        <div class="stage-brand">
          <img class="stage-logo" src="${esc(Brand.logo)}" alt="">
          <p class="stage-title">${where}${status} · Best of ${live.bestOf}</p>
        </div>
        <button type="button" class="stage-btn" data-fullscreen>${document.fullscreenElement ? 'Exit full screen' : 'Full screen'}</button>
      </div>
      <div class="stage-score" aria-live="polite">
        <span class="ss-name ss-name-0">${esc(sideLabel(0))}</span>
        <span class="ss-num">${sc[0]}</span><span class="ss-dash" aria-label="to">–</span><span class="ss-num">${sc[1]}</span>
        <span class="ss-name ss-name-1">${esc(sideLabel(1))}</span>
      </div>
      ${live.phase === 'playing' ? gameStrip() : ''}
      ${live.phase === 'between' ? betweenBar() : ''}
      <div class="stage-sides">${[0, 1].map(si => `<div class="stage-side stage-side-${si}">
        ${live.sides[si].map((pid, pi) => panel(si, pi, pid)).join('')}</div>`).join('')}</div>
      <div class="stage-controls">
        <button type="button" class="stage-btn" data-undo${live.undo.length ? '' : ' disabled'}>↶ Undo</button>
        <button type="button" class="stage-btn" data-end-early${live.phase === 'playing' ? '' : ' disabled'}>End game early…</button>
        ${live.phase === 'done' ? '' : '<button type="button" class="stage-btn stage-btn-danger" data-discard>Discard match</button>'}
      </div>
      ${live.phase === 'done' ? doneOverlay() : ''}
    </div>`;
    bindStage();
    // Keyboard users land on the next thing to do.
    const nextSelector = { done: '[data-new]', between: '[data-next]' }[live.phase];
    const next = nextSelector && root.querySelector(nextSelector);
    if (next) next.focus({ preventScroll: true });
  }

  function panel(si, pi, pid) {
    const p = Store.player(pid);
    const tag = p ? p.tag : '?';
    const n = live.stocksNow[si][pi];
    const shown = Math.max(live.stocks, n);
    const playing = live.phase === 'playing';
    return `<div class="stage-player${n === 0 ? ' is-out' : ''}">
      <div class="sp-head">
        <span class="sp-tag">${esc(tag)}</span>
        ${UI.charButton(live.chars[si][pi], { attrs: `data-char="${si}-${pi}"`, size: 'lg', label: `Character for ${tag}`, disabled: live.phase === 'done' })}
      </div>
      <div class="sp-stocks" role="img" aria-label="${esc(tag)}: ${Utils.plural(n, 'stock')} left">
        ${Utils.range(shown).map(i => `<span class="stock${i < n ? ' on' : ''}">${UI.pixelOrange()}</span>`).join('')}
      </div>
      <div class="sp-actions">
        <button type="button" class="ko-btn" data-ko="${si}-${pi}"${playing && n > 0 ? '' : ' disabled'}>Lost a stock <kbd>${slotKey(si, pi)}</kbd></button>
        <button type="button" class="plus-btn" data-plus="${si}-${pi}"${playing && n < maxStocks() ? '' : ' disabled'} aria-label="Give ${esc(tag)} a stock back">+1</button>
      </div>
    </div>`;
  }

  // One chip per finished game: who won, with what, and how many stocks they had left.
  function gameStrip() {
    if (!live.games.length) return '';
    return `<ol class="game-strip" aria-label="Games so far">${live.games.map((g, i) => {
      const left = g.stocksLeft ? ` · ${Utils.plural(g.stocksLeft, 'stock')}` : '';
      return `<li class="gs gs-${g.winner}">
        <span class="gs-no">G${i + 1}</span>${g.chars[g.winner].filter(Boolean).map(c => UI.charIcon(c, 22)).join('')}
        <span class="gs-text">${esc(sideLabel(g.winner))}${left}</span>
      </li>`;
    }).join('')}</ol>`;
  }

  function betweenBar() {
    const g = live.games[live.games.length - 1];
    return `<div class="stage-between" role="status">
      <p><strong>${esc(sideLabel(g.winner))}</strong> won game ${live.games.length}${g.stocksLeft ? ` with ${Utils.plural(g.stocksLeft, 'stock')} left` : ''}.
        Switching characters? Change them below first.</p>
      <button type="button" class="btn btn-primary btn-lg" data-next>Start game ${live.games.length + 1}</button>
    </div>`;
  }

  function doneOverlay() {
    const sc = score();
    const w = sc[0] > sc[1] ? 0 : 1;
    const m = live.savedMatchId ? Store.match(live.savedMatchId) : null;
    const st = Store.stats();
    const d = m ? st.deltas.get(m.id) || {} : {};
    const b = live.bracketRef ? Store.bracket(live.bracketRef.bracketId) : null;
    const champ = b && m && m.bracket ? Bracket.champion(b) : null;
    const lastGame = live.games[live.games.length - 1];
    const winChars = [...new Set(lastGame ? lastGame.chars[w].filter(Boolean) : [])];
    return `<div class="stage-overlay">
      <div class="win-card win-card-${w}" role="dialog" aria-modal="true" aria-labelledby="win-title">
        <img class="win-logo" src="${esc(Brand.logo)}" alt="">
        <p class="win-kicker">${champ ? '🏆 Bracket champion' : 'Winner'}</p>
        ${winChars.length ? `<div class="win-chars">${winChars.map(c => UI.charIcon(c, 64)).join('')}</div>` : ''}
        <h2 class="win-name" id="win-title">${esc(sideLabel(w))}</h2>
        <p class="win-score">${sc[w]}–${sc[1 - w]}</p>
        ${m ? `<ul class="win-deltas">${live.sides.flat().map(pid => {
            const rec = st[live.type].get(pid);
            return `<li><span>${esc(Store.nameOf(pid))}</span><span><strong>${rec ? Math.round(rec.rating) : ''}</strong> ${UI.delta(d[pid])}</span></li>`;
          }).join('')}</ul>
          <p class="win-saved">✓ Saved to match history${m.bracket ? ' and the bracket' : ''}</p>`
        : '<p class="win-saved is-error">Not saved. Press Undo, then finish the game again.</p>'}
        <div class="win-actions">
          <button type="button" class="btn btn-primary btn-lg" data-new>New match</button>
          ${b && m && m.bracket ? `<a class="btn btn-secondary btn-lg" href="#/brackets/${encodeURIComponent(b.id)}" data-back-bracket>Back to the bracket</a>`
            : '<button type="button" class="btn btn-secondary btn-lg" data-rematch>Rematch</button>'}
          <button type="button" class="btn btn-ghost" data-undo>Undo last stock</button>
        </div>
      </div>
    </div>`;
  }

  /* ---------- Scoreboard actions ---------- */

  function snapshot() {
    live.undo.push(JSON.stringify({
      phase: live.phase, games: live.games, chars: live.chars, stocksNow: live.stocksNow,
      savedMatchId: live.savedMatchId, bracketRef: live.bracketRef
    }));
    if (live.undo.length > 200) live.undo.shift();
  }

  function ko(si, pi) {
    if (live.phase !== 'playing' || live.stocksNow[si][pi] <= 0) return;
    snapshot();
    live.stocksNow[si][pi]--;
    if (sideTotal(si) === 0) finishGame(1 - si, sideTotal(1 - si));
    persist();
    renderStage();
  }

  function plus(si, pi) {
    if (live.phase !== 'playing' || live.stocksNow[si][pi] >= maxStocks()) return;
    snapshot();
    live.stocksNow[si][pi]++;
    persist();
    renderStage();
  }

  function finishGame(winner, stocksLeft) {
    live.games.push({ winner, chars: Utils.clone(live.chars), stocksLeft: stocksLeft > 0 ? stocksLeft : null });
    if (score()[winner] >= needed()) {
      live.phase = 'done';
      saveResult();
    } else {
      live.phase = 'between';
    }
  }

  function nextGame() {
    if (live.phase !== 'between') return;
    snapshot();
    live.phase = 'playing';
    live.stocksNow = live.sides.map(side => side.map(() => live.stocks));
    persist();
    renderStage();
  }

  function saveResult() {
    const input = {
      type: live.type, sides: live.sides, bestOf: live.bestOf, games: live.games,
      source: 'live', playedAt: new Date().toISOString()
    };
    try {
      let m;
      if (live.bracketRef) {
        try {
          m = Store.reportBracketResult(live.bracketRef.bracketId, live.bracketRef.round, live.bracketRef.index, input);
        } catch (err) {
          m = Store.addMatch(input);
          live.bracketRef = null;
          UI.toast(`Saved to match history, but not to the bracket: ${err.message}`, { kind: 'warn', timeout: 10000 });
        }
      } else {
        m = Store.addMatch(input);
      }
      live.savedMatchId = m.id;
    } catch (err) {
      UI.toast(`Couldn't save the match: ${err.message}`, { kind: 'error', timeout: 10000 });
    }
  }

  // Removes the saved result when undoing the stock that ended the set.
  function removeSaved() {
    const m = Store.match(live.savedMatchId);
    if (!m) { live.savedMatchId = null; return true; }
    const ok = UI.attempt(() => {
      if (Store.isBracketManaged(m)) Store.undoBracketResult(m.bracket.id, m.bracket.round, m.bracket.index);
      else Store.deleteMatch(m.id);
      return true;
    });
    if (ok) live.savedMatchId = null;
    return !!ok;
  }

  function undo() {
    if (!live.undo.length) return;
    if (live.phase === 'done' && live.savedMatchId && !removeSaved()) return;
    Object.assign(live, JSON.parse(live.undo.pop()));
    persist();
    renderStage();
  }

  function endEarly() {
    if (live.phase !== 'playing') return;
    const leader = sideTotal(0) >= sideTotal(1) ? 0 : 1;
    const stockOptions = selected => Utils.range(1, maxStocks() + 1)
      .map(n => `<option value="${n}"${n === selected ? ' selected' : ''}>${n}</option>`).join('');
    UI.modal({
      title: `Who won game ${live.games.length + 1}?`,
      body: `<p class="muted">Use this when time runs out or a game ends some other way.</p>
        <div class="field"><span class="label">Winner</span>
          ${UI.seg('early-winner', [0, 1].map(si => ({ value: si, label: sideLabel(si) })), leader, { label: 'Winner' })}</div>
        <label class="field"><span class="label">Winner's stocks left</span>
          <select data-early-stocks>${stockOptions(Math.max(1, sideTotal(leader)))}</select></label>`,
      onOpen: api => {
        api.el.querySelectorAll('input[name="early-winner"]').forEach(radio => radio.addEventListener('change', () => {
          api.el.querySelector('[data-early-stocks]').innerHTML = stockOptions(Math.max(1, sideTotal(Number(radio.value))));
        }));
      },
      actions: [
        { label: 'Cancel' },
        {
          label: 'End game', kind: 'primary', onClick: api => {
            const winner = Number(api.el.querySelector('input[name="early-winner"]:checked').value);
            const left = Number(api.el.querySelector('[data-early-stocks]').value);
            snapshot();
            finishGame(winner, left);
            persist();
            renderStage();
          }
        }
      ]
    });
  }

  async function discard() {
    const ok = await UI.confirm({ title: 'Discard this match?', message: 'The score so far is thrown away and nothing is saved.', confirmLabel: 'Discard', danger: true });
    if (!ok) return;
    Store.clearLive();
    live = null;
    renderSetup();
  }

  function rematch() {
    live = {
      phase: 'playing', type: live.type, sides: live.sides, bestOf: live.bestOf, stocks: live.stocks,
      bracketRef: null, games: [], chars: live.chars,
      stocksNow: live.sides.map(side => side.map(() => live.stocks)),
      undo: [], savedMatchId: null, startedAt: new Date().toISOString()
    };
    persist();
    renderStage();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => UI.toast('Full screen isn\'t available here. Try F11.', { kind: 'warn' }));
    }
  }

  document.addEventListener('fullscreenchange', () => {
    if (live && live.phase !== 'setup' && root && root.querySelector('.stage')) renderStage();
  });

  function bindStage() {
    const stage = root.querySelector('.stage');
    stage.addEventListener('click', e => {
      const t = e.target.closest('button, a');
      if (!t || t.disabled) return;
      let focusAfter = null;
      if (t.dataset.ko) { ko(...t.dataset.ko.split('-').map(Number)); focusAfter = `[data-ko="${t.dataset.ko}"]`; }
      else if (t.dataset.plus) { plus(...t.dataset.plus.split('-').map(Number)); focusAfter = `[data-plus="${t.dataset.plus}"]`; }
      else if (t.hasAttribute('data-undo')) { undo(); focusAfter = '[data-undo]'; }
      else if (t.hasAttribute('data-next')) nextGame();
      else if (t.hasAttribute('data-end-early')) endEarly();
      else if (t.hasAttribute('data-discard')) discard();
      else if (t.hasAttribute('data-exit')) location.hash = '#/';
      else if (t.hasAttribute('data-fullscreen')) toggleFullscreen();
      else if (t.hasAttribute('data-new')) { Store.clearLive(); live = null; leave(); renderSetup(); }
      else if (t.hasAttribute('data-rematch')) rematch();
      else if (t.hasAttribute('data-back-bracket')) { Store.clearLive(); live = null; }
      else if (t.dataset.char) changeCharacter(...t.dataset.char.split('-').map(Number));
      if (focusAfter) {
        const again = root.querySelector(focusAfter);
        if (again && !again.disabled) again.focus();
      }
    });
  }

  // Opens the character picker. Focus comes back to a button (not a text field),
  // so the number-key shortcuts keep working afterwards.
  async function changeCharacter(si, pi) {
    if (!live || live.phase === 'done') return;
    const picked = await UI.pickCharacter({ current: live.chars[si][pi], title: `${Store.nameOf(live.sides[si][pi])}'s character` });
    if (picked === null || !live || live.phase === 'done') return;
    live.chars[si][pi] = picked;
    persist();
    renderStage();
    const again = root.querySelector(`[data-char="${si}-${pi}"]`);
    if (again) again.focus();
  }

  function onKey(e) {
    if (!live || live.phase === 'setup' || !document.body.classList.contains('stage-mode')) return;
    if (e.altKey || e.metaKey || document.querySelector('.modal-backdrop')) return;
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    const key = e.key.toLowerCase();
    if (e.ctrlKey && key !== 'z') return;
    const digit = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
    if (digit) {
      const slot = slots()[Number(digit[1]) - 1];
      if (slot) {
        e.preventDefault();
        if (e.shiftKey) plus(...slot); else ko(...slot);
      }
    } else if (key === 'z' || key === 'u' || e.key === 'Backspace') {
      e.preventDefault();
      undo();
    } else if (key === 'f') {
      e.preventDefault();
      toggleFullscreen();
    } else if ((e.key === 'Enter' || e.key === ' ') && live.phase === 'between' && !e.target.closest('button, a')) {
      e.preventDefault();
      nextGame();
    }
  }

  function setKeys(on) {
    if (on && !keysOn) document.addEventListener('keydown', onKey);
    if (!on && keysOn) document.removeEventListener('keydown', onKey);
    keysOn = on;
  }
})();
