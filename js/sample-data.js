/* Made-up class data for trying the site out ("Try with sample data").
   Seeded randomness, so it comes out the same every time. */
const SampleData = (() => {
  // name, gamertag, main, class period, hidden skill (only used to pick realistic winners)
  const ROSTER = [
    ['Maya Reyes', 'Zephyr', 'Pikachu', 'Period 2', 1.6],
    ['Jordan Tran', 'NairGod', 'Marth', 'Period 2', 1.3],
    ['Luis Garcia', 'Kirbo', 'Kirby', 'Period 2', 0.4],
    ['Aiden Kim', 'DashDance', 'Fox', 'Period 2', 1.1],
    ['Priya Shah', 'Pixel', 'Inkling', 'Period 2', 0.9],
    ['Sam Wilson', 'Ledgehog', 'Sonic', 'Period 2', 0.6],
    ['Elena Volkova', 'Moonwalk', 'Bayonetta', 'Period 5', 1.4],
    ['Noah Brooks', 'Tilt', 'Donkey Kong', 'Period 5', 0.3],
    ['Zoe Martin', 'Combo', 'Joker', 'Period 5', 1.0],
    ['Chris Diaz', 'Spike', 'Ganondorf', 'Period 5', 0.7],
    ['Ava Patel', 'Starstorm', 'Rosalina & Luma', 'Period 5', 0.8],
    ['Ethan Cole', 'Hadoken', 'Ken', 'Period 5', 1.2]
  ];
  const SECONDARIES = ['Mario', 'Link', 'Lucina', 'Pac-Man', 'Steve', 'Sora', 'Cloud', 'Wolf', 'Peach', 'Mega Man', 'Byleth', 'Palutena'];

  function create() {
    const random = Utils.rng(2026);
    const DAY = 86400000;
    const now = Date.now();
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const start = midnight.getTime() - 24 * DAY;
    const iso = t => new Date(t).toISOString();

    const players = ROSTER.map(([name, tag, main, period], i) => ({
      id: 'demo_p' + (i + 1), name, tag, main, period, archived: false, createdAt: iso(start - DAY)
    }));
    const skill = new Map(ROSTER.map((row, i) => [players[i].id, row[4]]));
    const mainOf = new Map(players.map(p => [p.id, p.main]));
    const matches = [];

    const teamSkill = side => side.reduce((sum, id) => sum + skill.get(id), 0) / side.length;
    const pickChar = id => random() < 0.8 ? mainOf.get(id) : SECONDARIES[Math.floor(random() * SECONDARIES.length)];

    function playSet(sides, bestOf, playedAt, extra = {}) {
      const needed = Math.ceil(bestOf / 2);
      const chance = 1 / (1 + Math.exp(-(teamSkill(sides[0]) - teamSkill(sides[1])) * 2.2));
      const chars = sides.map(side => side.map(pickChar));
      const games = [];
      const score = [0, 0];
      while (score[0] < needed && score[1] < needed) {
        const winner = random() < chance ? 0 : 1;
        score[winner]++;
        games.push({ winner, chars: chars.map(c => c.slice()), stocksLeft: 1 + Math.floor(random() * 3 * sides[0].length) });
      }
      const m = {
        id: 'demo_m' + (matches.length + 1), type: sides[0].length === 2 ? 'doubles' : 'singles',
        playedAt, createdAt: playedAt, sides, bestOf, games, score,
        winner: score[0] === needed ? 0 : 1, source: 'manual', bracket: null, ...extra
      };
      matches.push(m);
      return m;
    }

    // About three weeks of class: singles inside each period, plus some doubles.
    const periods = ['Period 2', 'Period 5'].map(name => players.filter(p => p.period === name).map(p => p.id));
    for (let d = 0; d < 21; d++) {
      const dayStart = start + d * DAY;
      const weekday = new Date(dayStart).getDay();
      if (weekday === 0 || weekday === 6) continue;
      periods.forEach((ids, pi) => {
        const firstHour = pi ? 13 : 9;
        const sets = 1 + Math.floor(random() * 2);
        for (let k = 0; k < sets; k++) {
          const [a, b] = Utils.shuffle(ids, random);
          playSet([[a], [b]], 3, iso(dayStart + firstHour * 3600000 + k * 900000));
        }
        if (random() < 0.35) {
          const [a, b, c, e] = Utils.shuffle(ids, random);
          playSet([[a, b], [c, e]], 3, iso(dayStart + (firstHour + 1) * 3600000));
        }
      });
    }

    // Today's bracket for Period 2, played up to the final.
    const stats = Stats.compute({ settings: { startRating: 1000, kFactor: 32 }, matches });
    const entrants = Bracket.seed(
      periods[0].map((pid, i) => ({ id: 'demo_e' + (i + 1), players: [pid] })),
      'rating', e => Stats.seedRating(stats, 'singles', e.players[0]), random);
    const bracket = Bracket.create({
      id: 'demo_b1', name: 'Period 2 Showdown', type: 'singles', bestOf: 3, finalsBestOf: 5,
      seeding: 'rating', createdAt: iso(now - 150 * 60000), entrants
    });
    let minutesAgo = 120;
    for (let r = 0; r < bracket.rounds.length - 1; r++) {
      bracket.rounds[r].forEach((bm, i) => {
        if (bm.winner !== null || !bm.slots[0] || !bm.slots[1]) return;
        const sides = bm.slots.map(id => Bracket.entrant(bracket, id).players.slice());
        const m = playSet(sides, Bracket.bestOfFor(bracket, r), iso(now - minutesAgo * 60000),
          { source: 'bracket', bracket: { id: bracket.id, name: bracket.name, round: r, index: i } });
        minutesAgo -= 15;
        Bracket.applyResult(bracket, r, i, { winner: m.winner, matchId: m.id, score: m.score.slice() });
      });
    }

    return {
      version: 1,
      meta: { title: 'Smash Rankings', season: Utils.seasonName(), createdAt: iso(now), isSample: true, lastBackupAt: null, lastPublishedAt: null },
      settings: { startRating: 1000, kFactor: 32, provisionalSets: 3, bestOf: 3, stocks: 3, pinHash: null },
      players, matches, brackets: [bracket]
    };
  }

  return { create };
})();
