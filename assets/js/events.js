(async () => {
  const { contacts, events, pipeline, nearby, meta } = await HUB.load();
  const E = HUB.esc;

  let b = HUB.staleBanner(meta);
  if (meta.alerts && meta.alerts.length) {
    b += '<div class="banner">' + meta.alerts.slice(0, 5).map(a => E(a.text || a)).join('<br>') + '</div>';
  }
  document.getElementById('banners').innerHTML = b;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isUpcoming = e => e.date && new Date(e.date + 'T23:59:00') >= today && e.status !== 'CANCELLED';
  const rowsByEvent = {};
  pipeline.forEach(r => { (rowsByEvent[r.eventId] = rowsByEvent[r.eventId] || []).push(r); });

  const upcoming = events.filter(isUpcoming).sort((a, c) => a.date.localeCompare(c.date));
  const past = events.filter(e => !isUpcoming(e) && e.internal).sort((a, c) => (c.date || '').localeCompare(a.date || ''));
  const wp = upcoming.filter(e => e.internal);
  const ext = upcoming.filter(e => !e.internal);

  document.getElementById('wpcount').textContent = wp.length + (wp.length === 1 ? ' event' : ' events');

  const bigCard = e => {
    const rows = rowsByEvent[e.id] || [];
    const c = s => rows.filter(r => s.includes(r.status)).length;
    const near = (nearby[e.id] && nearby[e.id].items || []).length;
    const contacted = c(['CONTACTED','1ST FOLLOW UP','2ND FOLLOW UP','3RD FOLLOW UP','FINAL REMINDER SENT','ENGAGED','NEGOTIATIONS']);
    const conf = c(['CONFIRMED']);
    const cell = (n, l) => '<div><b class="' + (n ? '' : 'zero') + '">' + n + '</b>' + l + '</div>';
    return '<a class="ecard" href="event.html?e=' + encodeURIComponent(e.id) + '">'
      + '<div class="date">' + E(HUB.fmtDate(e.date)) + ' &middot; ' + E(HUB.countdown(e.date)) + '</div>'
      + '<h3>' + E(e.name) + '</h3>'
      + '<div class="where">' + [e.locationRaw, e.venue].filter(Boolean).map(E).join(' &middot; ') + '</div>'
      + '<div class="meta">' + (e.cityKey ? '<span class="tag city">' + E(e.cityKey) + '</span>' : '')
      + (e.status ? '<span class="tag line">' + E(e.status) + '</span>' : '')
      + (near ? '<span class="tag line">' + near + ' nearby</span>' : '') + '</div>'
      + (rows.length
        ? '<div class="prog">' + cell(rows.length, 'targets') + cell(contacted, 'in motion') + cell(conf, 'confirmed') + '</div>'
        : '<div class="prog"><div class="mut">No list yet. Open for recommendations.</div></div>')
      + '</a>';
  };

  const miniRow = e => '<a class="minirow" href="event.html?e=' + encodeURIComponent(e.id) + '">'
    + '<span class="d">' + E(HUB.fmtDate(e.date)) + '</span>'
    + '<span class="nm">' + E(e.name) + '</span>'
    + (e.cityKey ? '<span class="tag city">' + E(e.cityKey) + '</span>' : '')
    + '<span class="loc">' + E(e.locationRaw || '') + '</span></a>';

  document.getElementById('wpEvents').innerHTML = wp.length ? wp.map(bigCard).join('') : '<div class="empty">No upcoming Willpower events. Add one above.</div>';
  document.getElementById('extEvents').innerHTML = ext.length ? ext.map(miniRow).join('') : '<div class="empty">None tracked right now.</div>';
  document.getElementById('pastEvents').innerHTML = past.length ? past.slice(0, 10).map(miniRow).join('') : '<div class="empty">Nothing yet.</div>';
  document.getElementById('foot').textContent = meta.lastSyncAt ? 'Data refreshed ' + new Date(meta.lastSyncAt).toLocaleString() : '';
})();
