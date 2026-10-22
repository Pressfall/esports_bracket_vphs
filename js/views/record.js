/* Record a match after it's played, or edit one from the history. */
(() => {
  // This page keeps its own form state, so it isn't redrawn when scores change elsewhere.
  Views.record = { manual: true, render };

  function blankSides(type) {
    return type === 'doubles' ? [['', ''], ['', '']] : [[''], ['']];
  }

  function render(root, params) {
    const editId = params[0];
    const editing = editId ? Store.match(editId) : null;
    if (editId && !editing) {
      root.innerHTML = UI.emptyState({ title: 'Match not found', text: 'It may have been deleted.', actions: '<a class="btn btn-secondary" href="#/matches">Match history</a>' });
      return;
    }
    if (editing && Store.isBracketManaged(editing)) {
      root.innerHTML = UI.emptyState({
        title: 'This is a bracket match',
        text: 'Bracket results are changed from the bracket page, so the bracket stays correct.',
        actions: `<a class="btn btn-primary" href="#/brackets/${encodeURIComponent(editing.bracket.id)}">Open the bracket</a>`
      });
      return;
    }

    const s = Store.state;
    const people = s.players.filter(p => !p.archived || (editing && editing.sides.some(side => side.includes(p.id))))
      .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { sensitivity: 'base' }));
    if (people.length < 2) {
      root.innerHTML = UI.emptyState({ title: 'Add players first', text: 'You need at least two players to record a match.', actions: '<a class="btn btn-primary" href="#/players">Add players</a>' });
      return;
    }

    const form = {
      type: editing ? editing.type : (Store.prefs.get('recType', 'singles') === 'doubles' ? 'doubles' : 'singles'),
      bestOf: editing ? editing.bestOf : s.settings.bestOf,
      sides: editing ? Utils.clone(editing.sides) : null
    };
    if (!form.sides) form.sides = blankSides(form.type);

    root.innerHTML = `<div class="page">
      <section class="page-head">
        <div>
          <h1>${editing ? 'Edit match' : 'Record a match'}</h1>
          <p class="muted">${editing ? 'Fix a mistake. Everyone\'s ratings are recalculated.'
            : 'Enter a set after it\'s played. Playing right now? Use the <a href="#/live">live scoreboard</a>.'}</p>
        </div>
      </section>
      <form class="card record-form" novalidate>
        <div class="form-row">
          <div class="field"><span class="label">Match type</span>
            ${UI.seg('rec-type', [{ value: 'singles', label: 'Singles 1v1' }, { value: 'doubles', label: 'Doubles 2v2' }], form.type, { disabled: !!editing, label: 'Match type' })}</div>
          <div class="field"><span class="label">Format</span>${UI.seg('rec-bestof', UI.bestOfOptions(), form.bestOf, { label: 'Format' })}</div>
          <label class="field"><span class="label">Date played</span>
            <input type="date" name="date" value="${editing ? Utils.dayKey(editing.playedAt) : Utils.todayKey()}" max="${Utils.todayKey()}"></label>
        </div>
        <div class="versus" data-sides></div>
        <div data-entry-slot></div>
        <p class="form-error" role="alert" hidden></p>
        <div class="form-actions">
          ${editing ? '<a class="btn btn-secondary" href="#/matches">Cancel</a>' : '<button type="button" class="btn btn-secondary" data-action="clear">Clear</button>'}
          <button type="submit" class="btn btn-primary btn-lg" data-action="save" disabled>${editing ? 'Save changes' : 'Save match'}</button>
        </div>
      </form>
    </div>`;

    const formEl = root.querySelector('form');
    const sidesEl = root.querySelector('[data-sides]');
    const saveBtn = root.querySelector('[data-action="save"]');
    const errorEl = root.querySelector('.form-error');
    let entry = null;

    function showError(message) {
      errorEl.textContent = message;
      errorEl.hidden = !message;
    }

    function updateSave() {
      saveBtn.disabled = !(entry && entry.result());
      if (!saveBtn.disabled) showError('');
    }

    function drawSides() {
      const size = form.type === 'doubles' ? 2 : 1;
      const titles = size === 2 ? ['Orange team', 'Green team'] : ['Player 1', 'Player 2'];
      const side = si => `<div class="versus-side versus-${si}">
          <span class="versus-title">${titles[si]}</span>
          ${Utils.range(size).map(pi => `
            <label class="visually-hidden" for="pick-${si}-${pi}">${titles[si]}${size === 2 ? ', player ' + (pi + 1) : ''}</label>
            <select id="pick-${si}-${pi}" data-pick="${si}-${pi}">${UI.playerOptions(people, form.sides[si][pi])}</select>`).join('')}
        </div>`;
      sidesEl.innerHTML = side(0) + '<div class="versus-vs" aria-hidden="true">VS</div>' + side(1) +
        (size === 2 && people.length < 4 ? '<p class="versus-note">Doubles needs at least four players. <a href="#/players">Add more players</a>.</p>' : '');
      syncPicks();
    }

    // A player can't be picked twice.
    function syncPicks() {
      const selects = [...sidesEl.querySelectorAll('[data-pick]')];
      const chosen = selects.map(sel => sel.value);
      selects.forEach((sel, i) => {
        [...sel.options].forEach(opt => {
          opt.disabled = !!opt.value && chosen.some((v, j) => j !== i && v === opt.value);
        });
      });
    }

    // A fresh element each time, so an old form's listeners never pile up.
    function mountEntry(games) {
      const slot = root.querySelector('[data-entry-slot]');
      const holder = document.createElement('div');
      slot.replaceChildren(holder);
      entry = UI.setEntry(holder, {
        type: form.type, sides: form.sides, bestOf: form.bestOf, stocks: s.settings.stocks,
        games: games || [], onChange: updateSave
      });
      updateSave();
    }

    sidesEl.addEventListener('change', e => {
      const pick = e.target.closest('[data-pick]');
      if (!pick) return;
      const [si, pi] = pick.dataset.pick.split('-').map(Number);
      form.sides[si][pi] = pick.value;
      syncPicks();
      entry.setSides(form.sides);
      updateSave();
    });

    root.querySelectorAll('input[name="rec-type"]').forEach(radio => radio.addEventListener('change', () => {
      form.type = radio.value;
      form.sides = blankSides(form.type);
      Store.prefs.set('recType', form.type);
      drawSides();
      mountEntry();
    }));

    root.querySelectorAll('input[name="rec-bestof"]').forEach(radio => radio.addEventListener('change', () => {
      form.bestOf = Number(radio.value);
      entry.setBestOf(form.bestOf);
      updateSave();
    }));

    const clearBtn = root.querySelector('[data-action="clear"]');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      form.sides = blankSides(form.type);
      drawSides();
      mountEntry();
      showError('');
    });

    formEl.addEventListener('submit', e => {
      e.preventDefault();
      UI.guard(save);
    });

    function save() {
      const result = entry.result();
      if (!result) { showError('Finish the set first: pick who won each game.'); return; }
      const dateValue = formEl.elements.date.value;
      if (dateValue && dateValue > Utils.todayKey()) { showError('The date can\'t be in the future.'); return; }
      const input = {
        type: form.type, sides: form.sides, bestOf: form.bestOf, games: result.games,
        playedAt: Utils.dateInputToISO(dateValue, editing && editing.playedAt)
      };
      try {
        if (editing) {
          Store.updateMatch(editing.id, input);
          UI.toast('Match updated. Ratings were recalculated.', { kind: 'success' });
          location.hash = '#/matches';
          return;
        }
        const m = Store.addMatch(input);
        announce(m);
        form.sides = blankSides(form.type);
        drawSides();
        mountEntry();
        const first = sidesEl.querySelector('[data-pick]');
        if (first) first.focus();
      } catch (err) {
        showError(err.message);
      }
    }

    drawSides();
    mountEntry(editing ? editing.games : null);
  }

  function announce(m) {
    const d = Store.stats().deltas.get(m.id) || {};
    const w = m.winner;
    const changes = m.sides.flat().map(pid => `${Store.nameOf(pid)} ${Utils.signed(d[pid] || 0)}`).join(', ');
    UI.toast(`Saved: ${Store.sideName(m.sides[w])} beat ${Store.sideName(m.sides[1 - w])} ${m.score[w]}–${m.score[1 - w]}. ${changes}.`, {
      kind: 'success',
      timeout: 9000,
      action: {
        label: 'Undo',
        onClick: () => UI.attempt(() => { Store.deleteMatch(m.id); UI.toast('Match removed.'); })
      }
    });
  }

  // Brackets use the same "Saved" message.
  Views.record.announce = announce;
})();
