/* Elo ratings and every number worked out from match results.
   Ratings are never saved. They are rebuilt by replaying every match in the order it was
   played, so editing or deleting a match always fixes everyone's rating.
   No page code in here, so it can be tested on its own. */
const Stats = (() => {
  const MODES = ['singles', 'doubles'];

  // Chance (0–1) that a player rated `self` beats a player rated `opponent`.
  function expected(self, opponent) {
    return 1 / (1 + Math.pow(10, (opponent - self) / 400));
  }

  function byPlayedAt(a, b) {
    if (a.playedAt !== b.playedAt) return a.playedAt < b.playedAt ? -1 : 1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  function sortMatches(matches) {
    return matches.slice().sort(byPlayedAt);
  }

  function newRecord(start) {
    return {
      rating: start, peak: start, sets: 0, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0,
      streak: 0,          // +3 = won the last 3 sets, -2 = lost the last 2
      results: [],        // 'W' / 'L' for every set, oldest first
      history: [],        // rating after each set
      lastDelta: null, lastPlayed: null,
      stockGames: 0, stocksInWins: 0
    };
  }

  function getOrAdd(map, key, make) {
    let value = map.get(key);
    if (!value) { value = make(); map.set(key, value); }
    return value;
  }

  function compute(state) {
    const settings = state.settings || {};
    const start = Number(settings.startRating) || 1000;
    const k = Number(settings.kFactor) || 32;

    const out = {
      start, k,
      singles: new Map(),                               // playerId -> record
      doubles: new Map(),
      deltas: new Map(),                                // matchId -> { playerId: rating change }
      h2h: { singles: new Map(), doubles: new Map() },  // playerId -> Map(opponentId -> record)
      chars: { singles: new Map(), doubles: new Map() },// playerId -> Map(character -> { games, wins })
      partners: new Map()                               // playerId -> Map(partnerId -> record)
    };

    for (const m of sortMatches(state.matches || [])) {
      const mode = m.type === 'doubles' ? 'doubles' : 'singles';
      const recs = m.sides.map(side => side.map(pid => getOrAdd(out[mode], pid, () => newRecord(start))));
      // A doubles team plays at the average rating of its two players.
      const teamRating = recs.map(side => side.reduce((sum, r) => sum + r.rating, 0) / side.length);
      const change = k * ((m.winner === 0 ? 1 : 0) - expected(teamRating[0], teamRating[1]));
      const changes = [change, -change];
      const deltas = {};

      m.sides.forEach((side, si) => {
        const won = m.winner === si;
        side.forEach((pid, pi) => {
          const r = recs[si][pi];
          r.rating += changes[si];
          r.peak = Math.max(r.peak, r.rating);
          r.sets++;
          if (won) r.wins++; else r.losses++;
          r.gamesWon += m.score[si];
          r.gamesLost += m.score[1 - si];
          r.streak = won ? (r.streak > 0 ? r.streak + 1 : 1) : (r.streak < 0 ? r.streak - 1 : -1);
          r.results.push(won ? 'W' : 'L');
          r.history.push({ matchId: m.id, playedAt: m.playedAt, rating: r.rating, delta: changes[si], won });
          r.lastDelta = changes[si];
          r.lastPlayed = m.playedAt;
          deltas[pid] = changes[si];

          for (const opp of m.sides[1 - si]) {
            const h = getOrAdd(getOrAdd(out.h2h[mode], pid, () => new Map()), opp,
              () => ({ sets: 0, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, last: null }));
            h.sets++;
            if (won) h.wins++; else h.losses++;
            h.gamesWon += m.score[si];
            h.gamesLost += m.score[1 - si];
            h.last = m.playedAt;
          }

          if (mode === 'doubles') {
            for (const mate of side) {
              if (mate === pid) continue;
              const p = getOrAdd(getOrAdd(out.partners, pid, () => new Map()), mate,
                () => ({ sets: 0, wins: 0, losses: 0, last: null }));
              p.sets++;
              if (won) p.wins++; else p.losses++;
              p.last = m.playedAt;
            }
          }
        });
      });

      // Characters and stocks, game by game.
      for (const g of m.games || []) {
        m.sides.forEach((side, si) => {
          side.forEach((pid, pi) => {
            const ch = g.chars && g.chars[si] && g.chars[si][pi];
            if (ch) {
              const c = getOrAdd(getOrAdd(out.chars[mode], pid, () => new Map()), ch, () => ({ games: 0, wins: 0 }));
              c.games++;
              if (g.winner === si) c.wins++;
            }
            if (mode === 'singles' && g.winner === si && g.stocksLeft != null) {
              recs[si][pi].stockGames++;
              recs[si][pi].stocksInWins += g.stocksLeft;
            }
          });
        });
      }

      out.deltas.set(m.id, deltas);
    }
    return out;
  }

  function winRate(rec) {
    return rec && rec.sets ? rec.wins / rec.sets : 0;
  }

  // Players who have played this mode, best first. Ties go to win %, then game difference.
  function rankings(stats, mode, players, { period = '' } = {}) {
    const ranked = [];
    const unranked = [];
    for (const p of players) {
      if (period && (p.period || '') !== period) continue;
      const rec = stats[mode].get(p.id);
      if (rec && rec.sets > 0) ranked.push({ player: p, rec });
      else unranked.push(p);
    }
    ranked.sort((a, b) =>
      b.rec.rating - a.rec.rating ||
      winRate(b.rec) - winRate(a.rec) ||
      (b.rec.gamesWon - b.rec.gamesLost) - (a.rec.gamesWon - a.rec.gamesLost) ||
      String(a.player.tag).localeCompare(String(b.player.tag)));
    ranked.forEach((row, i) => { row.rank = i + 1; });
    return { ranked, unranked };
  }

  // Rating used for bracket seeding: this mode's rating if they have played it,
  // otherwise their other rating, otherwise the starting rating.
  function seedRating(stats, mode, pid) {
    const own = stats[mode].get(pid);
    if (own && own.sets) return own.rating;
    const other = stats[mode === 'singles' ? 'doubles' : 'singles'].get(pid);
    if (other && other.sets) return other.rating;
    return stats.start;
  }

  return { MODES, expected, sortMatches, compute, winRate, rankings, seedRating };
})();
