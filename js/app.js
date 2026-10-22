/* Starts the site: picks the page from the address (#/players, #/live, ...), draws the
   header and banners, and re-draws the page whenever the scores change. */
const App = (() => {
  const { esc } = Utils;

  const NAV = [
    { view: 'leaderboard', href: '#/', label: 'Leaderboard' },
    { view: 'record', href: '#/record', label: 'Record', mainOnly: true },
    { view: 'live', href: '#/live', label: 'Live', mainOnly: true },
    { view: 'brackets', href: '#/brackets', label: 'Brackets' },
    { view: 'matches', href: '#/matches', label: 'Matches' },
    { view: 'players', href: '#/players', label: 'Players' },
    { view: 'settings', href: '#/settings', label: 'Settings' }
  ];
  const ROUTES = {
    '': 'leaderboard', leaderboard: 'leaderboard', record: 'record', live: 'live', brackets: 'brackets',
    matches: 'matches', players: 'players', player: 'profile', settings: 'settings'
  };
  const ICONS = {
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.6A8.5 8.5 0 0 1 9.4 4a8.5 8.5 0 1 0 10.6 10.6z" fill="currentColor"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10.5" rx="2" fill="currentColor"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    unlock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10.5" rx="2" fill="currentColor"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  let current = null;
  let booted = false;
  let warningDismissed = false;

  function parseRoute() {
    const path = location.hash.replace(/^#\/?/, '').split('?')[0];
    const parts = path.split('/').filter(Boolean).map(part => {
      try { return decodeURIComponent(part); } catch (e) { return part; }
    });
    return { view: ROUTES[parts[0] || ''] || 'leaderboard', params: parts.slice(1) };
  }

  function renderView() {
    const next = parseRoute();
    if (Store.mode !== 'main' && (next.view === 'record' || next.view === 'live')) {
      location.replace('#/');
      return;
    }
    if (current && current.view !== next.view && Views[current.view].leave) Views[current.view].leave();
    current = next;
    Views[next.view].render(document.getElementById('view'), next.params);
    renderNav();
  }

  function effectiveTheme() {
    const chosen = document.documentElement.getAttribute('data-theme');
    if (chosen) return chosen;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function toggleTheme() {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    Store.prefs.set('theme', next);
    renderHeader();
  }

  function renderHeader() {
    const meta = Store.state.meta;
    document.getElementById('site-title').textContent = meta.title;
    document.getElementById('site-season').innerHTML = `<strong>${esc(Brand.org)}</strong>` +
      (meta.season ? ` · ${esc(meta.season)} season` : '');
    document.title = `${meta.title} · ${Brand.shortName}`;

    const lockBtn = document.getElementById('lock-btn');
    if (Store.hasPin()) {
      const locked = Store.isLocked();
      lockBtn.hidden = false;
      lockBtn.innerHTML = (locked ? ICONS.lock : ICONS.unlock) + `<span class="header-btn-text">${locked ? 'Locked' : 'Unlocked'}</span>`;
      lockBtn.setAttribute('aria-label', locked ? 'Locked: enter the teacher PIN to make changes' : 'Unlocked: click to lock changes');
      lockBtn.classList.toggle('is-unlocked', !locked);
    } else {
      lockBtn.hidden = true;
    }

    const themeBtn = document.getElementById('theme-btn');
    const dark = effectiveTheme() === 'dark';
    themeBtn.innerHTML = dark ? ICONS.sun : ICONS.moon;
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    themeBtn.title = dark ? 'Light theme' : 'Dark theme';
  }

  function renderNav() {
    const live = Store.mode === 'main' ? Store.getLive() : null;
    const liveNow = !!(live && (live.phase === 'playing' || live.phase === 'between'));
    const activeView = current.view === 'profile' ? 'players' : current.view;
    const nav = document.getElementById('nav');
    nav.innerHTML = NAV
      .filter(item => !(item.mainOnly && Store.mode !== 'main'))
      .map(item => {
        const label = item.view === 'settings' && Store.mode !== 'main' ? 'About' : item.label;
        const dot = item.view === 'live' && liveNow
          ? '<span class="live-dot" aria-hidden="true"></span><span class="visually-hidden"> (match in progress)</span>' : '';
        return `<a href="${item.href}"${item.view === activeView ? ' aria-current="page"' : ''}>${label}${dot}</a>`;
      }).join('');
    // On narrow screens the tabs scroll sideways; keep the current one in view.
    const active = nav.querySelector('[aria-current="page"]');
    if (active && nav.scrollWidth > nav.clientWidth) {
      nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
    }
  }

  function renderBanners() {
    const items = [];
    if (Store.mode === 'viewer') {
      const at = Store.published && Store.published.publishedAt;
      items.push(`<div class="banner banner-info" role="status"><span><strong>View-only.</strong> Scores as of ${esc(at ? Utils.fmtDateTime(at) : 'the last update')}.</span></div>`);
    }
    if (Store.startupWarning && !warningDismissed) {
      items.push(`<div class="banner banner-warn" role="alert"><span>${esc(Store.startupWarning)}</span>` +
        '<button type="button" class="btn btn-sm btn-secondary" data-banner="dismiss">OK</button></div>');
    }
    if (Store.mode === 'main' && Store.saveFailed) {
      items.push('<div class="banner banner-warn" role="alert"><span><strong>Changes aren\'t being saved.</strong> ' +
        'This browser is blocking storage or is full. Download a backup from Settings so scores aren\'t lost.</span>' +
        '<a class="btn btn-sm btn-secondary" href="#/settings">Settings</a></div>');
    }
    const due = Store.backupDue();
    if (due && Date.now() > Number(Store.prefs.get('backupSnoozeUntil', 0))) {
      items.push(`<div class="banner banner-warn"><span><strong>Time for a backup.</strong> ${Utils.plural(due.since, 'match', 'matches')} since the last one. ` +
        'Browser data can get wiped, so keep a copy.</span><span class="row">' +
        '<button type="button" class="btn btn-sm btn-primary" data-banner="backup">Download backup</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" data-banner="snooze">Later</button></span></div>');
    }
    document.getElementById('banners').innerHTML = items.join('');
  }

  function onBannerClick(e) {
    const btn = e.target.closest('[data-banner]');
    if (!btn) return;
    const action = btn.dataset.banner;
    if (action === 'dismiss') { warningDismissed = true; renderBanners(); }
    else if (action === 'backup') Views.settings.downloadBackup();
    else if (action === 'snooze') { Store.prefs.set('backupSnoozeUntil', Date.now() + 86400000); renderBanners(); }
  }

  function onStoreChange() {
    renderHeader();
    renderBanners();
    const view = Views[current.view];
    if (!view.manual) view.render(document.getElementById('view'), current.params);
    renderNav();
  }

  function boot() {
    if (booted) return;
    booted = true;
    Store.init();

    document.getElementById('theme-btn').addEventListener('click', toggleTheme);
    document.getElementById('lock-btn').addEventListener('click', () => {
      if (Store.isLocked()) UI.pinPrompt();
      else { Store.lock(); UI.toast('Locked. The teacher PIN is needed to make changes.'); }
    });
    document.getElementById('banners').addEventListener('click', onBannerClick);
    window.addEventListener('hashchange', () => {
      renderView();
      window.scrollTo(0, 0);
      document.getElementById('view').focus({ preventScroll: true });
    });
    // Another tab on this computer changed the scores.
    window.addEventListener('storage', e => {
      if (e.key === 'ssbRankings.v1' && Store.mode === 'main') {
        UI.toast('Scores were changed in another tab.', { kind: 'warn', timeout: 15000, action: { label: 'Reload', onClick: () => location.reload() } });
      }
    });
    if (window.matchMedia) {
      const media = window.matchMedia('(prefers-color-scheme: light)');
      if (media.addEventListener) media.addEventListener('change', renderHeader);
    }
    Store.subscribe(onStoreChange);

    renderHeader();
    renderBanners();
    renderView();

    // Load the fighter icons in the background so the character picker opens instantly.
    // View-only copies never open the picker, so they skip this.
    if (Store.mode === 'main') {
      const warm = () => Characters.roster.forEach(name => {
        const img = new Image();
        img.decoding = 'async';
        img.src = Characters.icon(name);
      });
      if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 3000 });
      else setTimeout(warm, 1500);
    }
  }

  // Start once published-data.js has loaded (or failed to load).
  if (window.__publishedLoaded) boot();
  else {
    document.addEventListener('published-loaded', boot, { once: true });
    setTimeout(boot, 4000);
  }

  return { effectiveTheme };
})();
