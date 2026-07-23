(async () => {
  const { contacts, events, pipeline, nearby, meta, eventById, contactById } = await HUB.load();
  const E = HUB.esc;
  const id = new URLSearchParams(location.search).get('e');
  const ev = eventById[id];
  if (!ev) {
    document.getElementById('title').textContent = 'Event not found';
    document.getElementById('sub').innerHTML = 'If you just added it in Notion, it appears after the next sync. <a href="index.html" style="text-decoration:underline">Back to events</a>';
    return;
  }
  document.title = ev.name + ' · Willpower Outreach HQ';
  document.getElementById('title').textContent = ev.name;
  const bits = [HUB.fmtDate(ev.date), HUB.countdown(ev.date), ev.locationRaw, ev.venue, ev.status].filter(Boolean).map(E);
  let links = '';
  if (ev.luma) links += ' &middot; <a href="' + E(ev.luma) + '" target="_blank" rel="noopener" style="text-decoration:underline">Luma</a>';
  if (ev.website) links += ' &middot; <a href="' + E(ev.website) + '" target="_blank" rel="noopener" style="text-decoration:underline">Website</a>';
  document.getElementById('sub').innerHTML = bits.join(' &middot; ') + links;

  document.getElementById('banners').innerHTML = ev.cityKey
    ? HUB.staleBanner(meta)
    : '<div class="banner warn">City "' + E(ev.locationRaw || 'unknown') + '" is not mapped yet, so recommendations show top contacts from all locations.</div>';

  const rowsForEvent = pipeline.filter(r => r.eventId === ev.id);
  const cnt = s => rowsForEvent.filter(r => s.includes(r.status)).length;
  const inMotion = rowsForEvent.filter(r => SCORE.IN_MOTION.has(r.status)).length;
  document.getElementById('summary').innerHTML =
    '<span><b>' + rowsForEvent.length + '</b> on the list</span>'
    + '<span><b>' + inMotion + '</b> in motion</span>'
    + '<span><b>' + cnt(['CONFIRMED']) + '</b> confirmed</span>'
    + '<span><b>' + rowsForEvent.filter(r => r.followUp && r.followUp.needed).length + '</b> need a follow-up</span>';

  // follow-up reminders
  const fu = rowsForEvent.filter(r => r.followUp && r.followUp.needed).sort((a, b) => (b.followUp.daysSince || 0) - (a.followUp.daysSince || 0));
  document.getElementById('followups').innerHTML = fu.length ? '<div class="panel flag"><h2>Follow-up reminders</h2>'
    + fu.slice(0, 12).map(r => {
        const c = contacts.find(x => x.id === r.contactId) || {};
        return '<div class="rowline"><span><b>' + E(c.name || r.name) + '</b> <span class="mut">' + E(c.companyName || '') + '</span></span>'
          + '<span><span class="st" data-s="' + E(r.status) + '">' + E(r.status) + '</span> <span class="mut">' + r.followUp.daysSince + 'd since last email, suggest ' + E(r.followUp.suggest || 'follow-up') + '</span> '
          + (c.email ? HUB.copyBtn(c.email) : '') + '</span></div>';
      }).join('') + '</div>' : '';

  // nearby
  const near = (nearby[ev.id] && nearby[ev.id].items) || [];
  document.getElementById('nearby').innerHTML = near.length
    ? '<div class="minilist">' + near.map(n => {
        const delta = ev.date && n.date ? Math.round((new Date(n.date) - new Date(ev.date)) / 86400000) : null;
        const chip = delta === null ? '' : delta === 0 ? 'same day' : delta > 0 ? delta + 'd after' : Math.abs(delta) + 'd before';
        return '<a class="minirow" href="' + E(n.url || '#') + '" target="_blank" rel="noopener">'
          + '<span class="d">' + E(HUB.fmtDate(n.date)) + '</span><span class="nm">' + E(n.name) + '</span>'
          + (chip ? '<span class="tag line">' + chip + '</span>' : '') + '<span class="loc">' + E(n.why || n.venue || '') + '</span></a>';
      }).join('') + '</div>'
    : '<div class="minilist"><div class="empty">Nothing found yet. The scan runs when the event is within 60 days.</div></div>';

  // tabs + table
  let tab = 'inprogress', page = 0, q = '';
  const PAGE = 100;
  const render = () => {
    const buckets = SCORE.recommend(contacts, pipeline, ev, eventById, { includeUnknown: document.getElementById('includeUnknown').checked });
    // inject pipeline rows that the scorer skipped (company-only vendors, contacts outside the loaded set)
    const shown = new Set();
    ['inprogress','speakers','vendors','cold'].forEach(k => buckets[k].forEach(i => i.c.id && shown.add(i.c.id)));
    rowsForEvent.forEach(r => {
      if (r.contactId && shown.has(r.contactId)) return;
      if (r.contactId && contactById[r.contactId] && (r.status === 'TO CONTACT' || !r.status)) return;
      const c = (r.contactId && contactById[r.contactId]) || { name: r.companyName || r.name || 'Unknown', companyName: r.companyName };
      const rank = SCORE.STATUS_RANK[r.status] ?? 0;
      const item = { c, row: r, status: r.status, rank, why: (Array.isArray(r.vendorType) ? r.vendorType : r.vendorType ? [r.vendorType] : [r.role]).filter(Boolean), vendorType: r.vendorType };
      const bk = r.role === 'Vendor' || r.role === 'Sponsor guest' ? 'vendors' : r.role === 'Speaker target' ? 'speakers' : 'cold';
      buckets[bk].push(item);
      if (SCORE.IN_MOTION.has(r.status)) buckets.inprogress.push(item);
    });
    ['inprogress','speakers','vendors','cold'].forEach(k => buckets[k].sort((a, b) => b.rank - a.rank || (b.score||0) - (a.score||0)));
    const defs = [
      ['inprogress', 'In progress'], ['speakers', 'Speakers'], ['vendors', 'Vendors'], ['cold', 'Cold Invite'], ['all', 'Full list'],
    ];
    if (!buckets.inprogress.length && tab === 'inprogress') tab = 'speakers';
    document.getElementById('tabs').innerHTML = defs.map(([k, l]) => {
      const n = k === 'all' ? rowsForEvent.length : buckets[k].length;
      return '<button class="' + (tab === k ? 'on' : '') + '" data-t="' + k + '">' + l + '<span class="cnt">' + n + '</span></button>';
    }).join('');
    document.querySelectorAll('#tabs button').forEach(x => x.onclick = () => { tab = x.dataset.t; page = 0; render(); });

    let items;
    if (tab === 'all') {
      items = rowsForEvent.map(r => ({ c: contacts.find(x => x.id === r.contactId) || { name: r.name }, row: r, status: r.status, why: [r.role, r.relationship].filter(Boolean), rank: SCORE.STATUS_RANK[r.status] ?? 0 }))
        .sort((a, b) => b.rank - a.rank);
    } else items = buckets[tab];

    if (q) { const s = q.toLowerCase(); items = items.filter(i => [i.c.name, i.c.companyName, i.c.title, i.c.email].some(v => (v || '').toLowerCase().includes(s))); }

    const slice = items.slice(page * PAGE, page * PAGE + PAGE);
    document.getElementById('rows').innerHTML = slice.length ? slice.map(i => {
      const c = i.c, st = i.status, why = (i.why || []).slice(0, 3).map(w => E(w)).join(' &middot; ');
      const vt = i.vendorType ? (Array.isArray(i.vendorType) ? i.vendorType : [i.vendorType]).join(', ') : '';
      return '<tr>'
        + '<td class="nm">' + E(c.name || '') + (c.linkedin ? ' <a class="li" href="' + E(c.linkedin) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">in</a>' : '') + '</td>'
        + '<td>' + E(c.companyName || '') + '</td>'
        + '<td class="mut">' + E(c.title || '') + '</td>'
        + '<td>' + (st ? '<span class="st" data-s="' + E(st) + '">' + E(st) + '</span>' : '<span class="st" data-s="NEW">not started</span>') + '</td>'
        + '<td>' + HUB.emailCell(c) + '</td>'
        + '<td class="reason">' + (vt ? E(vt) : why) + '</td>'
        + '</tr>';
    }).join('') : '<tr><td colspan="6" class="empty">No one here yet. Try another tab or the city toggle.</td></tr>';

    const pages = Math.ceil(items.length / PAGE);
    document.getElementById('pager').innerHTML = pages > 1
      ? '<button ' + (page === 0 ? 'disabled' : '') + ' id="pv">Prev</button><span class="pinfo">Page ' + (page + 1) + ' of ' + pages + ' &middot; ' + items.length + ' people</span><button ' + (page >= pages - 1 ? 'disabled' : '') + ' id="nx">Next</button>'
      : (items.length ? '<span class="pinfo">' + items.length + ' people</span>' : '');
    const pv = document.getElementById('pv'), nx = document.getElementById('nx');
    if (pv) pv.onclick = () => { page--; render(); };
    if (nx) nx.onclick = () => { page++; render(); };
  };
  document.getElementById('search').oninput = e => { q = e.target.value; page = 0; render(); };
  document.getElementById('includeUnknown').onchange = () => { page = 0; render(); };
  render();
  document.getElementById('foot').textContent = meta.lastSyncAt ? 'Data refreshed ' + new Date(meta.lastSyncAt).toLocaleString() : '';
})();
