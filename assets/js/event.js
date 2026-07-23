(async () => {
  const { contacts, events, pipeline, nearby, meta, eventById } = await HUB.load();
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

  let showAll = false, tab = 'inprogress', q = '';
  const build = () => SCORE.buildEventView(contacts, pipeline, ev, eventById, events, { includeUnknown: document.getElementById('includeUnknown').checked, showAllSuggested: showAll });

  // banners
  let banner = '';
  if (!ev.internal) banner = '<div class="banner">External event. This list is people confirmed as attending, not our database. '
    + (ev.luma ? 'Signups from the <a href="' + E(ev.luma) + '" target="_blank" rel="noopener" style="text-decoration:underline">Luma</a> are added on each sync.' : 'Add the event\'s Luma link in Notion so signups flow in.') + '</div>';
  else if (!ev.cityKey) banner = '<div class="banner warn">City "' + E(ev.locationRaw || 'unknown') + '" is not mapped yet, so suggestions use top contacts from all locations.</div>';
  else banner += HUB.staleBanner(meta);
  document.getElementById('banners').innerHTML = banner;

  const view0 = build();
  const rowsForEvent = view0.eventRows;
  const cnt = s => rowsForEvent.filter(r => s.includes(r.status)).length;
  const inMotion = rowsForEvent.filter(r => SCORE.IN_MOTION.has(r.status)).length;
  document.getElementById('summary').innerHTML =
    '<span><b>' + rowsForEvent.length + '</b> on the list</span>'
    + '<span><b>' + inMotion + '</b> in motion</span>'
    + '<span><b>' + cnt(['CONFIRMED']) + '</b> confirmed</span>'
    + (ev.internal ? '<span><b>' + rowsForEvent.filter(r => r.followUp && r.followUp.needed).length + '</b> need a follow-up</span>' : '')
    + (view0.similarPast.length ? '<span>similar to ' + view0.similarPast.slice(0, 2).map(E).join(', ') + '</span>' : '');

  // follow-ups
  const fu = rowsForEvent.filter(r => r.followUp && r.followUp.needed).sort((a, b) => (b.followUp.daysSince || 0) - (a.followUp.daysSince || 0));
  document.getElementById('followups').innerHTML = fu.length ? '<div class="panel flag"><h2>Follow-up reminders</h2>'
    + fu.slice(0, 12).map(r => {
        const c = contacts.find(x => x.id === r.contactId) || {};
        return '<div class="rowline"><span><b>' + E(c.name || r.name) + '</b> <span class="mut">' + E(c.companyName || '') + '</span></span>'
          + '<span><span class="st" data-s="' + E(r.status) + '">' + E(r.status) + '</span> <span class="mut">' + r.followUp.daysSince + 'd since last email</span> '
          + (c.email ? HUB.copyBtn(c.email) : '') + '</span></div>';
      }).join('') + '</div>' : '';

  // nearby
  const near = (nearby[ev.id] && nearby[ev.id].items) || [];
  document.getElementById('nearby').innerHTML = near.length
    ? '<div class="minilist">' + near.map(n => {
        const delta = ev.date && n.date ? Math.round((new Date(n.date) - new Date(ev.date)) / 86400000) : null;
        const chip = delta === null ? '' : delta === 0 ? 'same day' : delta > 0 ? delta + 'd after' : Math.abs(delta) + 'd before';
        return '<a class="minirow" href="' + E(n.url || '#') + '" target="_blank" rel="noopener"><span class="d">' + E(HUB.fmtDate(n.date)) + '</span><span class="nm">' + E(n.name) + '</span>' + (chip ? '<span class="tag line">' + chip + '</span>' : '') + '<span class="loc">' + E(n.why || n.venue || '') + '</span></a>';
      }).join('') + '</div>'
    : '<div class="minilist"><div class="empty">Nothing found yet. The scan runs when the event is within 60 days.</div></div>';

  const row = it => {
    const c = it.c, st = it.status, why = (it.why || []).slice(0, 3).map(E).join(' &middot; ');
    return '<tr>'
      + '<td class="nm">' + E(c.name || '') + (c.linkedin ? ' <a class="li" href="' + E(c.linkedin) + '" target="_blank" rel="noopener">in</a>' : '') + '</td>'
      + '<td class="mut">' + E(c.title || '') + '</td>'
      + '<td>' + (st ? '<span class="st" data-s="' + E(st) + '">' + E(st) + '</span>' : '<span class="st" data-s="NEW">suggested</span>') + '</td>'
      + '<td>' + HUB.emailCell(c) + '</td>'
      + '<td class="reason">' + why + '</td>'
      + '</tr>';
  };
  const grouped = items => {
    if (!items.length) return '<tr><td colspan="5" class="empty">No one here yet.</td></tr>';
    return SCORE.groupByCompany(items).map(g =>
      '<tr class="groupdiv"><td colspan="5">' + E(g.company) + ' <span style="opacity:.7">(' + g.size + ')</span></td></tr>'
      + g.items.map(row).join('')).join('');
  };

  const render = () => {
    const v = build();
    const B = v.buckets;
    const defs = v.internal
      ? [['inprogress', 'In progress'], ['speakers', 'Speakers'], ['vendors', 'Vendors (product)'], ['attendees', 'Attendees'], ['suggested', 'Suggested invites']]
      : [['attendees', 'Attendees'], ['inprogress', 'Confirmed / in motion']];
    if (!defs.some(([k]) => k === tab)) tab = defs[0][0];
    document.getElementById('tabs').innerHTML = defs.map(([k, l]) => {
      const n = B[k].length;
      return '<button class="' + (tab === k ? 'on' : '') + '" data-t="' + k + '">' + l + '<span class="cnt">' + n + '</span></button>';
    }).join('');
    document.querySelectorAll('#tabs button').forEach(x => x.onclick = () => { tab = x.dataset.t; render(); });

    let items = B[tab] || [];
    if (q) { const s = q.toLowerCase(); items = items.filter(i => [i.c.name, i.c.companyName, i.c.title, i.c.email].some(x => (x || '').toLowerCase().includes(s))); }

    let head = '';
    if (tab === 'suggested' && v.internal) {
      head = '<div class="banner">Curated from your database and people who were on similar past events. Showing ' + B.suggested.length + ' of ' + B.suggestedTotal
        + '. <a href="#" id="toggleAll" style="text-decoration:underline">' + (showAll ? 'show top matches only' : 'show all') + '</a></div>';
    }
    document.getElementById('listHead').innerHTML = head;
    document.getElementById('rows').innerHTML = grouped(items);
    const t = document.getElementById('toggleAll');
    if (t) t.onclick = e => { e.preventDefault(); showAll = !showAll; render(); };
  };
  document.getElementById('search').oninput = e => { q = e.target.value; render(); };
  document.getElementById('includeUnknown').onchange = render;
  render();
  document.getElementById('foot').textContent = meta.lastSyncAt ? 'Data refreshed ' + new Date(meta.lastSyncAt).toLocaleString() : '';
})();
