(async () => {
  const { events, meta, eventById, tasksByEvent } = await HUB.load();
  const E = HUB.esc;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const iso = d => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
  const parse = s => new Date(s + 'T12:00:00');
  const TEAM = (window.WP_CONFIG && WP_CONFIG.team) || ['Bill', 'Kathleen'];

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
  const st = eid => { try { return JSON.parse(localStorage.getItem(key(eid)) || '{}'); } catch (e) { return {}; } };
  const save = (eid, s) => { try { localStorage.setItem(key(eid), JSON.stringify(s)); } catch (e) {} };
  const dueFor = (ev, off) => { const d = parse(ev.date); d.setDate(d.getDate() - off); return d; };

  // Notion TASK TRACKER items pulled per event (e.g. the Aug 19 checklist Kathleen assigned).
  const bucket = (db) => {
    if (db == null) return 'Scheduled';
    if (db < 0) return 'After the event';
    if (db === 0) return 'Event day';
    if (db <= 3) return 'Final 72 hours';
    if (db <= 7) return 'Event week';
    if (db <= 14) return 'Two weeks out';
    if (db <= 21) return 'Three weeks out';
    return 'Early prep';
  };
  function notionTasksFor(ev) {
    const list = (tasksByEvent && tasksByEvent[ev.id]) || [];
    const s = st(ev.id), nd = s.ndone || {}, asg = s.assignee || {};
    return list.map(t => {
      const id = 'n' + t.id;
      const base = t.status === 'COMPLETED';
      const done = (id in nd) ? !!nd[id] : base;
      const db = (ev.date && t.due) ? Math.round((parse(ev.date) - parse(t.due)) / 86400000) : null;
      return {
        eid: ev.id, id, title: t.title, phase: bucket(db), due: t.due ? parse(t.due) : null,
        done, assignee: asg[id] || (t.assignee && t.assignee[0]) || '', custom: false,
        notion: true, priority: t.priority || '', status: t.status || '', category: t.category || '', desc: t.desc || '', url: t.url || '',
      };
    });
  }
  function tasksFor(ev) {
    const s = st(ev.id), done = s.done || {}, asg = s.assignee || {};
    const custom = (s.custom || []).map(c => ({ eid: ev.id, id: c.id, title: c.title, phase: 'Custom', due: c.due ? parse(c.due) : null, done: !!done[c.id], assignee: asg[c.id] || c.assignee || '', custom: true }));
    const notion = notionTasksFor(ev);
    if (notion.length) return notion.concat(custom); // real Notion checklist replaces the generic template
    const base = TEMPLATE.map(([title, off, phase], i) => ({ eid: ev.id, id: 't' + i, title, phase, due: dueFor(ev, off), done: !!done['t' + i], assignee: asg['t' + i] || '', custom: false }));
    return base.concat(custom);
  }
  const internal = events.filter(e => e.internal && e.date);
  const upcoming = internal.filter(e => parse(e.date) >= today && e.status !== 'CANCELLED').sort((a, b) => a.date.localeCompare(b.date));

  // build a due-date index across all internal events
  const dueIndex = {};
  internal.forEach(e => tasksFor(e).forEach(t => { if (t.due) { const k = iso(t.due); (dueIndex[k] = dueIndex[k] || []).push(t); } }));
  const evByDate = {};
  events.forEach(e => { if (e.date) (evByDate[e.date] = evByDate[e.date] || []).push(e); });

  let selected = upcoming[0] || internal.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] || events[0];
  const startAt = (upcoming[0] && parse(upcoming[0].date)) || today;
  let vy = startAt.getFullYear(), vm = startAt.getMonth();
  let openDayStr = null;

  const setDone = (eid, tid, val) => {
    const s = st(eid);
    if (tid[0] === 'n') { s.ndone = s.ndone || {}; s.ndone[tid] = val ? 1 : 0; } // notion tasks: explicit tri-state override
    else { s.done = s.done || {}; if (val) s.done[tid] = 1; else delete s.done[tid]; }
    save(eid, s); rebuild();
  };
  const setAssignee = (eid, tid, who) => { const s = st(eid); s.assignee = s.assignee || {}; if (who) s.assignee[tid] = who; else delete s.assignee[tid]; save(eid, s); rebuild(); };
  const addTask = (eid, title, who, dueStr) => { if (!title) return; const s = st(eid); s.custom = s.custom || []; s.custom.push({ id: 'c' + (Object.keys(s.custom).length + '' + title.length + iso(today).replace(/-/g, '')), title, assignee: who || '', due: dueStr || null }); save(eid, s); rebuild(); };
  const delTask = (eid, tid) => { const s = st(eid); s.custom = (s.custom || []).filter(c => c.id !== tid); if (s.done) delete s.done[tid]; if (s.assignee) delete s.assignee[tid]; save(eid, s); rebuild(); };

  const asgSel = t => '<select class="asg" data-has="' + (t.assignee ? 1 : 0) + '" data-eid="' + E(t.eid) + '" data-tid="' + E(t.id) + '"><option value="">Assign</option>' + TEAM.map(m => '<option' + (m === t.assignee ? ' selected' : '') + '>' + E(m) + '</option>').join('') + '</select>';
  const cbx = t => '<span class="cbx" data-eid="' + E(t.eid) + '" data-tid="' + E(t.id) + '" data-done="' + (t.done ? 1 : 0) + '">&#10003;</span>';
  const pchip = t => t.priority ? '<span class="pchip ' + E(t.priority.toLowerCase()) + '">' + E(t.priority) + '</span>' : '';
  const nlink = t => t.notion && t.url ? '<a class="nlink" href="' + E(t.url) + '" target="_blank" rel="noopener" title="Open in Notion" onclick="event.stopPropagation()">Notion&#8599;</a>' : '';

  function rebuild() {
    // recompute index (assignments/done changed)
    for (const k in dueIndex) delete dueIndex[k];
    internal.forEach(e => tasksFor(e).forEach(t => { if (t.due) { const k = iso(t.due); (dueIndex[k] = dueIndex[k] || []).push(t); } }));
    renderCal(); renderBoard(); if (openDayStr) renderDay(openDayStr);
  }

  function wire(root) {
    root.querySelectorAll('.cbx[data-tid]').forEach(b => b.onclick = () => setDone(b.dataset.eid, b.dataset.tid, b.dataset.done !== '1'));
    root.querySelectorAll('.asg[data-tid]').forEach(s => s.onchange = () => setAssignee(s.dataset.eid, s.dataset.tid, s.value));
    root.querySelectorAll('.deltask[data-tid]').forEach(b => b.onclick = () => delTask(b.dataset.eid, b.dataset.tid));
  }

  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function renderCal() {
    const first = new Date(vy, vm, 1), startDow = first.getDay(), days = new Date(vy, vm + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) { const d = new Date(vy, vm, -(startDow - 1 - i)); cells.push({ d, dim: true }); }
    for (let day = 1; day <= days; day++) cells.push({ d: new Date(vy, vm, day), dim: false });
    while (cells.length % 7) { const last = cells[cells.length - 1].d; const d = new Date(last); d.setDate(d.getDate() + 1); cells.push({ d, dim: true }); }
    const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    document.getElementById('cal').innerHTML =
      '<div class="calhead"><h2>' + MON[vm] + ' ' + vy + '</h2><div class="navb"><button id="pm">&larr;</button><button id="tmo">Today</button><button id="nm">&rarr;</button></div></div>'
      + '<div class="caldow">' + dow.map(d => '<span>' + d + '</span>').join('') + '</div>'
      + '<div class="calgrid">' + cells.map(c => {
        const ds = iso(c.d), evs = evByDate[ds] || [], tasks = dueIndex[ds] || [];
        const isToday = ds === iso(today), has = evs.length || tasks.length;
        const items = [];
        evs.slice(0, 2).forEach(e => items.push('<span class="calev' + (e.internal ? '' : ' ext') + '">' + E(e.name) + '</span>'));
        tasks.slice(0, evs.length ? 1 : 2).forEach(t => items.push('<span class="caltask' + (t.done ? ' done' : '') + '"><span class="d"></span>' + E(t.title) + '</span>'));
        const shown = evs.slice(0, 2).length + tasks.slice(0, evs.length ? 1 : 2).length;
        const more = (evs.length + tasks.length) - shown;
        return '<div class="calcell' + (c.dim ? ' dim' : '') + (isToday ? ' today' : '') + (has ? ' has' : '') + '" data-ds="' + ds + '"><span class="dnum">' + c.d.getDate() + '</span>'
          + items.join('') + (more > 0 ? '<span class="calmore">+' + more + ' more</span>' : '') + '</div>';
      }).join('') + '</div>';
    document.getElementById('pm').onclick = () => { vm--; if (vm < 0) { vm = 11; vy--; } renderCal(); };
    document.getElementById('nm').onclick = () => { vm++; if (vm > 11) { vm = 0; vy++; } renderCal(); };
    document.getElementById('tmo').onclick = () => { vy = today.getFullYear(); vm = today.getMonth(); renderCal(); };
    document.querySelectorAll('.calcell.has').forEach(el => el.onclick = () => renderDay(el.dataset.ds));
  }

  // ---- day modal ----
  function renderDay(ds) {
    openDayStr = ds;
    const evs = evByDate[ds] || [], tasks = (dueIndex[ds] || []).slice().sort((a, b) => (a.done - b.done));
    const evLinks = evs.map(e => '<a class="minirow" href="event.html?e=' + encodeURIComponent(e.id) + '"><span class="nm">' + E(e.name) + '</span><span class="tag ' + (e.internal ? 'city' : 'line') + '">' + (e.internal ? 'Willpower event' : 'external') + '</span></a>').join('');
    const taskRows = tasks.map(t => '<div class="dayrow' + (t.done ? ' done' : '') + '">' + cbx(t) + '<span class="ti">' + E(t.title) + '<div class="ev">' + E((eventById[t.eid] || {}).name || '') + (t.category ? ' · ' + E(t.category) : '') + '</div></span>' + pchip(t) + asgSel(t) + nlink(t) + '</div>').join('');
    const evOpts = upcoming.map(e => '<option value="' + E(e.id) + '"' + (e.id === selected.id ? ' selected' : '') + '>' + E(e.name) + '</option>').join('');
    const box = document.getElementById('dayModal');
    box.querySelector('.box').innerHTML =
      '<h2>' + E(HUB.fmtDate(ds)) + '</h2>'
      + (evs.length ? '<div class="minilist" style="margin:10px 0">' + evLinks + '</div>' : '')
      + (tasks.length ? taskRows : '<div class="mut" style="padding:8px 0">No tasks due this day.</div>')
      + '<div class="taskadd" style="padding:14px 0 0;border:0"><select id="dEv">' + evOpts + '</select><input type="text" id="dNew" placeholder="Add a task for this day..."><select id="dAsg"><option value="">Assign</option>' + TEAM.map(m => '<option>' + E(m) + '</option>').join('') + '</select><button class="primary" id="dAdd">Add</button></div>'
      + '<div style="margin-top:14px"><button id="dClose">Close</button></div>';
    box.classList.add('open');
    wire(box);
    box.querySelector('#dClose').onclick = () => { box.classList.remove('open'); openDayStr = null; };
    box.querySelector('#dAdd').onclick = () => { const v = box.querySelector('#dNew').value.trim(); addTask(box.querySelector('#dEv').value, v, box.querySelector('#dAsg').value, ds); };
    box.querySelector('#dNew').addEventListener('keydown', e => { if (e.key === 'Enter') box.querySelector('#dAdd').click(); });
  }

  // ---- task board (selected event) ----
  function renderBoard() {
    const ev = selected; if (!ev) { document.getElementById('tasks').innerHTML = ''; return; }
    const list = tasksFor(ev), doneN = list.filter(t => t.done).length;
    const rel = d => { if (!d) return ''; const diff = Math.round((d - today) / 86400000); return diff === 0 ? 'today' : diff > 0 ? 'in ' + diff + 'd' : Math.abs(diff) + 'd ago'; };
    const cls = t => t.done ? '' : (t.due && t.due < today ? ' over' : (t.due && (t.due - today) / 86400000 <= 5 ? ' soon' : ''));
    let phase = '';
    const rows = list.map(t => {
      let head = '';
      if (t.phase !== phase) { phase = t.phase; head = '<div class="phase-lbl">' + E(t.phase) + '</div>'; }
      return head + '<div class="task' + (t.done ? ' done' : '') + '">' + cbx(t)
        + '<span class="ti">' + E(t.title) + (t.category ? '<span class="cat">' + E(t.category) + '</span>' : '') + '</span>' + pchip(t) + asgSel(t)
        + (t.due ? '<span class="due' + cls(t) + '">' + E(HUB.fmtDate(iso(t.due))) + ' &middot; ' + rel(t.due) + '</span>' : '<span class="due"></span>')
        + nlink(t)
        + (t.custom ? '<span class="del deltask" data-eid="' + E(ev.id) + '" data-tid="' + E(t.id) + '">&times;</span>' : '') + '</div>';
    }).join('');
    const evOpts = internal.slice().sort((a, b) => (a.date).localeCompare(b.date)).map(e => '<option value="' + E(e.id) + '"' + (e.id === ev.id ? ' selected' : '') + '>' + E(e.name) + '</option>').join('');
    const fromNotion = ((tasksByEvent && tasksByEvent[ev.id]) || []).length > 0;
    document.getElementById('tasks').innerHTML =
      '<div class="taskhead"><h2>Checklist' + (fromNotion ? ' <span class="src">from Notion</span>' : '') + '</h2><span class="taskprog"><select id="boardEv" style="margin-right:10px">' + evOpts + '</select><b>' + doneN + '</b> of ' + list.length + ' done</span></div>'
      + '<div class="tasklist">' + rows
      + '<div class="taskadd"><input type="text" id="newTask" placeholder="Add a task..."><select id="newAsg"><option value="">Assign</option>' + TEAM.map(m => '<option>' + E(m) + '</option>').join('') + '</select><button class="primary" id="addTask">Add</button></div></div>';
    wire(document.getElementById('tasks'));
    document.getElementById('boardEv').onchange = e => { selected = eventById[e.target.value]; renderBoard(); };
    const add = () => { const v = document.getElementById('newTask').value.trim(); addTask(ev.id, v, document.getElementById('newAsg').value); };
    document.getElementById('addTask').onclick = add;
    document.getElementById('newTask').addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  }

  const nTasks = (tasksByEvent && Object.values(tasksByEvent).reduce((n, a) => n + a.length, 0)) || 0;
  document.getElementById('banners').innerHTML = '<div class="banner">Tap any day to see exactly what is due and add tasks. Yellow blocks are Willpower events; dots are to-dos.' + (nTasks ? ' The Aug 19 checklist (' + nTasks + ' tasks) is pulled from the Notion TASK TRACKER.' : '') + '</div>';
  renderCal(); renderBoard();
  document.getElementById('foot').textContent = meta.lastSyncAt ? 'Data refreshed ' + new Date(meta.lastSyncAt).toLocaleString() : '';
})();
