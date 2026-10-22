/* Building blocks used by every page: pop-ups, toasts, the PIN check, pickers,
   the game-by-game entry form, match summaries and charts. */
const Views = {};

const UI = (() => {
  const { esc } = Utils;

  /* ---------- Toasts ---------- */

  function toast(message, { kind = 'info', action = null, timeout = 5000 } = {}) {
    const root = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast toast-' + kind;
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    const msg = document.createElement('span');
    msg.className = 'toast-msg';
    msg.textContent = message;
    el.appendChild(msg);

    let timer = null;
    const dismiss = () => {
      clearTimeout(timer);
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 180);
    };
    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-action';
      btn.textContent = action.label;
      btn.addEventListener('click', () => { dismiss(); action.onClick(); });
      el.appendChild(btn);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '×';
    close.addEventListener('click', dismiss);
    el.appendChild(close);

    root.appendChild(el);
    while (root.children.length > 4) root.firstElementChild.remove();
    timer = setTimeout(dismiss, timeout);
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 2500); });
    return dismiss;
  }

  // Runs fn and shows any error as a toast. Returns fn's result, or undefined on error.
  function attempt(fn) {
    try {
      return fn();
    } catch (err) {
      toast(err.message || String(err), { kind: 'error' });
      return undefined;
    }
  }

  /* ---------- Pop-ups ---------- */

  let modalCount = 0;
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  // actions: [{ label, kind: 'primary'|'danger'|undefined, onClick(api) }]
  // onClick can return false (or a promise of false) to keep the pop-up open.
  function modal({ title, body = '', actions = [{ label: 'Close' }], wide = false, onOpen = null, onClose = null }) {
    const id = 'modal-' + (++modalCount);
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
        <div class="modal-head">
          <h2 id="${id}-title"></h2>
          <button type="button" class="icon-btn modal-close" aria-label="Close">×</button>
        </div>
        <div class="modal-body">${body}<p class="form-error" role="alert" hidden></p></div>
        <div class="modal-actions"></div>
      </div>`;
    backdrop.querySelector('h2').textContent = title;
    const dialog = backdrop.querySelector('.modal');
    const errorEl = backdrop.querySelector('.modal-body > .form-error');
    const actionsEl = backdrop.querySelector('.modal-actions');
    const previousFocus = document.activeElement;
    let closed = false;

    const api = {
      el: dialog,
      close,
      error(message) {
        errorEl.textContent = message;
        errorEl.hidden = !message;
      }
    };

    function close() {
      if (closed) return;
      closed = true;
      backdrop.remove();
      document.removeEventListener('keydown', onKey, true);
      if (previousFocus && previousFocus.isConnected && previousFocus.focus) previousFocus.focus();
      if (onClose) onClose();
    }
    function isTop() {
      const all = document.querySelectorAll('.modal-backdrop');
      return all[all.length - 1] === backdrop;
    }
    function onKey(e) {
      if (!isTop()) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      } else if (e.key === 'Tab') {
        const items = [...dialog.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      } else if (e.key === 'Enter' && e.target.matches('input:not([type="checkbox"]):not([type="radio"])')) {
        const primary = actionsEl.querySelector('.btn-primary, .btn-danger-solid');
        if (primary) { e.preventDefault(); primary.click(); }
      }
    }

    actions.forEach(action => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ' + (action.kind === 'primary' ? 'btn-primary' : action.kind === 'danger' ? 'btn-danger-solid' : 'btn-secondary');
      btn.textContent = action.label;
      btn.addEventListener('click', async () => {
        api.error('');
        try {
          const keep = action.onClick ? await action.onClick(api) : undefined;
          if (keep !== false) close();
        } catch (err) {
          api.error(err.message || String(err));
        }
      });
      actionsEl.appendChild(btn);
    });

    backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) close(); });
    backdrop.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('modal-root').appendChild(backdrop);
    document.addEventListener('keydown', onKey, true);
    if (onOpen) onOpen(api);
    const first = dialog.querySelector('[autofocus]') ||
      dialog.querySelector('.modal-body input:not([type="hidden"]):not([disabled]), .modal-body select, .modal-body textarea') ||
      actionsEl.querySelector('.btn-primary, .btn-danger-solid') || dialog.querySelector('.modal-close');
    if (first) first.focus();
    return api;
  }

  function confirm({ title, message = '', html = '', confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false }) {
    return new Promise(resolve => {
      let answer = false;
      modal({
        title,
        body: html || `<p>${esc(message)}</p>`,
        actions: [
          { label: cancelLabel },
          { label: confirmLabel, kind: danger ? 'danger' : 'primary', onClick: () => { answer = true; } }
        ],
        onClose: () => resolve(answer)
      });
    });
  }

  /* ---------- Teacher PIN ---------- */

  function pinPrompt() {
    return new Promise(resolve => {
      let unlocked = false;
      modal({
        title: 'Teacher PIN',
        body: `<p class="muted">Enter the PIN to make changes on this computer.</p>
          <label class="field"><span>PIN</span>
            <input type="password" inputmode="numeric" autocomplete="off" maxlength="8" data-pin>
          </label>`,
        actions: [
          { label: 'Cancel' },
          {
            label: 'Unlock', kind: 'primary', onClick: api => {
              const input = api.el.querySelector('[data-pin]');
              if (Store.unlock(input.value)) { unlocked = true; return true; }
              api.error('That PIN is not right.');
              input.select();
              return false;
            }
          }
        ],
        onClose: () => resolve(unlocked)
      });
    });
  }

  // Runs fn only when changes are allowed: asks for the PIN first if the site is locked.
  function guard(fn) {
    if (Store.mode !== 'main') {
      toast('This is a view-only copy of the scores.', { kind: 'warn' });
      return;
    }
    if (!Store.isLocked()) { fn(); return; }
    pinPrompt().then(ok => { if (ok) fn(); });
  }

  /* ---------- Small pieces of markup ---------- */

  // Dark tones of the brand oranges and greens; white initials stay readable on all of them.
  const AVATAR_COLORS = ['#b5470f', '#006c3c', '#7a5600', '#0b6e4f', '#8a3a12', '#3d5327', '#a23e12', '#2f4f1f'];

  // A player's avatar is their main's stock icon, or their initials if they haven't picked a main.
  function avatar(p, size = '') {
    const icon = p && p.main ? Characters.icon(p.main) : '';
    if (icon) {
      return `<span class="avatar avatar-char ${size}" aria-hidden="true"><img src="${icon}" alt="" loading="lazy" decoding="async"></span>`;
    }
    const label = Store.displayName(p);
    const color = AVATAR_COLORS[Utils.hue(p ? p.id : '?') % AVATAR_COLORS.length];
    return `<span class="avatar ${size}" style="--av:${color}" aria-hidden="true">${esc(Utils.initials(label))}</span>`;
  }

  // A fighter's stock icon. Decorative: the fighter's name is always written next to it or in a label.
  // Long lists load icons lazily; the picker loads them all at once so nothing pops in while scrolling.
  function charIcon(name, size = 20, { lazy = true } = {}) {
    const src = Characters.icon(name);
    return src ? `<img class="char-icon" src="${src}" alt="" width="${size}" height="${size}"${lazy ? ' loading="lazy"' : ''} decoding="async">` : '';
  }

  // A pixel-art orange like the ones in the logo; the live scoreboard uses it for stocks.
  let pixelOrangeSvg = '';
  function pixelOrange() {
    if (pixelOrangeSvg) return pixelOrangeSvg;
    const cells = [];
    for (let y = 0; y < 14; y++) {
      for (let x = 0; x < 14; x++) {
        const dx = x + 0.5 - 7;
        const dy = y + 0.5 - 8.2;
        if (dx * dx + dy * dy > 30) continue;   // outside the round body
        let fill = '#f37334';
        if ((x + 0.5 - 5) ** 2 + (y + 0.5 - 6.3) ** 2 < 1.3) fill = '#ffc48a';   // shine
        else if (dx + dy > 3.6) fill = '#c9521a';                                 // shadow
        cells.push([x, y, fill]);
      }
    }
    // Stem and two leaves.
    [[7, 1, '#006c3c'], [7, 2, '#006c3c'], [4, 0, '#12b16c'], [5, 0, '#12b16c'], [5, 1, '#12b16c'], [6, 1, '#12b16c'],
      [6, 2, '#12b16c'], [8, 1, '#12b16c'], [9, 1, '#12b16c'], [9, 0, '#12b16c'], [10, 0, '#12b16c'], [8, 2, '#12b16c']]
      .forEach(cell => cells.push(cell));
    pixelOrangeSvg = '<svg viewBox="0 0 14 14" shape-rendering="crispEdges" aria-hidden="true">' +
      cells.map(([x, y, fill]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`).join('') + '</svg>';
    return pixelOrangeSvg;
  }

  function playerLink(p, { showName = true, size = '' } = {}) {
    if (!p) return '<span class="muted">Unknown player</span>';
    const sub = showName && p.name && p.name !== p.tag ? `<span class="pl-name">${esc(p.name)}</span>` : '';
    return `<a class="player-link" href="#/player/${encodeURIComponent(p.id)}">${avatar(p, size)}` +
      `<span class="pl-text"><span class="pl-tag">${esc(p.tag)}</span>${sub}</span></a>`;
  }

  function nameLink(id) {
    const p = Store.player(id);
    if (!p) return '<span class="muted">Unknown</span>';
    return `<a class="name-link" href="#/player/${encodeURIComponent(id)}">${esc(p.tag)}</a>`;
  }

  function charPill(name) {
    return name ? `<span class="char-pill">${charIcon(name, 18)}${esc(name)}</span>` : '';
  }

  // The button that opens the character picker. `attrs` carries the data-* attributes callers listen for.
  function charButton(name, { attrs = '', label = 'Character', size = 'md', disabled = false } = {}) {
    const has = !!Characters.icon(name);
    return `<button type="button" class="char-btn char-btn-${size}${has ? '' : ' is-empty'}" ${attrs}` +
      ` aria-label="${esc(label)}: ${esc(has ? name : 'none picked')}. Choose a character"${disabled ? ' disabled' : ''}>` +
      (has ? charIcon(name, size === 'lg' ? 52 : 28) : '<span class="char-icon char-icon-empty" aria-hidden="true">?</span>') +
      `<span class="char-btn-name">${esc(has ? name : 'Pick character')}</span>` +
      '<svg class="char-btn-caret" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>';
  }

  // A character select screen in a pop-up: search box plus a grid of every fighter.
  // Resolves to the chosen name, '' for "No character", or null if cancelled.
  function pickCharacter({ current = '', title = 'Choose a character' } = {}) {
    return new Promise(resolve => {
      let chosen = null;
      modal({
        title,
        wide: true,
        body: `
          <div class="cp-top">
            <label class="cp-search"><span class="visually-hidden">Search fighters</span>
              <input type="search" placeholder="Type to search, e.g. Kirby" autocomplete="off" spellcheck="false" data-cp-search></label>
          </div>
          <div class="cp-grid" role="group" aria-label="Fighters">${Characters.sorted.map(name => `
            <button type="button" class="cp-item${name === current ? ' is-current' : ''}" data-cp="${esc(name)}"
              aria-pressed="${name === current}" tabindex="-1">${charIcon(name, 48, { lazy: false })}<span>${esc(name)}</span></button>`).join('')}
          </div>
          <p class="cp-none muted" hidden>No fighter matches that search.</p>`,
        actions: [
          { label: 'No character', onClick: () => { chosen = ''; } },
          { label: 'Cancel' }
        ],
        onOpen: api => {
          const search = api.el.querySelector('[data-cp-search]');
          const grid = api.el.querySelector('.cp-grid');
          const items = [...grid.querySelectorAll('.cp-item')];
          const visible = () => items.filter(b => !b.hidden);
          const setTabStop = target => items.forEach(b => { b.tabIndex = b === target ? 0 : -1; });
          setTabStop(items.find(b => b.dataset.cp === current) || items[0]);

          search.addEventListener('input', () => {
            const q = Characters.searchKey(search.value.trim());
            items.forEach(b => { b.hidden = !!q && !Characters.searchKey(b.dataset.cp).includes(q); });
            const first = visible()[0];
            api.el.querySelector('.cp-none').hidden = !!first;
            if (first) setTabStop(first);
          });
          search.addEventListener('keydown', e => {
            const first = visible()[0];
            if (e.key === 'Enter' && first) { e.preventDefault(); first.click(); }
            else if (e.key === 'ArrowDown' && first) { e.preventDefault(); setTabStop(first); first.focus(); }
          });

          grid.addEventListener('click', e => {
            const item = e.target.closest('.cp-item');
            if (!item) return;
            chosen = item.dataset.cp;
            api.close();
          });
          // Arrow keys move around the grid; typing a letter jumps back to the search box.
          grid.addEventListener('keydown', e => {
            const list = visible();
            const i = list.indexOf(document.activeElement);
            if (i < 0) return;
            const columns = Math.max(1, list.filter(b => b.offsetTop === list[0].offsetTop).length);
            const moves = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + columns, ArrowUp: i - columns, Home: 0, End: list.length - 1 };
            if (e.key in moves) {
              e.preventDefault();
              if (e.key === 'ArrowUp' && i - columns < 0) { search.focus(); return; }
              const next = list[Math.max(0, Math.min(list.length - 1, moves[e.key]))];
              setTabStop(next);
              next.focus();
            } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') {
              search.focus();
            }
          });

          const currentItem = items.find(b => b.dataset.cp === current);
          if (currentItem) currentItem.scrollIntoView({ block: 'center' });
        },
        onClose: () => resolve(chosen)
      });
    });
  }

  function resultDots(results, count = 5) {
    const recent = results.slice(-count);
    if (!recent.length) return '<span class="muted">—</span>';
    const words = recent.map(r => (r === 'W' ? 'win' : 'loss')).join(', ');
    return `<span class="dots" role="img" aria-label="Last ${recent.length}: ${words}">` +
      recent.map(r => `<span class="dot ${r === 'W' ? 'dot-w' : 'dot-l'}" aria-hidden="true">${r}</span>`).join('') + '</span>';
  }

  function delta(d) {
    if (d == null) return '';
    const r = Math.round(d);
    return `<span class="delta ${r > 0 ? 'up' : r < 0 ? 'down' : ''}">${Utils.signed(d)}</span>`;
  }

  function streak(n) {
    if (n > 0) return `<span class="streak up">W${n}</span>`;
    if (n < 0) return `<span class="streak down">L${-n}</span>`;
    return '<span class="muted">—</span>';
  }

  function rating(rec) {
    const prov = rec.sets < Store.state.settings.provisionalSets;
    return `<span class="rating">${Math.round(rec.rating)}</span>` +
      (prov ? `<span class="prov" title="Provisional: fewer than ${Store.state.settings.provisionalSets} sets played">*</span>` : '');
  }

  function seg(name, options, value, { disabled = false, label = '' } = {}) {
    return `<div class="seg" role="radiogroup"${label ? ` aria-label="${esc(label)}"` : ''}>` +
      options.map(o => `<label class="seg-opt"><input type="radio" name="${esc(name)}" value="${esc(o.value)}"` +
        `${String(o.value) === String(value) ? ' checked' : ''}${disabled ? ' disabled' : ''}><span>${esc(o.label)}</span></label>`).join('') +
      '</div>';
  }

  function emptyState({ title, text = '', actions = '' }) {
    return `<div class="card empty"><h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}` +
      (actions ? `<div class="row row-center">${actions}</div>` : '') + '</div>';
  }

  function playerOptions(players, selected, placeholder = 'Choose a player…') {
    return `<option value="">${esc(placeholder)}</option>` + players.map(p =>
      `<option value="${esc(p.id)}"${p.id === selected ? ' selected' : ''}>${esc(p.tag)}` +
      `${p.name && p.name !== p.tag ? ' (' + esc(p.name) + ')' : ''}</option>`).join('');
  }

  function bestOfOptions() {
    return [1, 3, 5].map(n => ({ value: n, label: 'Best of ' + n }));
  }

  /* ---------- Match summaries ---------- */

  function charsUsed(m, si) {
    return [...new Set((m.games || []).flatMap(g => g.chars[si]).filter(Boolean))];
  }

  // Both sides of a match with names, rating changes, characters and the score.
  function matchSides(m, { chars = true } = {}) {
    const d = Store.stats().deltas.get(m.id) || {};
    const side = si => {
      const won = m.winner === si;
      const names = m.sides[si].map(pid =>
        `<span class="ms-player">${nameLink(pid)}${d[pid] != null ? delta(d[pid]) : ''}</span>`).join('');
      const used = chars ? charsUsed(m, si) : [];
      return `<div class="ms-side ms-side-${si} ${won ? 'is-winner' : 'is-loser'}">
          <div class="ms-names">${names}${won ? '<span class="win-tag">Win</span>' : ''}</div>
          ${used.length ? `<div class="ms-chars">${used.map(charPill).join('')}</div>` : ''}
        </div>`;
    };
    return `<div class="ms">${side(0)}<div class="ms-score" aria-label="Score ${m.score[0]} to ${m.score[1]}">` +
      `<span>${m.score[0]}</span><span class="ms-dash">–</span><span>${m.score[1]}</span></div>${side(1)}</div>`;
  }

  function gamesList(m) {
    if (!m.games.length) return '<p class="muted small">No game details were recorded.</p>';
    return `<ol class="games-list">${m.games.map((g, i) => {
      const who = Store.sideName(m.sides[g.winner]);
      const picks = [0, 1].map(si => {
        const chars = g.chars[si].filter(Boolean);
        return chars.length ? chars.map(c => `<span class="gl-char">${charIcon(c, 20)}${esc(c)}</span>`).join('') : '<span class="muted">?</span>';
      }).join('<span class="gl-vs">vs</span>');
      const stocks = g.stocksLeft ? `<span class="gl-stocks">${Utils.plural(g.stocksLeft, 'stock')} left</span>` : '';
      return `<li><span class="gl-no">Game ${i + 1}</span><span class="gl-win"><strong>${esc(who)}</strong> won</span>` +
        `<span class="gl-picks">${picks}</span>${stocks}</li>`;
    }).join('')}</ol>`;
  }

  /* ---------- Set entry: the game-by-game form (Record page and bracket results) ---------- */

  // opts: { type, sides, bestOf, stocks, games, onChange }
  function setEntry(root, opts) {
    const st = {
      type: opts.type,
      sides: opts.sides.map(s => s.slice()),
      bestOf: opts.bestOf,
      stocks: opts.stocks || 3,
      games: (opts.games || []).map(g => ({ winner: g.winner, chars: g.chars.map(c => c.slice()), stocksLeft: g.stocksLeft ?? null }))
    };
    const onChange = opts.onChange || (() => {});
    const size = () => (st.type === 'doubles' ? 2 : 1);
    const needed = () => Math.ceil(st.bestOf / 2);
    const mainOf = pid => { const p = pid && Store.player(pid); return (p && p.main) || ''; };
    const freshChars = prev => [0, 1].map(si => Utils.range(size()).map(pi => (prev ? prev[si][pi] : mainOf(st.sides[si][pi])) || ''));
    const isDecided = g => g.winner === 0 || g.winner === 1;

    // Keeps the list tidy: nothing after the deciding game, and one empty row for the next game.
    function tidy() {
      const out = [];
      const score = [0, 0];
      for (const g of st.games) {
        if (score[0] >= needed() || score[1] >= needed()) break;
        out.push(g);
        if (!isDecided(g)) break;
        score[g.winner]++;
      }
      const done = score[0] >= needed() || score[1] >= needed();
      const last = out[out.length - 1];
      if (!done && (!last || isDecided(last))) {
        out.push({ winner: null, chars: freshChars(last ? last.chars : null), stocksLeft: null });
      }
      st.games = out;
    }

    function current() {
      const played = st.games.filter(isDecided);
      const score = [0, 1].map(si => played.filter(g => g.winner === si).length);
      const winner = score[0] >= needed() ? 0 : score[1] >= needed() ? 1 : null;
      return { games: played, score, winner };
    }

    function ready() {
      const all = st.sides.flat();
      return st.sides.every(side => side.length === size() && side.every(Boolean)) && new Set(all).size === all.length;
    }

    function labels() {
      return st.sides.map((side, si) => side.every(Boolean)
        ? side.map(Store.nameOf).join(' & ')
        : (size() === 2 ? ['Orange team', 'Green team'][si] : ['Player 1', 'Player 2'][si]));
    }

    function quickScores() {
      const n = needed();
      const list = [];
      for (let l = 0; l < n; l++) list.push([n, l]);
      for (let l = n - 1; l >= 0; l--) list.push([l, n]);
      return list;
    }

    // Fills the games from a final score. The exact game order isn't known, so the loser's
    // wins are spread through the set and the winner takes the last game.
    function applyQuick(a, b) {
      const winner = a > b ? 0 : 1;
      const w = Math.max(a, b);
      const l = Math.min(a, b);
      const order = [];
      for (let i = 0; i < l; i++) order.push(winner, 1 - winner);
      while (order.length < w + l) order.push(winner);
      const old = st.games;
      const games = [];
      order.forEach((win, i) => {
        const keep = old[i];
        const prev = games[i - 1];
        games.push({ winner: win, chars: keep ? keep.chars : freshChars(prev ? prev.chars : null), stocksLeft: keep ? keep.stocksLeft : null });
      });
      st.games = games;
    }

    function playerLabel(si, pi) {
      const pid = st.sides[si][pi];
      return pid ? Store.nameOf(pid) : `${labels()[si]}, player ${pi + 1}`;
    }

    function gameRow(g, gi, names, maxStocks) {
      const side = si => `
        <div class="se-side se-side-${si}">
          <button type="button" class="se-win ${g.winner === si ? 'is-on' : ''}" data-win="${si}" aria-pressed="${g.winner === si}">
            <span class="se-check" aria-hidden="true">${g.winner === si ? '✓' : ''}</span>
            <span class="se-win-name">${esc(names[si])}</span>
          </button>
          <div class="se-chars">${g.chars[si].map((c, pi) =>
            charButton(c, { attrs: `data-char="${si}-${pi}"`, label: `Game ${gi + 1}, ${playerLabel(si, pi)}` })).join('')}</div>
        </div>`;
      const stockChips = [''].concat(Utils.range(1, maxStocks + 1)).map(v => {
        const on = String(g.stocksLeft ?? '') === String(v);
        return `<button type="button" class="stock-chip${on ? ' is-on' : ''}" data-stocks="${v}" aria-pressed="${on}"` +
          ` aria-label="${v === '' ? 'Not recorded' : Utils.plural(v, 'stock') + ' left'}">${v === '' ? '–' : v}</button>`;
      }).join('');
      return `<li class="se-game" data-game="${gi}">
          <div class="se-game-no">Game ${gi + 1}</div>
          ${side(0)}
          <div class="se-vs" aria-hidden="true">vs</div>
          ${side(1)}
          <div class="se-stocks" role="group" aria-label="Game ${gi + 1}: winner's stocks left">
            <span class="label" aria-hidden="true">Winner's stocks left</span>
            <div class="stock-chips">${stockChips}</div>
          </div>
        </li>`;
    }

    function render() {
      tidy();
      const res = current();
      const names = labels();
      const ok = ready();
      const quick = quickScores().map(([a, b]) => {
        const on = res.winner !== null && res.score[0] === a && res.score[1] === b;
        return `<button type="button" class="chip${on ? ' is-on' : ''}" data-quick="${a}-${b}" aria-pressed="${on}">${a}–${b}</button>`;
      }).join('');
      let status;
      if (!ok) status = size() === 2 ? 'Pick all four players first.' : 'Pick both players first.';
      else if (res.winner !== null) status = `<strong>${esc(names[res.winner])}</strong> ${size() === 2 ? 'win' : 'wins'} the set ${res.score[res.winner]}–${res.score[1 - res.winner]}.`;
      else status = `Best of ${st.bestOf}: first to ${Utils.plural(needed(), 'game')}. Click who won each game, or use a quick score.`;

      root.innerHTML = `
        <fieldset class="se"${ok ? '' : ' disabled'}>
          <legend class="visually-hidden">Games</legend>
          <div class="se-top">
            <div class="se-quick"><span class="label">Quick score</span>${quick}</div>
            <div class="se-score" aria-live="polite">
              <span class="se-name se-name-0">${esc(names[0])}</span>
              <strong>${res.score[0]}–${res.score[1]}</strong>
              <span class="se-name se-name-1">${esc(names[1])}</span>
            </div>
          </div>
          <ol class="se-games">${st.games.map((g, gi) => gameRow(g, gi, names, st.stocks * size())).join('')}</ol>
          <p class="se-status">${status}</p>
        </fieldset>`;
    }

    // Redraws, tells the page, and puts keyboard focus back on the control that was used.
    function changed(focusSelector) {
      render();
      onChange();
      const again = focusSelector && root.querySelector(focusSelector);
      if (again) again.focus();
    }

    root.addEventListener('click', async e => {
      const quick = e.target.closest('[data-quick]');
      if (quick) {
        const [a, b] = quick.dataset.quick.split('-').map(Number);
        applyQuick(a, b);
        changed(`[data-quick="${a}-${b}"]`);
        return;
      }
      const row = e.target.closest('[data-game]');
      if (!row) return;
      const gi = Number(row.dataset.game);
      const g = st.games[gi];

      const win = e.target.closest('[data-win]');
      if (win) {
        const si = Number(win.dataset.win);
        g.winner = g.winner === si ? null : si;
        changed(`[data-game="${gi}"] [data-win="${si}"]`);
        return;
      }
      const stockChip = e.target.closest('[data-stocks]');
      if (stockChip) {
        g.stocksLeft = stockChip.dataset.stocks ? Number(stockChip.dataset.stocks) : null;
        changed(`[data-game="${gi}"] [data-stocks="${stockChip.dataset.stocks}"]`);
        return;
      }
      const charBtn = e.target.closest('[data-char]');
      if (charBtn) {
        const [si, pi] = charBtn.dataset.char.split('-').map(Number);
        const old = g.chars[si][pi];
        const picked = await pickCharacter({ current: old, title: `Game ${gi + 1}: ${playerLabel(si, pi)}'s character` });
        if (picked === null || picked === old) return;
        g.chars[si][pi] = picked;
        // Later games that had the old pick follow along (players usually keep their character).
        for (let j = gi + 1; j < st.games.length; j++) {
          if (st.games[j].chars[si][pi] === old) st.games[j].chars[si][pi] = picked;
        }
        changed(`[data-game="${gi}"] [data-char="${si}-${pi}"]`);
      }
    });

    render();

    return {
      setSides(sides) {
        const before = st.sides;
        st.sides = sides.map(s => s.slice());
        // A newly picked player starts on their own main in every game.
        st.games.forEach(g => [0, 1].forEach(si => Utils.range(size()).forEach(pi => {
          if (!before[si] || before[si][pi] !== st.sides[si][pi]) g.chars[si][pi] = mainOf(st.sides[si][pi]);
        })));
        render();
      },
      setBestOf(n) { st.bestOf = n; render(); },
      reset() { st.games = []; render(); },
      // The finished result, or null if the set isn't complete yet.
      result() {
        const res = current();
        if (!ready() || res.winner === null) return null;
        return { games: Utils.clone(res.games), score: res.score, winner: res.winner };
      }
    };
  }

  /* ---------- Charts ---------- */

  function niceStep(raw) {
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / pow;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
  }

  // Rating over time: one line with a crosshair and tooltip (mouse, touch or arrow keys),
  // and labels only on the latest value and the peak.
  // points: [{ rating, date, title, detail }]. points[0] is the starting rating.
  function mountRatingChart(container, { points, start }) {
    container.classList.add('chart');
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    const n = points.length;
    const fmt = v => Math.round(v).toLocaleString();
    let active = -1;

    function draw() {
      const width = Math.max(260, Math.round(container.clientWidth));
      const height = width < 480 ? 220 : 260;
      const M = { top: 28, right: 60, bottom: 30, left: 48 };
      const iw = width - M.left - M.right;
      const ih = height - M.top - M.bottom;
      const values = points.map(p => p.rating).concat(start);
      let lo = Math.min(...values);
      let hi = Math.max(...values);
      const step = niceStep(Math.max(hi - lo, 30) / 4);
      lo = Math.floor(lo / step) * step;
      hi = Math.ceil(hi / step) * step;
      if (hi === lo) hi = lo + step;
      const x = i => M.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
      const y = v => M.top + ih - ((v - lo) / (hi - lo)) * ih;
      const ticks = [];
      for (let v = lo; v <= hi + 1e-6; v += step) ticks.push(v);

      const last = points[n - 1];
      let peak = 0;
      points.forEach((p, i) => { if (p.rating > points[peak].rating) peak = i; });
      const peakLabelY = y(points[peak].rating) - 10;
      const crowdsEnd = Math.abs(peakLabelY - y(last.rating)) < 16 && x(peak) + 44 > x(n - 1) + 6;
      const showPeak = peak !== 0 && peak !== n - 1 && points[peak].rating - last.rating >= 5;
      const xTicks = n === 2 ? [0, 1] : [0, Math.round((n - 1) / 2), n - 1];
      const anchor = i => (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle');
      const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.rating).toFixed(1)}`).join(' ');
      const summary = `Rating over time. Started at ${fmt(start)}, now ${fmt(last.rating)} after ${Utils.plural(n - 1, 'set')}.` +
        (peak ? ` Peak ${fmt(points[peak].rating)}.` : '') + ' Use the arrow keys to step through sets.';

      container.innerHTML = `
        <svg class="chart-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" tabindex="0" role="img" aria-label="${esc(summary)}">
          <g class="chart-grid">${ticks.map(v => `<line x1="${M.left}" x2="${width - M.right}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}</g>
          <line class="chart-ref" x1="${M.left}" x2="${width - M.right}" y1="${y(start)}" y2="${y(start)}"/>
          <g class="chart-axis">
            ${ticks.map(v => `<text x="${M.left - 8}" y="${y(v)}" text-anchor="end" dominant-baseline="middle">${fmt(v)}</text>`).join('')}
            ${xTicks.map(i => `<text x="${x(i)}" y="${height - 8}" text-anchor="${anchor(i)}">${esc(i === 0 ? 'Start' : Utils.fmtShortDate(points[i].date))}</text>`).join('')}
          </g>
          <path class="chart-line" d="${path}"/>
          ${showPeak ? `<circle class="chart-dot" cx="${x(peak)}" cy="${y(points[peak].rating)}" r="4"/>` : ''}
          ${showPeak && !crowdsEnd ? `<text class="chart-label" x="${x(peak)}" y="${peakLabelY}" text-anchor="middle">Peak ${fmt(points[peak].rating)}</text>` : ''}
          <circle class="chart-dot" cx="${x(n - 1)}" cy="${y(last.rating)}" r="5"/>
          <text class="chart-label chart-end" x="${x(n - 1) + 10}" y="${y(last.rating)}" dominant-baseline="middle">${fmt(last.rating)}</text>
          <g class="chart-hover" visibility="hidden">
            <line class="chart-cross" y1="${M.top}" y2="${M.top + ih}"/>
            <circle class="chart-dot" r="5"/>
          </g>
          <rect class="chart-hit" x="${M.left - 12}" y="0" width="${iw + 24}" height="${height}"/>
        </svg>`;
      container.appendChild(tip);

      const svg = container.querySelector('svg');
      const hover = svg.querySelector('.chart-hover');
      const cross = hover.querySelector('.chart-cross');
      const dot = hover.querySelector('.chart-dot');

      function show(i) {
        active = Math.max(0, Math.min(n - 1, i));
        const p = points[active];
        const px = x(active);
        const py = y(p.rating);
        cross.setAttribute('x1', px);
        cross.setAttribute('x2', px);
        dot.setAttribute('cx', px);
        dot.setAttribute('cy', py);
        hover.setAttribute('visibility', 'visible');
        const value = document.createElement('strong');
        value.textContent = fmt(p.rating);
        const title = document.createElement('span');
        title.textContent = p.title;
        tip.replaceChildren(value, title);
        if (p.detail) {
          const detail = document.createElement('span');
          detail.textContent = p.detail;
          tip.appendChild(detail);
        }
        tip.hidden = false;
        let left = px + 14;
        if (left + tip.offsetWidth > width) left = px - 14 - tip.offsetWidth;
        let top = py - tip.offsetHeight - 10;
        if (top < 0) top = py + 14;
        tip.style.left = Math.max(0, left) + 'px';
        tip.style.top = top + 'px';
      }
      function hide() {
        active = -1;
        hover.setAttribute('visibility', 'hidden');
        tip.hidden = true;
      }

      svg.addEventListener('pointermove', e => {
        const r = svg.getBoundingClientRect();
        const px = (e.clientX - r.left) * (width / r.width);
        show(Math.round(((px - M.left) / iw) * (n - 1)));
      });
      svg.addEventListener('pointerleave', () => { if (document.activeElement !== svg) hide(); });
      svg.addEventListener('focus', () => show(active >= 0 ? active : n - 1));
      svg.addEventListener('blur', hide);
      svg.addEventListener('keydown', e => {
        const moves = { ArrowLeft: active - 1, ArrowRight: active + 1, Home: 0, End: n - 1 };
        if (e.key in moves) { e.preventDefault(); show(moves[e.key]); }
        else if (e.key === 'Escape') svg.blur();
      });
    }

    draw();
    if ('ResizeObserver' in window) {
      let lastWidth = container.clientWidth;
      const observer = new ResizeObserver(() => {
        if (!container.isConnected) { observer.disconnect(); return; }
        const w = container.clientWidth;
        if (Math.abs(w - lastWidth) >= 2) { lastWidth = w; draw(); }
      });
      observer.observe(container);
    }
  }

  // Horizontal bars, one color, value printed at the end of each bar.
  // rows: [{ label, labelHtml?, value, valueHtml, title }]
  function barList(rows) {
    const max = Math.max(1, ...rows.map(r => r.value));
    return `<ul class="bars">${rows.map(r => `
      <li class="bar-row" title="${esc(r.title || '')}">
        <span class="bar-label">${r.labelHtml || esc(r.label)}</span>
        <span class="bar-track"><span class="bar-fill" style="--f:${(r.value / max).toFixed(4)}"></span><span class="bar-value">${r.valueHtml}</span></span>
      </li>`).join('')}</ul>`;
  }

  return {
    toast, attempt, modal, confirm, pinPrompt, guard,
    avatar, pixelOrange, playerLink, nameLink, charIcon, charPill, charButton, pickCharacter,
    resultDots, delta, streak, rating, seg, emptyState,
    playerOptions, bestOfOptions, charsUsed, matchSides, gamesList,
    setEntry, mountRatingChart, barList
  };
})();
