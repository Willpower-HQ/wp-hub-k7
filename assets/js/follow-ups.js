(async () => {
  const { contacts, events, pipeline, meta, eventById, contactById } = await HUB.load();
  const E = HUB.esc;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const WAITING = new Set(['CONTACTED', 'INTERESTED', '1ST FOLLOW UP', '2ND FOLLOW UP', '3RD FOLLOW UP', 'FINAL REMINDER SENT', 'ENGAGED', 'NEGOTIATIONS']);
  const isUp = e => e.date && new Date(e.date + 'T23:59:00') >= today && e.status !== 'CANCELLED';
  const upEvents = events.filter(isUp);
  const upIds = new Set(upEvents.map(e => e.id));

  const daysSince = d => d ? Math.floor((today - new Date(d + 'T12:00:00')) / 86400000) : null;
  const rows = pipeline
    .filter(r => upIds.has(r.eventId) && WAITING.has(r.status) && r.contactId)
    .map(r => { const c = contactById[r.contactId] || { name: r.name }; return { r, c, e: eventById[r.eventId], ds: daysSince(c.lastContactDate) }; })
    .filter(x => x.e);
  // oldest contact first; unknown date treated as very old (needs attention)
  rows.sort((a, b) => (b.ds == null ? 99999 : b.ds) - (a.ds == null ? 99999 : a.ds));

  document.getElementById('summary').innerHTML =
    '<span><b>' + rows.length + '</b> waiting on a reply</span>'
    + '<span><b>' + rows.filter(x => x.ds != null && x.ds >= 7).length + '</b> a week or more overdue</span>'
    + '<span><b>' + upEvents.length + '</b> upcoming events</span>';

  if (!rows.length) {
    document.getElementById('body').innerHTML = '<div class="plist"><div class="empty">Nobody is waiting on a follow-up right now. Once outreach goes out and statuses move to Contacted, they show up here.</div></div>';
  } else {
    // group by event
    const byEvent = {};
    rows.forEach(x => { (byEvent[x.e.id] = byEvent[x.e.id] || { e: x.e, list: [] }).list.push(x); });
    const groups = Object.values(byEvent).sort((a, b) => a.e.date.localeCompare(b.e.date));
    const kind = x => (x.r.role === 'Speaker target' ? 'speaker' : (x.r.role === 'Vendor' || x.r.role === 'Sponsor guest' || x.r.vendorType) ? 'vendor' : 'invite');
    const age = ds => ds == null ? '<span class="mut">no contact date</span>' : ds === 0 ? 'today' : ds + 'd ago';
    const row = x => {
      const c = x.c;
      const draft = (c.id && c.email && c.emailStatus === 'ok') ? '<button class="draftbtn" data-cid="' + E(c.id) + '" data-eid="' + E(x.e.id) + '" data-kind="' + kind(x) + '">Draft</button>' : '';
      return '<div class="prow">'
        + '<div class="who"><div class="nm">' + E(c.name || '') + (c.linkedin ? ' <a class="li" href="' + E(c.linkedin) + '" target="_blank" rel="noopener">in</a>' : '') + '</div><div class="t">' + E([c.title, c.companyName].filter(Boolean).join(' &middot; ')) + '</div>'
        + (c.lastFeedback ? '<div class="why">' + E(String(c.lastFeedback).slice(0, 120)) + '</div>' : '') + '</div>'
        + '<div data-label="Last contact">' + age(x.ds) + '</div>'
        + '<div data-label="Status"><span class="st" data-s="' + E(x.r.status) + '">' + E(x.r.status) + '</span></div>'
        + '<div data-label="Next">' + (c.email ? '<span class="emailcell">' + HUB.copyBtn(c.email) + '</span>' : '') + draft + '</div>'
        + '</div>';
    };
    document.getElementById('body').innerHTML = groups.map(g =>
      '<div class="sectionrow"><h2>' + E(g.e.name) + ' <span style="color:var(--muted)">&middot; ' + E(HUB.fmtDate(g.e.date)) + '</span></h2><span class="note">' + g.list.length + ' waiting</span></div>'
      + '<div class="plist"><div class="phead-row"><span>Name</span><span>Last contact</span><span>Status</span><span>Next</span></div>' + g.list.map(row).join('') + '</div>'
    ).join('');
    document.querySelectorAll('.draftbtn').forEach(b => b.onclick = () => { const c = contactById[b.dataset.cid], e = eventById[b.dataset.eid]; if (c && e) WP_DRAFT.open(c, e, b.dataset.kind); });
  }
  document.getElementById('foot').textContent = meta.lastSyncAt ? 'Data refreshed ' + new Date(meta.lastSyncAt).toLocaleString() : '';
})();
