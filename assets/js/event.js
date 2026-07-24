(async () => {
  const { contacts, events, pipeline, nearby, meta, eventById, contactById, tasksByEvent } = await HUB.load();
  const E = HUB.esc;
  const id = new URLSearchParams(location.search).get('e');
  const ev = eventById[id];
  if (!ev) {
    document.getElementById('title').textContent = 'Event not found';
    document.getElementById('facts').innerHTML = 'If you just added it in Notion, it appears after the next sync. <a href="index.html" style="text-decoration:underline">Back to events</a>';
    return;
  }
  document.title = ev.name + ' · Willpower Outreach HQ';
  document.getElementById('title').textContent = ev.name;
  const cd = HUB.countdown(ev.date);
  document.getElementById('countdown').innerHTML = cd ? '<span class="pill2">' + E(cd) + '</span>' : '';

  const fact = (label, val) => val ? '<span class="f"><span class="dot">' + label + '</span> <b>' + E(val) + '</b></span>' : '';
  document.getElementById('facts').innerHTML =
    fact('Date', HUB.fmtDate(ev.date)) + fact('City', ev.cityKey || ev.locationRaw) + fact('Venue', ev.venue)
    + fact('Type', (ev.type || []).join(', ')) + fact('', ev.internal ? 'Willpower event' : 'External event') + fact('Status', ev.status);
  let links = '';
  if (ev.luma) links += '<a class="btn" href="' + E(ev.luma) + '" target="_blank" rel="noopener">Luma</a>';
  if (ev.website) links += '<a class="btn" href="' + E(ev.website) + '" target="_blank" rel="noopener">Website</a>';
  document.getElementById('links').innerHTML = links;
  document.getElementById('links2').innerHTML = '<a class="btn" href="sponsor.html?e=' + encodeURIComponent(ev.id) + '" target="_blank" rel="noopener">Sponsor view &#8599;</a>'
    + (ev.internal ? '<a class="btn" href="run-of-show.html?e=' + encodeURIComponent(ev.id) + '">Run of show</a><a class="btn" href="calendar.html">Calendar</a>' : '');

  // ---- Notion TASK TRACKER checklist (shares localStorage with the Calendar page) ----
  const TEAM = (window.WP_CONFIG && WP_CONFIG.team) || ['Bill', 'Kathleen'];
  const evTasks = (tasksByEvent && tasksByEvent[ev.id]) || [];
  const TKEY = 'wp_tasks_' + ev.id;
  const tState = () => { try { return JSON.parse(localStorage.getItem(TKEY) || '{}'); } catch (e) { return {}; } };
  const tSave = s => { try { localStorage.setItem(TKEY, JSON.stringify(s)); } catch (e) {} };
  const parseD = s => s ? new Date(s + 'T12:00:00') : null;
  const today0 = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const tBucket = db => db == null ? 'Scheduled' : db < 0 ? 'After the event' : db === 0 ? 'Event day' : db <= 3 ? 'Final 72 hours' : db <= 7 ? 'Event week' : db <= 14 ? 'Two weeks out' : db <= 21 ? 'Three weeks out' : 'Early prep';
  const taskList = () => {
    const s = tState(), nd = s.ndone || {}, asg = s.assignee || {}, evd = parseD(ev.date);
    return evTasks.map(t => {
      const tid = 'n' + t.id, base = t.status === 'COMPLETED', due = parseD(t.due);
      return {
        id: tid, title: t.title, done: (tid in nd) ? !!nd[tid] : base, due,
        phase: tBucket(evd && due ? Math.round((evd - due) / 86400000) : null),
        assignee: asg[tid] || (t.assignee && t.assignee[0]) || '', priority: t.priority || '', category: t.category || '', url: t.url || '',
      };
    });
  };
  const setTaskDone = (tid, val) => { const s = tState(); s.ndone = s.ndone || {}; s.ndone[tid] = val ? 1 : 0; tSave(s); render(); };
  const setTaskAssignee = (tid, who) => { const s = tState(); s.assignee = s.assignee || {}; if (who) s.assignee[tid] = who; else delete s.assignee[tid]; tSave(s); render(); };
  function checklistHTML() {
    let list = taskList();
    if (q) { const s = q.toLowerCase(); list = list.filter(t => (t.title || '').toLowerCase().includes(s) || (t.category || '').toLowerCase().includes(s)); }
    const iso = d => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
    const rel = d => { if (!d) return ''; const diff = Math.round((d - today0) / 86400000); return diff === 0 ? 'today' : diff > 0 ? 'in ' + diff + 'd' : Math.abs(diff) + 'd ago'; };
    const cls = t => t.done ? '' : (t.due && t.due < today0 ? ' over' : (t.due && (t.due - today0) / 86400000 <= 5 ? ' soon' : ''));
    const pchip = t => t.priority ? '<span class="pchip ' + E(t.priority.toLowerCase()) + '">' + E(t.priority) + '</span>' : '';
    const nlink = t => t.url ? '<a class="nlink" href="' + E(t.url) + '" target="_blank" rel="noopener" title="Open in Notion" onclick="event.stopPropagation()">Notion&#8599;</a>' : '';
    const asg = t => '<select class="asg" data-has="' + (t.assignee ? 1 : 0) + '" data-tid="' + E(t.id) + '"><option value="">Assign</option>' + TEAM.map(m => '<option' + (m === t.assignee ? ' selected' : '') + '>' + E(m) + '</option>').join('') + '</select>';
    let phase = '';
    const rows = list.map(t => {
      let head = ''; if (t.phase !== phase) { phase = t.phase; head = '<div class="phase-lbl">' + E(t.phase) + '</div>'; }
      return head + '<div class="task' + (t.done ? ' done' : '') + '">'
        + '<span class="cbx" data-tid="' + E(t.id) + '" data-done="' + (t.done ? 1 : 0) + '">&#10003;</span>'
        + '<span class="ti">' + E(t.title) + (t.category ? '<span class="cat">' + E(t.category) + '</span>' : '') + '</span>'
        + pchip(t) + asg(t)
        + (t.due ? '<span class="due' + cls(t) + '">' + E(HUB.fmtDate(iso(t.due))) + ' &middot; ' + rel(t.due) + '</span>' : '<span class="due"></span>')
        + nlink(t) + '</div>';
    }).join('');
    return '<div class="tasklist">' + (rows || '<div class="task"><span class="ti mut">No tasks match.</span></div>') + '</div>';
  }

  // past-confirmed count per contact (warm path)
  const pastConfirmed = {};
  pipeline.forEach(r => {
    if (r.contactId && r.status === 'CONFIRMED') {
      const pe = eventById[r.eventId];
      if (pe && pe.date && new Date(pe.date) < new Date() && r.eventId !== ev.id) pastConfirmed[r.contactId] = (pastConfirmed[r.contactId] || 0) + 1;
    }
  });

  // Status marks. If the Notion write path is live (Netlify function configured), edits save to Notion
  // and are shared with everyone; otherwise they fall back to this device (localStorage).
  const OVKEY = 'wp_status_' + ev.id;
  let overrides = {};
  try { overrides = JSON.parse(localStorage.getItem(OVKEY) || '{}'); } catch (e) {}
  const saveOv = () => { try { localStorage.setItem(OVKEY, JSON.stringify(overrides)); } catch (e) {} };
  let pidMap = {};       // contactId -> EVENT PIPELINE page id (from Notion)
  let notionMode = false; // true once the function confirms it is configured
  const STATUS_OPTS = ['TO CONTACT', 'CONTACTED', '1ST FOLLOW UP', '2ND FOLLOW UP', '3RD FOLLOW UP', 'ENGAGED', 'NEGOTIATIONS', 'CONFIRMED', 'DECLINED', 'BACKUP'];

  const effPipeline = () => {
    const have = new Set();
    const out = pipeline.map(r => {
      if (r.eventId === ev.id && r.contactId) { have.add(r.contactId); if (overrides[r.contactId]) return Object.assign({}, r, { status: overrides[r.contactId] }); }
      return r;
    });
    Object.keys(overrides).forEach(cid => { if (!have.has(cid)) out.push({ contactId: cid, eventId: ev.id, status: overrides[cid], role: 'Attendee target', name: (contactById[cid] || {}).name }); });
    return out;
  };

  let showAll = false, tab = 'all', q = '';
  const build = () => SCORE.buildEventView(contacts, effPipeline(), ev, eventById, events, { includeUnknown: document.getElementById('includeUnknown').checked, showAllSuggested: showAll });

  document.getElementById('banners').innerHTML = !ev.internal
    ? '<div class="banner">External event. This list is people confirmed as attending, not our database. ' + (ev.luma ? 'Signups from the <a href="' + E(ev.luma) + '" target="_blank" rel="noopener" style="text-decoration:underline">Luma</a> flow in on each sync.' : 'Add the event\'s Luma link in Notion so signups flow in.') + '</div>'
    : (!ev.cityKey ? '<div class="banner warn">City not mapped for this event, so suggestions use top contacts from all locations.</div>' : HUB.staleBanner(meta));

  const view0 = build();
  const rowsForEvent = view0.eventRows;
  const cnt = s => rowsForEvent.filter(r => s.includes(r.status)).length;
  const total = rowsForEvent.length || 1;
  const conf = cnt(['CONFIRMED']);
  const motion = rowsForEvent.filter(r => SCORE.IN_MOTION.has(r.status) && r.status !== 'CONFIRMED').length;
  const notyet = Math.max(0, rowsForEvent.length - conf - motion);
  const pct = n => (100 * n / total).toFixed(1) + '%';
  document.getElementById('pbar').innerHTML = rowsForEvent.length
    ? '<div class="track"><div class="seg-c" style="width:' + pct(conf) + '"></div><div class="seg-m" style="width:' + pct(motion) + '"></div><div class="seg-s" style="width:' + pct(notyet) + '"></div></div>'
      + '<div class="lbls">'
      + '<span class="k"><span class="sw" style="background:var(--green)"></span><b>' + conf + '</b> confirmed</span>'
      + '<span class="k"><span class="sw" style="background:var(--yellow)"></span><b>' + motion + '</b> in motion</span>'
      + '<span class="k"><span class="sw" style="background:var(--s-blue)"></span><b>' + notyet + '</b> to contact</span>'
      + '<span class="k"><b>' + rowsForEvent.length + '</b> on the list</span>'
      + (view0.similarPast.length ? '<span class="k">similar to ' + E(view0.similarPast.slice(0, 2).join(', ')) + '</span>' : '')
      + '</div>'
    : '<div class="lbls"><span class="k">No list yet. ' + (ev.internal ? 'See suggested invites below.' : 'Add attendees via Luma.') + '</span></div>';

  const fu = rowsForEvent.filter(r => r.followUp && r.followUp.needed).sort((a, b) => (b.followUp.daysSince || 0) - (a.followUp.daysSince || 0));
  document.getElementById('followups').innerHTML = fu.length ? '<div class="panel flag"><h2>Follow-up reminders</h2>'
    + fu.slice(0, 12).map(r => { const c = contacts.find(x => x.id === r.contactId) || {};
        return '<div class="rowline"><span><b>' + E(c.name || r.name) + '</b> <span class="mut">' + E(c.companyName || '') + '</span></span><span><span class="st" data-s="' + E(r.status) + '">' + E(r.status) + '</span> <span class="mut">' + r.followUp.daysSince + 'd since last email</span> ' + (c.email ? HUB.copyBtn(c.email) : '') + '</span></div>';
      }).join('') + '</div>' : '';

  const near = (nearby[ev.id] && nearby[ev.id].items) || [];
  document.getElementById('nearby').innerHTML = near.length
    ? '<div class="minilist">' + near.map(n => { const d = ev.date && n.date ? Math.round((new Date(n.date) - new Date(ev.date)) / 86400000) : null;
        const chip = d === null ? '' : d === 0 ? 'same day' : d > 0 ? d + 'd after' : Math.abs(d) + 'd before';
        return '<a class="minirow" href="' + E(n.url || '#') + '" target="_blank" rel="noopener"><span class="d">' + E(HUB.fmtDate(n.date)) + '</span><span class="nm">' + E(n.name) + '</span>' + (chip ? '<span class="tag line">' + chip + '</span>' : '') + '<span class="loc">' + E(n.why || n.venue || '') + '</span></a>';
      }).join('') + '</div>'
    : '<div class="minilist"><div class="empty">Nothing found yet. The scan runs when the event is within 60 days.</div></div>';

  const statusSelect = it => {
    const cur = it.status || 'TO CONTACT';
    if (!it.c.id) return it.status ? '<span class="st" data-s="' + E(it.status) + '">' + E(it.status) + '</span>' : '';
    const pid = pidMap[it.c.id] || (it.row && it.row.id) || '';
    return '<select class="stsel" data-s="' + E(cur) + '" data-cid="' + E(it.c.id) + '" data-pid="' + E(pid) + '">'
      + STATUS_OPTS.map(o => '<option' + (o === cur ? ' selected' : '') + '>' + o + '</option>').join('') + '</select>';
  };
  const detailOf = it => {
    const warm = pastConfirmed[it.c.id] ? 'Returning &middot; ' + pastConfirmed[it.c.id] + ' past event' + (pastConfirmed[it.c.id] > 1 ? 's' : '') : '';
    const join = arr => arr.filter(Boolean).join(' &middot; ');
    if (tab === 'suggested') return join([warm, (it.why || []).slice(0, 2).map(E).join(' &middot; ')]);
    const r = it.row || {}, parts = [];
    const vt = it.vendorType ? (Array.isArray(it.vendorType) ? it.vendorType : [it.vendorType]) : null;
    if (vt) parts.push(...vt.map(E));
    if (r.product) parts.push(E(r.product));
    if (r.logistics) parts.push(E(r.logistics));
    if (!parts.length && r.speakerAngle) parts.push(E(r.speakerAngle));
    if (!parts.length && r.relationship) parts.push(E(r.relationship));
    return join([warm, parts.join(' &middot; ')]);
  };
  const draftBtn = it => (it.c.id && it.c.email && it.c.emailStatus === 'ok')
    ? ' <button class="draftbtn" data-cid="' + E(it.c.id) + '" data-kind="' + (window.WP_DRAFT ? WP_DRAFT.kindFor(it) : 'invite') + '">Draft</button>' : '';
  const personRow = it => {
    const c = it.c, detail = detailOf(it);
    return '<div class="prow">'
      + '<div class="who"><div class="nm">' + E(c.name || '') + (c.linkedin ? ' <a class="li" href="' + E(c.linkedin) + '" target="_blank" rel="noopener">in</a>' : '') + '</div><div class="t">' + E(c.title || '') + '</div>' + (detail ? '<div class="why">' + detail + '</div>' : '') + '</div>'
      + '<div class="co" data-label="Company">' + E(c.companyName || c.company || '') + '</div>'
      + '<div data-label="Status">' + statusSelect(it) + '</div>'
      + '<div data-label="Email">' + HUB.emailCell(c) + draftBtn(it) + '</div>'
      + '</div>';
  };
  const renderList = items => {
    if (!items.length) return '<div class="plist"><div class="empty">No one here yet.</div></div>';
    return '<div class="plist"><div class="phead-row"><span>Name / title</span><span>Company</span><span>Status</span><span>Email</span></div>'
      + items.map(personRow).join('') + '</div>';
  };

  const isSpk = i => (i.row && i.row.role === 'Speaker target') || (i.c.category || []).some(x => /SPEAKER/i.test(x));
  const isVen = i => i.row && (i.row.role === 'Vendor' || i.row.role === 'Sponsor guest' || i.row.vendorType);
  function copyRoster(items) {
    const line = i => (i.c.name || '') + (i.c.companyName ? ' - ' + i.c.companyName : '') + (i.row && i.row.product ? ' (' + i.row.product + ')' : '') + (i.c.email ? '  ' + i.c.email : '');
    const spk = items.filter(isSpk), ven = items.filter(i => !isSpk(i) && isVen(i)), att = items.filter(i => !isSpk(i) && !isVen(i));
    const sec = (t, arr) => arr.length ? t + ' (' + arr.length + ')\n' + arr.map(line).join('\n') + '\n\n' : '';
    const txt = 'CONFIRMED - ' + ev.name + ' - ' + HUB.fmtDate(ev.date) + '\n\n' + sec('SPEAKERS', spk) + sec('VENDORS', ven) + sec('GUESTS', att);
    navigator.clipboard.writeText(txt).then(() => { const cr = document.getElementById('copyRoster'); if (cr) cr.textContent = 'Copied'; });
  }
  const render = () => {
    const v = build(), B = v.buckets;
    const confirmedItems = (B.all || []).filter(i => i.status === 'CONFIRMED');

    // mission control: goals + metrics (internal events)
    const gEl = document.getElementById('goals'), mEl = document.getElementById('metrics');
    if (v.internal && window.WP_CONFIG) {
      const goal = WP_CONFIG.goalsFor(ev);
      const cs = confirmedItems.filter(isSpk).length, cv = confirmedItems.filter(i => !isSpk(i) && isVen(i)).length, cg = confirmedItems.length - cs - cv;
      const bar = (label, have, want) => {
        const pctv = Math.min(100, want ? Math.round(100 * have / want) : 0);
        return '<div class="goal' + (have >= want ? ' done' : '') + '"><div class="top"><span>' + label + ' <b>' + have + '</b><span class="g"> / ' + want + '</span></span><span class="g">' + pctv + '%</span></div><div class="bar"><div class="fill" style="width:' + pctv + '%"></div></div></div>';
      };
      gEl.innerHTML = bar('Speakers', cs, goal.speakers) + bar('Vendors', cv, goal.vendors) + bar('Guests', cg, goal.guests);
      const contacted = rowsForEvent.filter(r => SCORE.IN_MOTION.has(r.status)).length;
      const engaged = rowsForEvent.filter(r => ['ENGAGED', 'NEGOTIATIONS', 'CONFIRMED'].includes(r.status)).length;
      const rate = contacted ? Math.round(100 * engaged / contacted) : 0;
      mEl.innerHTML = '<span>Reply rate <b>' + rate + '%</b></span><span>Engaged <b>' + engaged + '</b></span><span>Declined <b>' + rowsForEvent.filter(r => r.status === 'DECLINED').length + '</b></span>';
    } else { gEl.innerHTML = ''; mEl.innerHTML = ''; }

    const defs = v.internal
      ? [['all', 'All contacts'], ['inprogress', 'In progress'], ['confirmed', 'Confirmed'], ['speakers', 'Speakers'], ['vendors', 'Vendors'], ['attendees', 'Attendees'], ['suggested', 'Suggested invites']]
      : [['all', 'All attendees'], ['confirmed', 'Confirmed'], ['inprogress', 'In motion']];
    if (v.internal && evTasks.length) defs.push(['checklist', 'Checklist']);
    if (!defs.some(([k]) => k === tab)) tab = defs[0][0];
    const cnt = k => k === 'confirmed' ? confirmedItems.length : k === 'checklist' ? evTasks.length : (B[k] || []).length;
    document.getElementById('tabs').innerHTML = defs.map(([k, l]) =>
      '<button class="' + (tab === k ? 'on' : '') + '" data-t="' + k + '">' + l + '<span class="cnt">' + cnt(k) + '</span></button>').join('');
    document.querySelectorAll('#tabs button').forEach(x => x.onclick = () => { tab = x.dataset.t; render(); });

    if (tab === 'checklist') {
      const doneN = taskList().filter(t => t.done).length;
      document.getElementById('listHead').innerHTML = '<div class="banner">Event checklist, pulled from the Notion TASK TRACKER. <b>' + doneN + '</b> of ' + evTasks.length + ' done. Grouped by countdown to event day. Check-offs save on this device for now.</div>';
      const g = document.getElementById('groups'); g.innerHTML = checklistHTML();
      g.querySelectorAll('.cbx[data-tid]').forEach(b => b.onclick = () => setTaskDone(b.dataset.tid, b.dataset.done !== '1'));
      g.querySelectorAll('.asg[data-tid]').forEach(s => s.onchange = () => setTaskAssignee(s.dataset.tid, s.value));
      return;
    }

    let items = (tab === 'confirmed' ? confirmedItems : (B[tab] || [])).slice();
    if (q) { const s = q.toLowerCase(); items = items.filter(i => [i.c.name, i.c.companyName, i.c.title, i.c.email].some(x => (x || '').toLowerCase().includes(s))); }
    const sf = document.getElementById('statusFilter').value;
    if (sf) items = items.filter(i => (i.status || 'TO CONTACT') === sf);
    const of = document.getElementById('ownerFilter').value;
    if (of) items = items.filter(i => (i.row && i.row.owner) === of);

    let head = '';
    if (tab === 'suggested' && v.internal) head = '<div class="banner">Curated from your database and people who came to similar past events. Showing ' + B.suggested.length + ' of ' + B.suggestedTotal + '. <a href="#" id="toggleAll" style="text-decoration:underline">' + (showAll ? 'show top matches only' : 'show all') + '</a></div>';
    else if (tab === 'vendors') head = '<div class="banner">Product partners: gifting suite, activations, food and drink.</div>';
    else if (tab === 'confirmed') {
      const sp = confirmedItems.filter(isSpk).length, ve = confirmedItems.filter(i => !isSpk(i) && isVen(i)).length, at = confirmedItems.length - sp - ve;
      head = '<div class="banner">Who is locked in: <b>' + confirmedItems.length + '</b> confirmed &middot; ' + sp + ' speakers &middot; ' + ve + ' vendors &middot; ' + at + ' guests. <a href="#" id="copyRoster" style="text-decoration:underline">Copy roster</a></div>';
    }
    else if (tab === 'all') head = '<div class="banner">Everyone for this event. Set each person\'s status with the dropdown.</div>';
    document.getElementById('listHead').innerHTML = head;
    document.getElementById('groups').innerHTML = renderList(items);

    const t = document.getElementById('toggleAll'); if (t) t.onclick = e => { e.preventDefault(); showAll = !showAll; render(); };
    const cr = document.getElementById('copyRoster'); if (cr) cr.onclick = e => { e.preventDefault(); copyRoster(confirmedItems); };
    document.querySelectorAll('.draftbtn').forEach(b => b.onclick = e => { e.stopPropagation(); const c = contactById[b.dataset.cid]; if (c) WP_DRAFT.open(c, ev, b.dataset.kind); });
    document.querySelectorAll('select.stsel').forEach(sel => sel.onchange = () => {
      const cid = sel.dataset.cid, pid = sel.dataset.pid, val = sel.value, nm = (contactById[cid] || {}).name;
      if (val === 'TO CONTACT') delete overrides[cid]; else overrides[cid] = val;
      if (notionMode) {
        WP_API.setStatus({ eventId: ev.id, contactId: cid, pipelineId: pid || undefined, status: val, name: nm }).then(ok => {
          if (ok && !pid) WP_API.getStatuses(ev.id).then(m => { if (m) { pidMap = {}; Object.entries(m).forEach(([c, v]) => pidMap[c] = v.pipelineId); } });
        });
      } else { saveOv(); }
      render();
    });
  };
  const sfEl = document.getElementById('statusFilter');
  sfEl.innerHTML = '<option value="">Any status</option>' + STATUS_OPTS.map(o => '<option>' + o + '</option>').join('');
  sfEl.onchange = render;
  const ownEl = document.getElementById('ownerFilter');
  const owners = [...new Set(pipeline.filter(r => r.eventId === ev.id && r.owner).map(r => r.owner))];
  ownEl.innerHTML = '<option value="">Any owner (my board)</option>' + owners.map(o => '<option>' + E(o) + '</option>').join('');
  ownEl.onchange = render;
  document.getElementById('search').oninput = e => { q = e.target.value; render(); };
  document.getElementById('includeUnknown').onchange = render;
  render();

  // if the Notion write path is live, load current shared statuses and use those instead of local marks
  if (window.WP_API) WP_API.getStatuses(ev.id).then(map => {
    if (!map) return;
    notionMode = true; overrides = {}; pidMap = {};
    Object.entries(map).forEach(([cid, v]) => { pidMap[cid] = v.pipelineId; if (v.status && v.status !== 'TO CONTACT') overrides[cid] = v.status; });
    document.getElementById('foot').textContent = 'Live shared board (saves to Notion). ' + (meta.lastSyncAt ? 'Data refreshed ' + new Date(meta.lastSyncAt).toLocaleString() : '');
    render();
  });
  document.getElementById('foot').textContent = meta.lastSyncAt ? 'Data refreshed ' + new Date(meta.lastSyncAt).toLocaleString() : '';
})();
