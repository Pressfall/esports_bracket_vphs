/* Single-elimination brackets. Only plain data in here (no page code), so it can be tested on its own.

   bracket.rounds[r][i] is one match: { slots: [entrantId, entrantId], winner: 0|1|null, matchId, score, bye }
   The winner of rounds[r][i] moves into rounds[r + 1][i >> 1], top slot if i is even, bottom if odd. */
const Bracket = (() => {
  function nextPowerOfTwo(n) {
    let p = 1;
    while (p < n) p *= 2;
    return p;
  }

  // Standard seeding: seed 1 plays the lowest seed, and seeds 1 and 2 can only meet in the final.
  // seedOrder(8) -> [1, 8, 4, 5, 2, 7, 3, 6]
  function seedOrder(size) {
    let order = [1];
    while (order.length < size) {
      const n = order.length * 2;
      order = order.flatMap(seed => [seed, n + 1 - seed]);
    }
    return order;
  }

  // Gives entrants seeds 1..n, by rating (equal ratings in random order) or completely random.
  function seed(entrants, method, ratingOf, random = Math.random) {
    const mixed = Utils.shuffle(entrants, random);
    if (method !== 'random') mixed.sort((a, b) => ratingOf(b) - ratingOf(a));
    return mixed.map((e, i) => ({ ...e, seed: i + 1 }));
  }

  // Doubles teams. "balanced" pairs the strongest player with the weakest, and so on.
  function makeTeams(playerIds, method, ratingOf, random = Math.random) {
    if (playerIds.length % 2) throw new Error('Doubles needs an even number of players.');
    const list = Utils.shuffle(playerIds, random);
    const teams = [];
    if (method === 'balanced') {
      list.sort((a, b) => ratingOf(b) - ratingOf(a));
      for (let i = 0; i < list.length / 2; i++) teams.push([list[i], list[list.length - 1 - i]]);
    } else {
      for (let i = 0; i < list.length; i += 2) teams.push([list[i], list[i + 1]]);
    }
    return teams;
  }

  // entrants: [{ id, players: [playerId, ...], seed }] with seeds 1..n
  function create({ id, name, type, bestOf, finalsBestOf, seeding, createdAt, entrants }) {
    if (entrants.length < 2) throw new Error('A bracket needs at least 2 entrants.');
    const size = nextPowerOfTwo(entrants.length);
    const order = seedOrder(size);
    const bySeed = new Map(entrants.map(e => [e.seed, e.id]));
    const rounds = [];
    for (let count = size / 2; count >= 1; count /= 2) {
      rounds.push(Array.from({ length: count }, () =>
        ({ slots: [null, null], winner: null, matchId: null, score: null, bye: false })));
    }
    const bracket = { id, name, type, bestOf, finalsBestOf, seeding, createdAt, entrants, rounds };

    rounds[0].forEach((m, i) => {
      m.slots = [bySeed.get(order[2 * i]) || null, bySeed.get(order[2 * i + 1]) || null];
    });
    // Byes: an entrant with no opponent goes straight to the next round.
    rounds[0].forEach((m, i) => {
      if (m.slots[0] && !m.slots[1]) { m.winner = 0; m.bye = true; advance(bracket, 0, i); }
      else if (!m.slots[0] && m.slots[1]) { m.winner = 1; m.bye = true; advance(bracket, 0, i); }
    });
    return bracket;
  }

  function advance(bracket, r, i) {
    if (r + 1 >= bracket.rounds.length) return;
    const m = bracket.rounds[r][i];
    bracket.rounds[r + 1][i >> 1].slots[i & 1] = m.slots[m.winner];
  }

  function applyResult(bracket, r, i, { winner, matchId, score }) {
    const m = bracket.rounds[r] && bracket.rounds[r][i];
    if (!m) throw new Error('That bracket match does not exist.');
    if (!m.slots[0] || !m.slots[1]) throw new Error('Both sides of this bracket match are not decided yet.');
    if (m.winner !== null) throw new Error('This bracket match already has a result.');
    m.winner = winner;
    m.matchId = matchId;
    m.score = score;
    advance(bracket, r, i);
    return bracket;
  }

  // A result can be undone until the winner plays their next match.
  function canUndo(bracket, r, i) {
    const m = bracket.rounds[r] && bracket.rounds[r][i];
    if (!m || m.winner === null || m.bye) return false;
    if (r + 1 >= bracket.rounds.length) return true;
    return bracket.rounds[r + 1][i >> 1].winner === null;
  }

  // Clears a result. Returns the id of the match record that should be removed.
  function undo(bracket, r, i) {
    if (!canUndo(bracket, r, i)) {
      throw new Error('A later match in this bracket has already been played. Undo that one first.');
    }
    const m = bracket.rounds[r][i];
    const matchId = m.matchId;
    m.winner = null;
    m.matchId = null;
    m.score = null;
    if (r + 1 < bracket.rounds.length) bracket.rounds[r + 1][i >> 1].slots[i & 1] = null;
    return matchId;
  }

  function roundName(bracket, r) {
    const fromEnd = bracket.rounds.length - 1 - r;
    if (fromEnd === 0) return 'Final';
    if (fromEnd === 1) return 'Semifinals';
    if (fromEnd === 2) return 'Quarterfinals';
    return 'Round ' + (r + 1);
  }

  function bestOfFor(bracket, r) {
    return r === bracket.rounds.length - 1 ? (bracket.finalsBestOf || bracket.bestOf) : bracket.bestOf;
  }

  function entrant(bracket, id) {
    return bracket.entrants.find(e => e.id === id) || null;
  }

  function champion(bracket) {
    const final = bracket.rounds[bracket.rounds.length - 1][0];
    return final.winner === null ? null : entrant(bracket, final.slots[final.winner]);
  }

  // Matches that can be played right now.
  function playable(bracket) {
    const list = [];
    bracket.rounds.forEach((round, r) => round.forEach((m, i) => {
      if (m.slots[0] && m.slots[1] && m.winner === null) list.push({ round: r, index: i });
    }));
    return list;
  }

  return {
    nextPowerOfTwo, seedOrder, seed, makeTeams, create, applyResult, canUndo, undo,
    roundName, bestOfFor, entrant, champion, playable
  };
})();
