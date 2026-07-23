(async () => {
  const { contacts, events, pipeline, nearby, meta, eventById, contactById } = await HUB.load();
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
    if (tab === 'suggested') return (it.why || []).slice(0, 2).map(E).join(' &middot; ');
    const r = it.row || {}, parts = [];
    const vt = it.vendorType ? (Array.isArray(it.vendorType) ? it.vendorType : [it.vendorType]) : null;
    if (vt) parts.push(...vt);
    if (r.product) parts.push(r.product);
    if (r.logistics) parts.push(r.logistics);
    if (parts.length) return parts.map(E).join(' &middot; ');
    if (r.speakerAngle) return E(r.speakerAngle);
    if (r.relationship) return E(r.relationship);
    return '';
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
    const defs = v.internal
      ? [['all', 'All contacts'], ['inprogress', 'In progress'], ['confirmed', 'Confirmed'], ['speakers', 'Speakers'], ['vendors', 'Vendors'], ['attendees', 'Attendees'], ['suggested', 'Suggested invites']]
      : [['all', 'All attendees'], ['confirmed', 'Confirmed'], ['inprogress', 'In motion']];
    if (!defs.some(([k]) => k === tab)) tab = defs[0][0];
    const cnt = k => k === 'confirmed' ? confirmedItems.length : (B[k] || []).length;
    document.getElementById('tabs').innerHTML = defs.map(([k, l]) =>
      '<button class="' + (tab === k ? 'on' : '') + '" data-t="' + k + '">' + l + '<span class="cnt">' + cnt(k) + '</span></button>').join('');
    document.querySelectorAll('#tabs button').forEach(x => x.onclick = () => { tab = x.dataset.t; render(); });

    let items = (tab === 'confirmed' ? confirmedItems : (B[tab] || [])).slice();
    if (q) { const s = q.toLowerCase(); items = items.filter(i => [i.c.name, i.c.companyName, i.c.title, i.c.email].some(x => (x || '').toLowerCase().includes(s))); }
    const sf = document.getElementById('statusFilter').value;
    if (sf) items = items.filter(i => (i.status || 'TO CONTACT') === sf);

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
