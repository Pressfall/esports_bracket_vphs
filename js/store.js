/* Everything the site remembers goes through Store, so every change gets saved.

   Two modes:
   - "main":   this browser keeps score. Data is saved in this browser (localStorage).
   - "viewer": this browser has no saved scores, but the site has a published-data.js file,
               so it shows a read-only copy of the published scores. */
const Store = (() => {
  const KEY = 'ssbRankings.v1';
  const LIVE_KEY = 'ssbRankings.live';
  const PREFS_KEY = 'ssbRankings.prefs';
  const UNLOCK_KEY = 'ssbRankings.unlocked';
  const VERSION = 1;

  let state = null;
  let mode = 'main';
  let published = null;       // { publishedAt, hideNames } when viewing a published copy
  let rev = 0;                // goes up on every change; used to know when caches are stale
  let saveFailed = false;
  let startupWarning = '';
  let unlockedToken = null;   // fallback when sessionStorage is blocked
  let persistAsked = false;
  let statsCache = { rev: -1, value: null };
  let mapCache = { rev: -1, value: null };
  const listeners = new Set();

  /* ---------- Data shape and cleanup ---------- */

  function defaultState() {
    return {
      version: VERSION,
      meta: {
        title: 'Smash Rankings', season: Utils.seasonName(), createdAt: new Date().toISOString(),
        isSample: false, lastBackupAt: null, lastPublishedAt: null
      },
      settings: { startRating: 1000, kFactor: 32, provisionalSets: 3, bestOf: 3, stocks: 3, pinHash: null },
      players: [],
      matches: [],
      brackets: []
    };
  }

  const text = (v, max = 60) => String(v ?? '').trim().slice(0, max);
  const int = (v, lo, hi, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
  };
  const oneOf = (v, list, fallback) => list.includes(Number(v)) ? Number(v) : fallback;
  const isoOrNull = v => (typeof v === 'string' && !Number.isNaN(Date.parse(v))) ? new Date(v).toISOString() : null;
  const validChar = c => Characters.roster.includes(c) ? c : '';

  // Cleans data loaded from storage or from a file, so a damaged file can't break the site.
  function normalize(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    const meta = raw.meta || {};
    const s = raw.settings || {};
    const out = {
      version: VERSION,
      meta: {
        title: text(meta.title) || base.meta.title,
        season: text(meta.season),
        createdAt: isoOrNull(meta.createdAt) || base.meta.createdAt,
        isSample: !!meta.isSample,
        lastBackupAt: isoOrNull(meta.lastBackupAt),
        lastPublishedAt: isoOrNull(meta.lastPublishedAt)
      },
      settings: {
        startRating: int(s.startRating, 100, 3000, 1000),
        kFactor: int(s.kFactor, 1, 100, 32),
        provisionalSets: int(s.provisionalSets, 0, 20, 3),
        bestOf: oneOf(s.bestOf, [1, 3, 5], 3),
        stocks: int(s.stocks, 1, 5, 3),
        pinHash: typeof s.pinHash === 'string' && s.pinHash ? s.pinHash : null
      },
      players: [],
      matches: [],
      brackets: []
    };

    const ids = new Set();
    for (const p of Array.isArray(raw.players) ? raw.players : []) {
      if (!p || typeof p.id !== 'string' || ids.has(p.id)) continue;
      ids.add(p.id);
      const name = text(p.name);
      const tag = text(p.tag, 30);
      out.players.push({
        id: p.id, name: name || tag || 'Player', tag: tag || name.slice(0, 30) || 'Player',
        main: validChar(p.main), period: text(p.period, 30), archived: !!p.archived,
        createdAt: isoOrNull(p.createdAt) || out.meta.createdAt
      });
    }
    for (const m of Array.isArray(raw.matches) ? raw.matches : []) {
      const clean = cleanMatch(m, ids);
      if (clean) out.matches.push(clean);
    }
    const matchIds = new Set(out.matches.map(m => m.id));
    for (const b of Array.isArray(raw.brackets) ? raw.brackets : []) {
      const clean = cleanBracket(b, ids, matchIds);
      if (clean) out.brackets.push(clean);
    }
    return out;
  }

  function cleanMatch(m, playerIds) {
    if (!m || typeof m.id !== 'string' || !Array.isArray(m.sides) || m.sides.length !== 2) return null;
    const type = m.type === 'doubles' ? 'doubles' : 'singles';
    const size = type === 'doubles' ? 2 : 1;
    const sides = m.sides.map(side => (Array.isArray(side) ? side : []).slice(0, size));
    const all = sides.flat();
    if (sides.some(side => side.length !== size) || all.some(id => !playerIds.has(id)) || new Set(all).size !== all.length) return null;
    const games = (Array.isArray(m.games) ? m.games : [])
      .filter(g => g && (g.winner === 0 || g.winner === 1))
      .map(g => ({
        winner: g.winner,
        chars: [0, 1].map(si => Utils.range(size).map(pi => validChar(g.chars && g.chars[si] && g.chars[si][pi]))),
        stocksLeft: Number.isInteger(g.stocksLeft) && g.stocksLeft > 0 ? g.stocksLeft : null
      }));
    let score = Array.isArray(m.score) && m.score.length === 2 ? m.score.map(n => int(n, 0, 9, 0)) : null;
    if (games.length) score = [0, 1].map(si => games.filter(g => g.winner === si).length);
    if (!score) return null;
    const winner = m.winner === 0 || m.winner === 1 ? m.winner : (score[0] > score[1] ? 0 : 1);
    if (score[winner] <= score[1 - winner]) return null;
    const created = isoOrNull(m.createdAt) || isoOrNull(m.playedAt) || new Date().toISOString();
    return {
      id: m.id, type,
      playedAt: isoOrNull(m.playedAt) || created, createdAt: created,
      sides, bestOf: oneOf(m.bestOf, [1, 3, 5], 3), games, score, winner,
      source: ['manual', 'live', 'bracket'].includes(m.source) ? m.source : 'manual',
      bracket: m.bracket && typeof m.bracket.id === 'string'
        ? { id: m.bracket.id, name: text(m.bracket.name), round: int(m.bracket.round, 0, 20, 0), index: int(m.bracket.index, 0, 4096, 0) }
        : null
    };
  }

  function cleanBracket(b, playerIds, matchIds) {
    if (!b || typeof b.id !== 'string' || !Array.isArray(b.entrants) || !Array.isArray(b.rounds) || !b.rounds.length) return null;
    const entrants = b.entrants
      .filter(e => e && typeof e.id === 'string' && Array.isArray(e.players) && e.players.length && e.players.every(id => playerIds.has(id)))
      .map(e => ({ id: e.id, players: e.players.slice(0, 2), seed: int(e.seed, 1, 999, 1) }));
    if (entrants.length !== b.entrants.length || entrants.length < 2) return null;
    const entrantIds = new Set(entrants.map(e => e.id));
    const first = Array.isArray(b.rounds[0]) ? b.rounds[0].length : 0;
    const shapeOk = first >= 1 && b.rounds.every((round, r) => Array.isArray(round) && round.length === first / Math.pow(2, r))
      && b.rounds[b.rounds.length - 1].length === 1;
    if (!shapeOk) return null;
    return {
      id: b.id, name: text(b.name) || 'Bracket', type: b.type === 'doubles' ? 'doubles' : 'singles',
      bestOf: oneOf(b.bestOf, [1, 3, 5], 3), finalsBestOf: oneOf(b.finalsBestOf, [1, 3, 5], 3),
      seeding: b.seeding === 'random' ? 'random' : 'rating',
      createdAt: isoOrNull(b.createdAt) || new Date().toISOString(),
      entrants,
      rounds: b.rounds.map(round => round.map(m => ({
        slots: [0, 1].map(k => m && m.slots && entrantIds.has(m.slots[k]) ? m.slots[k] : null),
        winner: m && (m.winner === 0 || m.winner === 1) ? m.winner : null,
        matchId: m && matchIds.has(m.matchId) ? m.matchId : null,
        score: m && Array.isArray(m.score) ? m.score.slice(0, 2).map(n => int(n, 0, 9, 0)) : null,
        bye: !!(m && m.bye)
      })))
    };
  }

  /* ---------- Loading, saving, change events ---------- */

  function init() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); }
    catch (e) { saveFailed = true; }

    if (raw) {
      try {
        state = normalize(JSON.parse(raw));
        mode = 'main';
        return;
      } catch (e) {
        try {
          localStorage.setItem(KEY + '.unreadable-' + Date.now(), raw);
          localStorage.removeItem(KEY);
        } catch (_) { /* nothing else we can do */ }
        startupWarning = 'The saved scores in this browser could not be read, so the site started fresh. ' +
          'If you have a backup file, restore it from Settings.';
      }
    }

    const pub = window.PUBLISHED_DATA;
    if (pub && typeof pub === 'object' && pub.data) {
      state = normalize(pub.data);
      state.settings.pinHash = null;
      mode = 'viewer';
      published = { publishedAt: isoOrNull(pub.publishedAt), hideNames: !!pub.hideNames };
      return;
    }

    state = defaultState();
    mode = 'main';
  }

  function save() {
    if (mode !== 'main') return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      saveFailed = false;
    } catch (e) {
      saveFailed = true;
    }
    // Ask the browser not to clear this site's storage when space runs low.
    if (!persistAsked && navigator.storage && navigator.storage.persist) {
      persistAsked = true;
      navigator.storage.persist().catch(() => {});
    }
  }

  function emit() {
    listeners.forEach(fn => {
      try { fn(); } catch (e) { console.error(e); }
    });
  }

  function commit() {
    rev++;
    save();
    emit();
  }

  // All changes go through here. Mutators should check their input before changing anything.
  function update(mutator) {
    if (mode !== 'main') throw new Error('This is a view-only copy of the scores.');
    const result = mutator(state);
    commit();
    return result;
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function stats() {
    if (statsCache.rev !== rev) statsCache = { rev, value: Stats.compute(state) };
    return statsCache.value;
  }

  /* ---------- Players ---------- */

  function playerMap() {
    if (mapCache.rev !== rev) mapCache = { rev, value: new Map(state.players.map(p => [p.id, p])) };
    return mapCache.value;
  }
  function player(id) { return playerMap().get(id) || null; }
  function displayName(p) { return p ? (p.tag || p.name) : 'Unknown player'; }
  function nameOf(id) { return displayName(player(id)); }
  function sideName(side) { return side.map(nameOf).join(' & '); }
  const byTag = (a, b) => a.tag.localeCompare(b.tag, undefined, { sensitivity: 'base' });
  function activePlayers() { return state.players.filter(p => !p.archived).sort(byTag); }
  function allPlayers() { return state.players.slice().sort(byTag); }
  function periods() {
    return [...new Set(state.players.map(p => p.period).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  function cleanPlayerFields(fields, exceptId) {
    const name = text(fields.name);
    const tag = text(fields.tag, 30) || name.slice(0, 30);
    if (!name && !tag) throw new Error('Enter a name or a gamertag.');
    const clash = state.players.find(p => p.id !== exceptId && p.tag.toLowerCase() === tag.toLowerCase());
    if (clash) throw new Error(`The gamertag "${tag}" is already taken.`);
    return { name: name || tag, tag, main: validChar(fields.main), period: text(fields.period, 30) };
  }

  function addPlayer(fields) {
    const p = { id: Utils.uid('p'), ...cleanPlayerFields(fields), archived: false, createdAt: new Date().toISOString() };
    update(s => { s.players.push(p); });
    return p;
  }

  // Bulk add. Gamertags that are already taken are skipped.
  function addPlayers(rows) {
    const added = [];
    const skipped = [];
    const taken = new Set(state.players.map(p => p.tag.toLowerCase()));
    for (const row of rows) {
      const name = text(row.name);
      const tag = text(row.tag, 30) || name.slice(0, 30);
      if (!name && !tag) continue;
      if (taken.has(tag.toLowerCase())) { skipped.push(tag); continue; }
      taken.add(tag.toLowerCase());
      added.push({
        id: Utils.uid('p'), name: name || tag, tag, main: validChar(row.main), period: text(row.period, 30),
        archived: false, createdAt: new Date().toISOString()
      });
    }
    if (added.length) update(s => { s.players.push(...added); });
    return { added, skipped };
  }

  function updatePlayer(id, fields) {
    const p = player(id);
    if (!p) throw new Error('That player no longer exists.');
    const clean = cleanPlayerFields(fields, id);
    update(() => { Object.assign(p, clean); });
  }

  function setArchived(id, archived) {
    const p = player(id);
    if (p) update(() => { p.archived = !!archived; });
  }

  function playerUsage(id) {
    const live = getLive();
    return {
      matches: state.matches.filter(m => m.sides.some(side => side.includes(id))).length,
      brackets: state.brackets.filter(b => b.entrants.some(e => e.players.includes(id))).length,
      live: !!(live && live.sides && live.sides.some(side => side.includes(id)))
    };
  }

  function deletePlayer(id) {
    const use = playerUsage(id);
    if (use.matches || use.brackets) throw new Error('This player has matches, so archive them instead.');
    if (use.live) clearLive();
    update(s => { s.players = s.players.filter(p => p.id !== id); });
  }

  /* ---------- Matches ---------- */

  function match(id) { return state.matches.find(m => m.id === id) || null; }
  function isBracketManaged(m) { return !!(m && m.bracket && bracket(m.bracket.id)); }

  // Checks a result and turns it into a match record. Throws a readable message if something is wrong.
  function buildMatch(input, base = {}) {
    const type = input.type === 'doubles' ? 'doubles' : 'singles';
    const size = type === 'doubles' ? 2 : 1;
    const sides = (input.sides || []).map(side => (side || []).slice());
    const all = sides.flat();
    if (sides.length !== 2 || sides.some(side => side.length !== size || side.some(id => !id))) {
      throw new Error(type === 'doubles' ? 'Pick two players for each team.' : 'Pick both players.');
    }
    if (all.some(id => !player(id))) throw new Error('One of the players no longer exists.');
    if (new Set(all).size !== all.length) throw new Error('A player can only be on one side.');

    const bestOf = [1, 3, 5].includes(Number(input.bestOf)) ? Number(input.bestOf) : 3;
    const needed = Math.ceil(bestOf / 2);
    const games = (input.games || []).map(g => ({
      winner: g.winner,
      chars: [0, 1].map(si => Utils.range(size).map(pi => validChar(g.chars && g.chars[si] && g.chars[si][pi]))),
      stocksLeft: Number.isInteger(g.stocksLeft) && g.stocksLeft > 0 ? g.stocksLeft : null
    }));
    if (games.some(g => g.winner !== 0 && g.winner !== 1)) throw new Error('Every game needs a winner.');
    const score = [0, 1].map(si => games.filter(g => g.winner === si).length);
    const winner = score[0] === needed ? 0 : score[1] === needed ? 1 : null;
    if (winner === null || score[1 - winner] >= needed || games[games.length - 1].winner !== winner) {
      throw new Error(`Finish the set first: someone has to win ${Utils.plural(needed, 'game')}.`);
    }

    const now = new Date().toISOString();
    return {
      id: base.id || Utils.uid('m'),
      type,
      playedAt: input.playedAt || base.playedAt || now,
      createdAt: base.createdAt || now,
      sides, bestOf, games, score, winner,
      source: base.source || input.source || 'manual',
      bracket: base.bracket || input.bracket || null
    };
  }

  function addMatch(input) {
    const m = buildMatch(input);
    update(s => { s.matches.push(m); });
    return m;
  }

  function updateMatch(id, input) {
    const old = match(id);
    if (!old) throw new Error('That match no longer exists.');
    if (isBracketManaged(old)) throw new Error('Bracket matches are changed from the bracket page.');
    const m = buildMatch(input, old);
    update(s => { s.matches[s.matches.findIndex(x => x.id === id)] = m; });
    return m;
  }

  function deleteMatch(id) {
    const m = match(id);
    if (!m) return null;
    if (isBracketManaged(m)) throw new Error('This match is part of a bracket. Undo it from the bracket page.');
    update(s => { s.matches = s.matches.filter(x => x.id !== id); });
    return m;
  }

  // Puts back a match that was just deleted (the Undo button on a toast).
  function restoreMatch(m) {
    if (match(m.id)) return;
    const clean = cleanMatch(m, new Set(state.players.map(p => p.id)));
    if (clean) update(s => { s.matches.push(clean); });
  }

  /* ---------- Brackets ---------- */

  function bracket(id) { return state.brackets.find(b => b.id === id) || null; }

  // teams: [[playerId], ...] for singles, [[playerId, playerId], ...] for doubles
  function createBracket({ name, type, bestOf, finalsBestOf, seeding, teams }) {
    const mode = type === 'doubles' ? 'doubles' : 'singles';
    const size = mode === 'doubles' ? 2 : 1;
    if (!Array.isArray(teams) || teams.length < 2) throw new Error('Pick at least 2 entrants.');
    const all = teams.flat();
    if (teams.some(t => t.length !== size || t.some(id => !player(id)))) throw new Error('Every team needs two players.');
    if (new Set(all).size !== all.length) throw new Error('Each player can only be on one team.');
    const st = stats();
    const ratingOf = e => e.players.reduce((sum, pid) => sum + Stats.seedRating(st, mode, pid), 0) / e.players.length;
    const entrants = Bracket.seed(teams.map(players => ({ id: Utils.uid('e'), players: players.slice() })), seeding, ratingOf);
    const b = Bracket.create({
      id: Utils.uid('b'), name: text(name) || 'Bracket', type: mode,
      bestOf: oneOf(bestOf, [1, 3, 5], 3), finalsBestOf: oneOf(finalsBestOf, [1, 3, 5], 3),
      seeding: seeding === 'random' ? 'random' : 'rating', createdAt: new Date().toISOString(), entrants
    });
    update(s => { s.brackets.push(b); });
    return b;
  }

  function reportBracketResult(bracketId, r, i, input) {
    const b = bracket(bracketId);
    if (!b) throw new Error('That bracket no longer exists.');
    const bm = b.rounds[r] && b.rounds[r][i];
    if (!bm || !bm.slots[0] || !bm.slots[1]) throw new Error('This bracket match is not ready yet.');
    if (bm.winner !== null) throw new Error('This bracket match already has a result.');
    const sides = bm.slots.map(id => Bracket.entrant(b, id).players.slice());
    const m = buildMatch({
      ...input, type: b.type, sides, bestOf: input.bestOf || Bracket.bestOfFor(b, r),
      source: input.source || 'bracket', bracket: { id: b.id, name: b.name, round: r, index: i }
    });
    update(s => {
      s.matches.push(m);
      Bracket.applyResult(b, r, i, { winner: m.winner, matchId: m.id, score: m.score.slice() });
    });
    return m;
  }

  function undoBracketResult(bracketId, r, i) {
    const b = bracket(bracketId);
    if (!b) throw new Error('That bracket no longer exists.');
    if (!Bracket.canUndo(b, r, i)) throw new Error('A later match in this bracket has already been played. Undo that one first.');
    update(s => {
      const removed = Bracket.undo(b, r, i);
      s.matches = s.matches.filter(m => m.id !== removed);
    });
  }

  // Its matches stay in the history and keep counting toward ratings.
  function deleteBracket(id) {
    update(s => { s.brackets = s.brackets.filter(b => b.id !== id); });
  }

  /* ---------- Settings ---------- */

  function setMeta({ title, season }) {
    update(s => {
      s.meta.title = text(title) || 'Smash Rankings';
      s.meta.season = text(season);
    });
  }

  function setSettings(patch) {
    const cur = state.settings;
    const next = {
      startRating: int(patch.startRating ?? cur.startRating, 100, 3000, cur.startRating),
      kFactor: int(patch.kFactor ?? cur.kFactor, 1, 100, cur.kFactor),
      provisionalSets: int(patch.provisionalSets ?? cur.provisionalSets, 0, 20, cur.provisionalSets),
      bestOf: oneOf(patch.bestOf ?? cur.bestOf, [1, 3, 5], cur.bestOf),
      stocks: int(patch.stocks ?? cur.stocks, 1, 5, cur.stocks)
    };
    update(s => { Object.assign(s.settings, next); });
  }

  /* ---------- Teacher PIN ---------- */

  function sessionGet(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } }
  function sessionSet(key, value) { try { sessionStorage.setItem(key, value); } catch (e) { /* blocked */ } }
  function sessionRemove(key) { try { sessionStorage.removeItem(key); } catch (e) { /* blocked */ } }

  function hasPin() { return mode === 'main' && !!state.settings.pinHash; }
  function isLocked() {
    if (!hasPin()) return false;
    const token = sessionGet(UNLOCK_KEY) || unlockedToken;
    return token !== state.settings.pinHash;
  }
  function unlock(pin) {
    if (!hasPin()) return true;
    if (Utils.hashPin(String(pin)) !== state.settings.pinHash) return false;
    unlockedToken = state.settings.pinHash;
    sessionSet(UNLOCK_KEY, unlockedToken);
    emit();
    return true;
  }
  function lock() {
    unlockedToken = null;
    sessionRemove(UNLOCK_KEY);
    emit();
  }
  function setPin(pin) {
    if (!/^\d{4,8}$/.test(String(pin))) throw new Error('The PIN must be 4 to 8 digits.');
    const hash = Utils.hashPin(String(pin));
    unlockedToken = hash;
    sessionSet(UNLOCK_KEY, hash);
    update(s => { s.settings.pinHash = hash; });
  }
  function removePin() {
    update(s => { s.settings.pinHash = null; });
    unlockedToken = null;
    sessionRemove(UNLOCK_KEY);
  }

  /* ---------- Backups and publishing ---------- */

  function backupText() {
    return JSON.stringify({ format: 'ssb-rankings-backup', version: VERSION, exportedAt: new Date().toISOString(), data: state }, null, 2);
  }

  function markBackedUp() {
    update(s => { s.meta.lastBackupAt = new Date().toISOString(); });
  }

  // Accepts a backup (.json) or a published-data.js file.
  function parseBackup(fileText) {
    let parsed = null;
    try {
      parsed = JSON.parse(fileText);
    } catch (e) {
      const js = /window\.PUBLISHED_DATA\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(fileText);
      if (js) { try { parsed = JSON.parse(js[1]); } catch (_) { parsed = null; } }
    }
    let data = null;
    if (parsed && (parsed.format === 'ssb-rankings-backup' || parsed.format === 'ssb-rankings-published')) data = parsed.data;
    else if (parsed && Array.isArray(parsed.players)) data = parsed;
    if (!data || !Array.isArray(data.players)) throw new Error("That file isn't a backup from this site.");
    return normalize(data);
  }

  function restore(fileText) {
    const next = parseBackup(fileText);
    state = next;
    mode = 'main';
    published = null;
    commit();
    return { players: next.players.length, matches: next.matches.length };
  }

  // The file visitors' browsers load. It never includes the PIN.
  function publishText({ hideNames = true } = {}) {
    const data = Utils.clone(state);
    data.settings.pinHash = null;
    data.meta.lastBackupAt = null;
    if (hideNames) data.players.forEach(p => { p.name = p.tag; });
    const at = new Date().toISOString();
    const payload = { format: 'ssb-rankings-published', version: VERSION, publishedAt: at, hideNames: !!hideNames, data };
    return '/* Smash Rankings: published scores, made ' + at + '.\n' +
      '   Upload this file next to index.html (replacing the old one) to update what visitors see. */\n' +
      'window.PUBLISHED_DATA = ' + JSON.stringify(payload) + ';\n';
  }

  function markPublished() {
    update(s => { s.meta.lastPublishedAt = new Date().toISOString(); });
  }

  // Turns a view-only copy into this browser's own scorekeeping data.
  function becomeMain() {
    if (mode !== 'viewer') return;
    mode = 'main';
    published = null;
    commit();
  }

  function matchesSince(iso) {
    return iso ? state.matches.filter(m => m.createdAt > iso).length : state.matches.length;
  }

  // Reminder after 10 new matches, or a week, without a backup.
  function backupDue() {
    if (mode !== 'main' || state.meta.isSample || !state.matches.length) return null;
    const since = matchesSince(state.meta.lastBackupAt);
    if (!since) return null;
    const ref = state.meta.lastBackupAt || state.meta.createdAt;
    const days = (Date.now() - Date.parse(ref)) / 86400000;
    return since >= 10 || days >= 7 ? { since, days } : null;
  }

  /* ---------- Seasons and resets ---------- */

  function newSeason(name) {
    update(s => {
      s.matches = [];
      s.brackets = [];
      s.meta.season = text(name);
      s.meta.isSample = false;
      s.meta.lastPublishedAt = null;
    });
    clearLive();
  }

  function eraseAll() {
    state = defaultState();
    clearLive();
    try { localStorage.removeItem(KEY); } catch (e) { /* blocked */ }
    unlockedToken = null;
    sessionRemove(UNLOCK_KEY);
    rev++;
    emit();
  }

  function loadSample() {
    const sample = normalize(SampleData.create());
    sample.settings.pinHash = state.settings.pinHash;
    state = sample;
    commit();
  }

  /* ---------- Live match (kept separately so a refresh doesn't lose it) ---------- */

  function getLive() {
    try { return JSON.parse(localStorage.getItem(LIVE_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function setLive(value) {
    try { localStorage.setItem(LIVE_KEY, JSON.stringify(value)); } catch (e) { /* blocked */ }
  }
  function clearLive() {
    try { localStorage.removeItem(LIVE_KEY); } catch (e) { /* blocked */ }
  }

  /* ---------- Display preferences (this browser only) ---------- */

  const prefs = {
    get(key, fallback) {
      try {
        const all = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
        return key in all ? all[key] : fallback;
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try {
        const all = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
        all[key] = value;
        localStorage.setItem(PREFS_KEY, JSON.stringify(all));
      } catch (e) { /* blocked */ }
    }
  };

  return {
    init, subscribe, stats, prefs,
    get state() { return state; },
    get mode() { return mode; },
    get published() { return published; },
    get saveFailed() { return saveFailed; },
    get startupWarning() { return startupWarning; },
    player, displayName, nameOf, sideName, activePlayers, allPlayers, periods,
    addPlayer, addPlayers, updatePlayer, setArchived, playerUsage, deletePlayer,
    match, isBracketManaged, addMatch, updateMatch, deleteMatch, restoreMatch,
    bracket, createBracket, reportBracketResult, undoBracketResult, deleteBracket,
    setMeta, setSettings,
    hasPin, isLocked, unlock, lock, setPin, removePin,
    backupText, markBackedUp, restore, publishText, markPublished, becomeMain, matchesSince, backupDue,
    newSeason, eraseAll, loadSample,
    getLive, setLive, clearLive
  };
})();
