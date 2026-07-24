(async () => {
  const { events, meta, eventById } = await HUB.load();
  const E = HUB.esc;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const iso = d => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
  const parse = s => new Date(s + 'T12:00:00');

  // standard event playbook: task, days-before-event, phase
  const TEMPLATE = [
    ['Lock venue, date and budget', 42, 'Setup'],
    ['Finalize target list and start speaker outreach', 35, 'Setup'],
    ['Send vendor and gifting-suite asks', 28, 'Outreach'],
    ['Confirm speakers, open the Luma', 21, 'Outreach'],
    ['Send VIP invites, confirm F&B and activations', 14, 'Outreach'],
    ['Send reminders, finalize run of show', 7, 'Lock in'],
    ['Confirm product shipments received', 5, 'Lock in'],
    ['Final headcount and team brief', 3, 'Lock in'],
    ['Day of: check-in, signage, product staged', 0, 'Event day'],
    ['Send thank-yous, log who attended and sent product', -3, 'After'],
  ];

  const key = eid => 'wp_tasks_' + eid;
  const loadState = eid => { try { return JSON.parse(localStorage.getItem(key(eid)) || '{}'); } catch (e) { return {}; } };
  const saveState = (eid, st) => { try { localStorage.setItem(key(eid), JSON.stringify(st)); } catch (e) {} };

  const dueFor = (ev, off) => { const d = parse(ev.date); d.setDate(d.getDate() - off); return d; };
  function tasksFor(ev) {
    const st = loadState(ev.id);
    const done = st.done || {};
    const base = TEMPLATE.map(([title, off, phase], i) => ({ id: 't' + i, title, phase, due: dueFor(ev, off), done: !!done['t' + i], custom: false }));
    const custom = (st.custom || []).map(c => ({ id: c.id, title: c.title, phase: 'Custom', due: c.due ? parse(c.due) : null, done: !!done[c.id], custom: true }));
    return base.concat(custom);
  }

  // ---- calendar ----
  const evByDate = {};
  events.forEach(e => { if (e.date) (evByDate[e.date] = evByDate[e.date] || []).push(e); });

  let selected = null;
  const upcoming = events.filter(e => e.date && parse(e.date) >= today && e.status !== 'CANCELLED' && e.internal).sort((a, b) => a.date.localeCompare(b.date));
  selected = (upcoming[0] || events.filter(e => e.internal).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] || events[0]);
  // open on the nearest upcoming event's month so the calendar is not empty
  const startAt = (upcoming[0] && parse(upcoming[0].date)) || today;
  let vy = startAt.getFullYear(), vm = startAt.getMonth();

  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function renderCal() {
    const first = new Date(vy, vm, 1), startDow = first.getDay(), days = new Date(vy, vm + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) { const d = new Date(vy, vm, -(startDow - 1 - i)); cells.push({ d, dim: true }); }
    for (let day = 1; day <= days; day++) cells.push({ d: new Date(vy, vm, day), dim: false });
    while (cells.length % 7) { const last = cells[cells.length - 1].d; const d = new Date(last); d.setDate(d.getDate() + 1); cells.push({ d, dim: true }); }

    // task due dates for selected event this month
    const dueMarks = {};
    if (selected) tasksFor(selected).forEach(t => { if (t.due && !t.done) { const k = iso(t.due); (dueMarks[k] = dueMarks[k] || []).push(t); } });

    const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    document.getElementById('cal').innerHTML =
      '<div class="calhead"><h2>' + MON[vm] + ' ' + vy + '</h2><div class="navb"><button id="pm">&larr;</button><button id="tmo">Today</button><button id="nm">&rarr;</button></div></div>'
      + '<div class="caldow">' + dow.map(d => '<span>' + d + '</span>').join('') + '</div>'
      + '<div class="calgrid">' + cells.map(c => {
        const ds = iso(c.d), evs = evByDate[ds] || [], due = dueMarks[ds] || [];
        const isToday = ds === iso(today);
        return '<div class="calcell' + (c.dim ? ' dim' : '') + (isToday ? ' today' : '') + '"><div class="dnum">' + c.d.getDate() + '</div>'
          + evs.map(e => '<span class="calev' + (e.internal ? '' : ' ext') + '" data-e="' + E(e.id) + '" title="' + E(e.name) + '">' + E(e.name) + '</span>').join('')
          + due.slice(0, 2).map(t => '<span class="calev due" title="' + E(t.title) + '">&#9873; ' + E(t.title) + '</span>').join('')
          + '</div>';
      }).join('') + '</div>';
    document.getElementById('pm').onclick = () => { vm--; if (vm < 0) { vm = 11; vy--; } renderCal(); };
    document.getElementById('nm').onclick = () => { vm++; if (vm > 11) { vm = 0; vy++; } renderCal(); };
    document.getElementById('tmo').onclick = () => { vy = today.getFullYear(); vm = today.getMonth(); renderCal(); };
    document.querySelectorAll('.calev[data-e]').forEach(el => el.onclick = () => { selected = eventById[el.dataset.e]; renderTasks(); renderCal(); document.getElementById('tasks').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }

  // ---- tasks ----
  function renderTasks() {
    if (!selected) { document.getElementById('tasks').innerHTML = ''; return; }
    const ev = selected, list = tasksFor(ev), doneN = list.filter(t => t.done).length;
    const rel = d => { if (!d) return ''; const diff = Math.round((d - today) / 86400000); return diff === 0 ? 'today' : diff > 0 ? 'in ' + diff + 'd' : Math.abs(diff) + 'd ago'; };
    const cls = (t) => t.done ? '' : (t.due && t.due < today ? ' over' : (t.due && (t.due - today) / 86400000 <= 5 ? ' soon' : ''));
    let phase = '';
    const rows = list.map(t => {
      let head = '';
      if (t.phase !== phase && !t.custom) { phase = t.phase; head = '<div class="phase-lbl">' + E(t.phase) + '</div>'; }
      return head + '<div class="task' + (t.done ? ' done' : '') + '">'
        + '<span class="cbx" data-id="' + E(t.id) + '">&#10003;</span>'
        + '<span class="ti">' + E(t.title) + '</span>'
        + (t.due ? '<span class="due' + cls(t) + '">' + E(HUB.fmtDate(iso(t.due))) + ' &middot; ' + rel(t.due) + '</span>' : '')
        + (t.custom ? '<span class="del" data-del="' + E(t.id) + '">&times;</span>' : '')
        + '</div>';
    }).join('');
    document.getElementById('tasks').innerHTML =
      '<div class="taskhead"><h2>' + E(ev.name) + '</h2><span class="taskprog"><b>' + doneN + '</b> of ' + list.length + ' done &middot; ' + E(HUB.fmtDate(ev.date)) + ' &middot; <a href="event.html?e=' + encodeURIComponent(ev.id) + '" style="text-decoration:underline">open event</a></span></div>'
      + '<div class="tasklist">' + rows
      + '<div class="taskadd"><input type="text" id="newTask" placeholder="Add a task..."><button class="primary" id="addTask">Add</button></div></div>';

    document.querySelectorAll('.cbx').forEach(b => b.onclick = () => { const st = loadState(ev.id); st.done = st.done || {}; st.done[b.dataset.id] = !st.done[b.dataset.id]; saveState(ev.id, st); renderTasks(); renderCal(); });
    document.querySelectorAll('.del[data-del]').forEach(b => b.onclick = () => { const st = loadState(ev.id); st.custom = (st.custom || []).filter(c => c.id !== b.dataset.del); saveState(ev.id, st); renderTasks(); });
    const add = () => { const v = document.getElementById('newTask').value.trim(); if (!v) return; const st = loadState(ev.id); st.custom = st.custom || []; st.custom.push({ id: 'c' + Date.now(), title: v }); saveState(ev.id, st); renderTasks(); };
    document.getElementById('addTask').onclick = add;
    document.getElementById('newTask').addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  }

  document.getElementById('banners').innerHTML = '<div class="banner">Yellow blocks are Willpower events, gray are external. Pick an event to work its checklist below.</div>';
  renderCal(); renderTasks();
  document.getElementById('foot').textContent = meta.lastSyncAt ? 'Data refreshed ' + new Date(meta.lastSyncAt).toLocaleString() : '';
})();
