(async () => {
  const { contacts, events, pipeline, nearby, meta, eventById } = await HUB.load();
  const E = HUB.esc;
  const id = new URLSearchParams(location.search).get('e');
  const ev = eventById[id];
  if (!ev) {
    document.getElementById('title').textContent = 'Event not found';
    document.getElementById('sub').innerHTML = 'This event is not in the data yet. If you just added it in Notion, it appears after the next sync. <a href="index.html">Back to events</a>';
    return;
  }

  document.title = ev.name + ' · Willpower Outreach HQ';
  document.getElementById('title').textContent = ev.name;
  const bits = [HUB.fmtDate(ev.date), HUB.countdown(ev.date), ev.locationRaw, ev.venue, ev.status].filter(Boolean).map(E);
  let links = '';
  if (ev.luma) links += ' <a href="' + E(ev.luma) + '" target="_blank" rel="noopener">Luma</a>';
  if (ev.website) links += ' <a href="' + E(ev.website) + '" target="_blank" rel="noopener">Website</a>';
  const labelChips = (ev.gmailLabels || []).map(l =>
    '<button class="copy" style="width:auto;padding:4px 8px;font-size:11px" data-copy="label:&quot;' + E(l) + '&quot;" onclick="HUB.copy(this,event)" title="Copy Gmail search">' + E(l) + '</button>').join(' ');
  document.getElementById('sub').innerHTML = bits.join(' &middot; ') + links + (labelChips ? '<br>Gmail labels: ' + labelChips : '');
  if (!ev.cityKey) {
    document.getElementById('banners').innerHTML = '<div class="banner warn">City "' + E(ev.locationRaw || 'unknown') + '" is not recognized yet, so recommendations show top contacts from all locations. Ask Claude to add it to the metro alias map.</div>';
  } else {
    document.getElementById('banners').innerHTML = HUB.staleBanner(meta);
  }

  const rowsForEvent = pipeline.filter(r => r.eventId === ev.id);
  const cnt = s => rowsForEvent.filter(r => s.includes(r.status)).length;
  document.getElementById('stats').innerHTML = [
    ['lav', rowsForEvent.length, 'In pipeline'],
    ['blue', cnt(['CONTACTED','1ST FOLLOW UP','2ND FOLLOW UP','3RD FOLLOW UP','FINAL REMINDER SENT']), 'Contacted'],
    ['green', cnt(['CONFIRMED']), 'Confirmed'],
    ['amber', rowsForEvent.filter(r => r.followUp && r.followUp.needed).length, 'Need follow-up'],
  ].map(([c, n, l]) => '<div class="stat ' + c + '"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>').join('');

  // follow-up panel
  const fu = rowsForEvent.filter(r => r.followUp && r.followUp.needed)
    .sort((a, b) => (b.followUp.daysSince || 0) - (a.followUp.daysSince || 0));
  if (fu.length) {
    document.getElementById('followups').innerHTML = '<div class="panel amberp"><h2>Follow-up reminders (' + fu.length + ')</h2>'
      + fu.slice(0, 15).map(r => {
        const c = contacts.find(x => x.id === r.contactId) || {};
        return '<div class="rowline"><span><b>' + E(c.name || r.name) + '</b> <span class="mut">' + E(c.companyName || '') + '</span></span>'
          + '<span><span class="pill" data-s="' + E(r.status) + '">' + E(r.status) + '</span> <span class="mut">' + r.followUp.daysSince + ' days since last email, suggest ' + E(r.followUp.suggest || 'a follow-up') + '</span> '
          + (c.email ? HUB.copyBtn(c.email) : '') + '</span></div>';
      }).join('') + '</div>';
  }

  // nearby events
  const near = (nearby[ev.id] && nearby[ev.id].items) || [];
  document.getElementById('nearby').innerHTML = '<div class="panel"><h2>Other events around ' + E(ev.cityKey || ev.locationRaw || 'this date') + '</h2>'
    + (near.length ? near.map(n => {
        const delta = ev.date && n.date ? Math.round((new Date(n.date) - new Date(ev.date)) / 86400000) : null;
        const chip = delta === null ? '' : delta === 0 ? 'same day' : delta > 0 ? delta + ' days after' : Math.abs(delta) + ' days before';
        return '<div class="rowline"><span><b>' + (n.url ? '<a href="' + E(n.url) + '" target="_blank" rel="noopener">' + E(n.name) + '</a>' : E(n.name)) + '</b> <span class="mut">' + E(n.venue || n.source || '') + '</span></span>'
          + '<span><span class="chip info">' + E(HUB.fmtDate(n.date)) + (chip ? ' &middot; ' + chip : '') + '</span> <span class="mut">' + E(n.why || '') + '</span></span></div>';
      }).join('')
      : '<div class="mut" style="font-size:13.5px">Nothing found yet. The scan runs when the event is within 60 days.</div>') + '</div>';

  // tabs + table
  let tab = 'speakers', page = 0, q = '';
  const PAGE = 100;
  const render = () => {
    const buckets = SCORE.recommend(contacts, pipeline, ev, eventById, { includeUnknown: document.getElementById('includeUnknown').checked });
    const tabs = [['speakers', 'Speakers'], ['vendors', 'Vendors'], ['cold', 'Cold Invite'], ['confirmed', 'Confirmed'], ['pipeline', 'Full Pipeline']];
    document.getElementById('tabs').innerHTML = tabs.map(([k, l]) => {
      const n = k === 'pipeline' ? rowsForEvent.length : buckets[k].length;
      return '<button class="' + (tab === k ? 'on' : '') + '" data-t="' + k + '">' + l + '<span class="cnt">' + n + '</span></button>';
    }).join('');
    document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => { tab = b.dataset.t; page = 0; render(); });

    let items;
    if (tab === 'pipeline') {
      items = rowsForEvent.map(r => ({ c: contacts.find(x => x.id === r.contactId) || { name: r.name }, row: r, why: [r.role, r.relationship].filter(Boolean), score: 0 }));
    } else items = buckets[tab];

    if (q) {
      const s = q.toLowerCase();
      items = items.filter(i => [i.c.name, i.c.companyName, i.c.title, i.c.email].some(v => (v || '').toLowerCase().includes(s)));
    }
    const start = page * PAGE, slice = items.slice(start, start + PAGE);
    document.getElementById('rows').innerHTML = slice.length ? slice.map(i => {
      const c = i.c, st = i.row ? i.row.status : null;
      return '<tr>'
        + '<td class="co">' + E(c.name || '') + '</td>'
        + '<td>' + E(c.companyName || '') + '</td>'
        + '<td class="mut">' + E(c.title || '') + '</td>'
        + '<td>' + HUB.liLink(c.linkedin) + '</td>'
        + '<td>' + HUB.emailCell(c) + '</td>'
        + '<td>' + (st ? '<span class="pill" data-s="' + E(st) + '">' + E(st) + '</span>' : '<span class="chip ghost">Not in pipeline yet</span>') + '</td>'
        + '<td>' + (i.why || []).slice(0, 3).map(w => '<span class="chip reason">' + E(w) + '</span>').join('') + '</td>'
        + '</tr>';
    }).join('') : '<tr><td colspan="7" class="empty">No one matches. Try the toggle above or another tab.</td></tr>';

    const pages = Math.ceil(items.length / PAGE);
    document.getElementById('pager').innerHTML = pages > 1
      ? '<button ' + (page === 0 ? 'disabled' : '') + ' id="pv">&larr; Prev</button><span class="pinfo">Page ' + (page + 1) + ' of ' + pages + ' (' + items.length + ' people)</span><button ' + (page >= pages - 1 ? 'disabled' : '') + ' id="nx">Next &rarr;</button>'
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
