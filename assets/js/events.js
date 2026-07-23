(async () => {
  const { contacts, events, pipeline, nearby, meta } = await HUB.load();
  const E = HUB.esc;

  // banners
  let b = HUB.staleBanner(meta);
  if (meta.alerts && meta.alerts.length) {
    b += '<div class="banner info">Sync notes:<ul>' + meta.alerts.slice(0, 6).map(a => '<li>' + E(a.text || a) + '</li>').join('') + '</ul></div>';
  }
  document.getElementById('banners').innerHTML = b;

  // stats
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isUpcoming = e => e.date && new Date(e.date + 'T23:59:00') >= today && e.status !== 'CANCELLED';
  const upcoming = events.filter(isUpcoming).sort((a, b2) => a.date.localeCompare(b2.date));
  const past = events.filter(e => !isUpcoming(e)).sort((a, b2) => (b2.date || '').localeCompare(a.date || ''));
  const upIds = new Set(upcoming.map(e => e.id));
  const upRows = pipeline.filter(r => upIds.has(r.eventId));
  const confirmed = upRows.filter(r => r.status === 'CONFIRMED').length;
  const needsFu = upRows.filter(r => r.followUp && r.followUp.needed).length;

  document.getElementById('stats').innerHTML = [
    ['lav', upcoming.length, 'Upcoming events'],
    ['blue', contacts.length.toLocaleString(), 'Contacts in database'],
    ['green', confirmed, 'Confirmed (upcoming)'],
    ['amber', needsFu, 'Need a follow-up'],
  ].map(([cls, n, l]) => '<div class="stat ' + cls + '"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>').join('');

  const card = e => {
    const rows = pipeline.filter(r => r.eventId === e.id);
    const cnt = s => rows.filter(r => s.includes(r.status)).length;
    const near = (nearby[e.id] && nearby[e.id].items || []).length;
    const prog = rows.length
      ? '<div class="prog"><div><b>' + rows.length + '</b>targets</div><div><b>' + cnt(['CONTACTED','1ST FOLLOW UP','2ND FOLLOW UP','3RD FOLLOW UP','FINAL REMINDER SENT']) + '</b>contacted</div><div><b>' + cnt(['ENGAGED','NEGOTIATIONS']) + '</b>engaged</div><div><b>' + cnt(['CONFIRMED']) + '</b>confirmed</div></div>'
      : '<div class="prog"><div class="mut">No pipeline yet. Open for recommendations.</div></div>';
    return '<a class="card" href="event.html?e=' + encodeURIComponent(e.id) + '">'
      + '<span class="when">' + E(HUB.fmtDate(e.date)) + (isUpcoming(e) ? ' &middot; ' + E(HUB.countdown(e.date)) : '') + '</span>'
      + '<h3>' + E(e.name) + '</h3>'
      + '<div class="where">' + E(e.locationRaw || '') + (e.venue ? ' &middot; ' + E(e.venue) : '') + '</div>'
      + (e.cityKey ? '<span class="chip city">' + E(e.cityKey) + '</span>' : '')
      + (e.internal ? '<span class="chip cat">Willpower event</span>' : '<span class="chip ghost">External</span>')
      + (e.status ? '<span class="chip info">' + E(e.status) + '</span>' : '')
      + (near ? '<span class="chip warn">' + near + ' nearby events</span>' : '')
      + prog + '</a>';
  };

  document.getElementById('upcoming').innerHTML = upcoming.length ? upcoming.map(card).join('') : '<div class="empty">No upcoming events. Add one with the button above.</div>';
  document.getElementById('past').innerHTML = past.length ? past.slice(0, 12).map(card).join('') : '<div class="empty">Nothing yet.</div>';
  document.getElementById('foot').textContent = meta.lastSyncAt ? 'Data refreshed ' + new Date(meta.lastSyncAt).toLocaleString() : '';
})();
