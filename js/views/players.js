/* Class roster: add players (one at a time or pasted as a list), edit, archive, delete. */
(() => {
  const { esc } = Utils;
  let search = '';
  let showArchived = false;

  Views.players = { render, openEditor };

  function render(root) {
    const s = Store.state;
    const main = Store.mode === 'main';
    const archived = s.players.filter(p => p.archived).length;
    const periods = Store.periods();

    root.innerHTML = `<div class="page">
      <section class="page-head">
        <div><h1>Players</h1>
          <p class="muted">${Utils.plural(s.players.length - archived, 'player')}${archived ? ` · ${archived} archived` : ''}</p></div>
      </section>
      ${main ? addForms() : ''}
      <datalist id="period-list">${periods.map(p => `<option value="${esc(p)}"></option>`).join('')}</datalist>
      <section class="card roster" aria-label="Roster">
        <div class="roster-tools">
          <label class="grow"><span class="visually-hidden">Search players</span>
            <input type="search" placeholder="Search gamertag, name, character or period" value="${esc(search)}" data-search></label>
          ${archived ? `<label class="check"><input type="checkbox" data-show-archived${showArchived ? ' checked' : ''}> Show archived</label>` : ''}
        </div>
        <div data-roster></div>
      </section>
    </div>`;

    const page = root.querySelector('.page');
    const rosterEl = page.querySelector('[data-roster]');
    const drawRoster = () => { rosterEl.innerHTML = rosterHtml(main); };
    drawRoster();

    page.querySelector('[data-search]').addEventListener('input', e => { search = e.target.value; drawRoster(); });
    const archivedBox = page.querySelector('[data-show-archived]');
    if (archivedBox) archivedBox.addEventListener('change', () => { showArchived = archivedBox.checked; drawRoster(); });

    const addForm = page.querySelector('[data-add]');
    if (addForm) addForm.addEventListener('submit', e => {
      e.preventDefault();
      UI.guard(() => {
        const errorEl = addForm.querySelector('.form-error');
        try {
          const p = Store.addPlayer(readFields(addForm));
          UI.toast(`Added ${p.tag}.`, { kind: 'success' });
          const tag = root.querySelector('[data-add] [name="tag"]');
          if (tag) tag.focus();
        } catch (err) {
          errorEl.textContent = err.message;
          errorEl.hidden = false;
        }
      });
    });

    const bulkForm = page.querySelector('[data-bulk]');
    if (bulkForm) bulkForm.addEventListener('submit', e => {
      e.preventDefault();
      const rows = bulkForm.elements.lines.value.split(/\r?\n/).map(line => {
        const [name = '', tag = '', period = ''] = line.split(/\t|,/).map(part => part.trim());
        return { name, tag, period };
      }).filter(row => row.name || row.tag);
      if (!rows.length) { UI.toast('Paste at least one name first.', { kind: 'warn' }); return; }
      UI.guard(() => {
        const { added, skipped } = Store.addPlayers(rows);
        const parts = [`Added ${Utils.plural(added.length, 'player')}.`];
        if (skipped.length) parts.push(`Skipped ${skipped.length} with a gamertag already taken: ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '…' : ''}`);
        UI.toast(parts.join(' '), { kind: skipped.length ? 'warn' : 'success', timeout: 8000 });
      });
    });

    page.addEventListener('click', e => {
      const mainPick = e.target.closest('[data-main-pick]');
      if (mainPick) { pickMain(mainPick.closest('form')); return; }
      const edit = e.target.closest('[data-edit]');
      if (edit) { openEditor(edit.dataset.edit); return; }
      const arch = e.target.closest('[data-archive]');
      if (arch) {
        const id = arch.dataset.archive;
        UI.guard(() => {
          const p = Store.player(id);
          if (!p) return;
          Store.setArchived(id, !p.archived);
          UI.toast(p.archived ? `${p.tag} is archived. Their matches still count.` : `${p.tag} is back on the roster.`);
        });
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) removePlayer(del.dataset.del);
    });
  }

  function addForms() {
    return `<div class="grid-2">
      <form class="card" data-add novalidate>
        <h2 class="card-title">Add a player</h2>
        <div class="form-grid">
          <label class="field"><span class="label">Gamertag</span>
            <input name="tag" maxlength="30" autocomplete="off" placeholder="Shown on the leaderboard"></label>
          <label class="field"><span class="label">Name</span>
            <input name="name" maxlength="60" autocomplete="off" placeholder="Student's name"></label>
          ${mainField('')}
          <label class="field"><span class="label">Class period <span class="optional">(optional)</span></span>
            <input name="period" maxlength="30" list="period-list" autocomplete="off" placeholder="e.g. Period 3"></label>
        </div>
        <p class="form-error" role="alert" hidden></p>
        <div class="form-actions"><button type="submit" class="btn btn-primary">Add player</button></div>
      </form>
      <form class="card" data-bulk novalidate>
        <h2 class="card-title">Add many at once</h2>
        <p class="muted small">Paste one student per line. You can add a gamertag and a class period after commas,
          or paste three columns from a spreadsheet.</p>
        <label class="field"><span class="visually-hidden">Students, one per line</span>
          <textarea name="lines" rows="5" placeholder="Jordan Lee&#10;Maya Patel, Mayhem&#10;Chris Diaz, Spike, Period 5"></textarea></label>
        <div class="form-actions"><button type="submit" class="btn btn-secondary">Add all</button></div>
      </form>
    </div>`;
  }

  function rosterHtml(main) {
    const st = Store.stats();
    const q = search.trim().toLowerCase();
    const list = Store.allPlayers().filter(p => (showArchived || !p.archived) &&
      (!q || [p.tag, p.name, p.main, p.period].some(v => (v || '').toLowerCase().includes(q))));
    if (!list.length) {
      return `<p class="muted roster-empty">${Store.state.players.length ? 'No players match your search.' : 'No players yet.' + (main ? ' Add your class above.' : '')}</p>`;
    }
    const ratingCell = rec => rec && rec.sets ? `${Math.round(rec.rating)} <span class="muted small">(${rec.wins}–${rec.losses})</span>` : '<span class="muted">—</span>';
    return `<div class="table-wrap table-wrap-flat"><table class="table">
      <thead><tr>
        <th scope="col">Player</th>
        <th scope="col" class="hide-sm">Main</th>
        <th scope="col" class="hide-md">Period</th>
        <th scope="col" class="num">Singles</th>
        <th scope="col" class="num hide-sm">Doubles</th>
        ${main ? '<th scope="col"><span class="visually-hidden">Actions</span></th>' : ''}
      </tr></thead>
      <tbody>${list.map(p => {
        const use = main ? Store.playerUsage(p.id) : null;
        const canDelete = use && !use.matches && !use.brackets;
        return `<tr class="${p.archived ? 'is-archived' : ''}">
          <td>${UI.playerLink(p)}${p.archived ? ' <span class="badge">Archived</span>' : ''}</td>
          <td class="hide-sm">${UI.charPill(p.main) || '<span class="muted">—</span>'}</td>
          <td class="hide-md">${p.period ? esc(p.period) : '<span class="muted">—</span>'}</td>
          <td class="num nowrap">${ratingCell(st.singles.get(p.id))}</td>
          <td class="num nowrap hide-sm">${ratingCell(st.doubles.get(p.id))}</td>
          ${main ? `<td class="actions-cell">
            <button type="button" class="btn btn-sm btn-ghost" data-edit="${esc(p.id)}">Edit</button>
            <button type="button" class="btn btn-sm btn-ghost" data-archive="${esc(p.id)}">${p.archived ? 'Restore' : 'Archive'}</button>
            ${canDelete ? `<button type="button" class="btn btn-sm btn-ghost btn-danger" data-del="${esc(p.id)}">Delete</button>` : ''}
          </td>` : ''}
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  }

  // "Main character" field: a picker button plus a hidden input the form reads.
  function mainField(main) {
    return `<div class="field"><span class="label">Main character</span>
        ${UI.charButton(main, { attrs: 'data-main-pick', label: 'Main character' })}
        <input type="hidden" name="main" value="${esc(main)}">
      </div>`;
  }

  async function pickMain(scope) {
    const input = scope.querySelector('input[name="main"]');
    const picked = await UI.pickCharacter({ current: input.value, title: 'Main character' });
    if (picked === null || !scope.isConnected) return;
    input.value = picked;
    scope.querySelector('[data-main-pick]').outerHTML = UI.charButton(picked, { attrs: 'data-main-pick', label: 'Main character' });
    scope.querySelector('[data-main-pick]').focus();
  }

  function readFields(scope) {
    const get = name => (scope.querySelector(`[name="${name}"]`) || {}).value || '';
    return { tag: get('tag'), name: get('name'), main: get('main'), period: get('period') };
  }

  function openEditor(id) {
    UI.guard(() => {
      const p = Store.player(id);
      if (!p) return;
      UI.modal({
        title: 'Edit player',
        body: `<div class="form-grid">
            <label class="field"><span class="label">Gamertag</span><input name="tag" maxlength="30" autocomplete="off" value="${esc(p.tag)}"></label>
            <label class="field"><span class="label">Name</span><input name="name" maxlength="60" autocomplete="off" value="${esc(p.name)}"></label>
            ${mainField(p.main)}
            <label class="field"><span class="label">Class period <span class="optional">(optional)</span></span>
              <input name="period" maxlength="30" list="period-list" autocomplete="off" value="${esc(p.period)}"></label>
          </div>`,
        onOpen: api => api.el.addEventListener('click', e => {
          if (e.target.closest('[data-main-pick]')) pickMain(api.el);
        }),
        actions: [
          { label: 'Cancel' },
          {
            label: 'Save', kind: 'primary', onClick: api => {
              Store.updatePlayer(id, readFields(api.el));
              UI.toast('Player updated.', { kind: 'success' });
            }
          }
        ]
      });
    });
  }

  function removePlayer(id) {
    UI.guard(async () => {
      const p = Store.player(id);
      if (!p) return;
      const ok = await UI.confirm({ title: `Delete ${p.tag}?`, message: 'They haven\'t played any matches, so nothing else changes.', confirmLabel: 'Delete', danger: true });
      if (!ok) return;
      if (UI.attempt(() => { Store.deletePlayer(id); return true; })) UI.toast(`Deleted ${p.tag}.`);
    });
  }
})();
