(async () => {
  const { contacts, events, pipeline, nearby, meta, tasksByEvent } = await HUB.load();
  const E = HUB.esc;

  let b = HUB.staleBanner(meta);
  if (meta.alerts && meta.alerts.length) {
    b += '<div class="banner">' + meta.alerts.slice(0, 5).map(a => E(a.text || a)).join('<br>') + '</div>';
  }
  document.getElementById('banners').innerHTML = b;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isUpcoming = e => e.date && new Date(e.date + 'T23:59:00') >= today && e.status !== 'CANCELLED';
  const WAITING = new Set(['CONTACTED', 'INTERESTED', '1ST FOLLOW UP', '2ND FOLLOW UP', '3RD FOLLOW UP', 'FINAL REMINDER SENT', 'ENGAGED', 'NEGOTIATIONS']);
  const rowsByEvent = {};
  pipeline.forEach(r => { (rowsByEvent[r.eventId] = rowsByEvent[r.eventId] || []).push(r); });

  const upcoming = events.filter(isUpcoming).sort((a, c) => a.date.localeCompare(c.date));
  const past = events.filter(e => !isUpcoming(e) && e.internal).sort((a, c) => (c.date || '').localeCompare(a.date || ''));
  const wp = upcoming.filter(e => e.internal);
  const ext = upcoming.filter(e => !e.internal);

  document.getElementById('wpcount').textContent = wp.length + (wp.length === 1 ? ' event' : ' events');

  // ---- task progress per event (mirrors the Calendar page's local check-off state) ----
  const taskState = eid => { try { return JSON.parse(localStorage.getItem('wp_tasks_' + eid) || '{}'); } catch (e) { return {}; } };
  const taskStats = e => {
    const list = (tasksByEvent && tasksByEvent[e.id]) || [];
    if (!list.length) return null;
    const nd = (taskState(e.id).ndone) || {};
    let done = 0, overdue = 0, soon = 0;
    list.forEach(t => {
      const isDone = ('n' + t.id in nd) ? !!nd['n' + t.id] : t.status === 'COMPLETED';
      if (isDone) { done++; return; }
      if (t.due) { const diff = Math.round((new Date(t.due + 'T12:00:00') - today) / 86400000); if (diff < 0) overdue++; else if (diff <= 7) soon++; }
    });
    return { total: list.length, done, overdue, soon };
  };
  const followUpsFor = e => (rowsByEvent[e.id] || []).filter(r => WAITING.has(r.status) && r.contactId).length;

  // ---- attention band: what needs eyes across all upcoming Willpower events ----
  const next = wp[0];
  let openFU = 0, dueSoon = 0, overdue = 0;
  wp.forEach(e => {
    openFU += followUpsFor(e);
    const ts = taskStats(e);
    if (ts) { dueSoon += ts.soon; overdue += ts.overdue; }
  });
  const tile = (href, label, val, sub, tone) => '<a class="stat' + (tone ? ' ' + tone : '') + '" href="' + href + '">'
    + '<div class="lab">' + label + '</div><div class="val">' + val + '</div><div class="sub">' + sub + '</div></a>';
  const tiles = [];
  if (next) tiles.push(tile('event.html?e=' + encodeURIComponent(next.id), 'Next event', E(HUB.countdown(next.date)), E(next.name), ''));
  tiles.push(tile('follow-ups.html', 'Open follow-ups', String(openFU), openFU ? 'waiting on a reply' : 'all clear', openFU ? 'warn' : ''));
  tiles.push(tile('calendar.html', 'Tasks due this week', String(dueSoon), 'next 7 days', dueSoon ? '' : ''));
  tiles.push(tile('calendar.html', 'Overdue tasks', String(overdue), overdue ? 'past their due date' : 'nothing overdue', overdue ? 'bad' : ''));
  document.getElementById('attention').innerHTML = wp.length ? '<div class="hero-stats">' + tiles.join('') + '</div>' : '';

  // ---- "Up next": the actual overdue + due-soon tasks across all upcoming events ----
  const PR = { Critical: 0, High: 1, Medium: 2 };
  const actions = [];
  wp.forEach(e => {
    const list = (tasksByEvent && tasksByEvent[e.id]) || [];
    if (!list.length) return;
    const nd = (taskState(e.id).ndone) || {};
    list.forEach(t => {
      const isDone = ('n' + t.id in nd) ? !!nd['n' + t.id] : t.status === 'COMPLETED';
      if (isDone || !t.due) return;
      const diff = Math.round((new Date(t.due + 'T12:00:00') - today) / 86400000);
      if (diff <= 7) actions.push({ e, t, diff });
    });
  });
  actions.sort((a, c) => a.diff - c.diff || (PR[a.t.priority] == null ? 3 : PR[a.t.priority]) - (PR[c.t.priority] == null ? 3 : PR[c.t.priority]));
  const rel = d => d === 0 ? 'today' : d > 0 ? 'in ' + d + 'd' : Math.abs(d) + 'd ago';
  const pchip = t => t.priority ? '<span class="pchip ' + E(t.priority.toLowerCase()) + '">' + E(t.priority) + '</span>' : '';
  const unRow = a => '<a class="unrow" href="event.html?e=' + encodeURIComponent(a.e.id) + '&tab=checklist">'
    + '<span class="due ' + (a.diff < 0 ? 'over' : 'soon') + '">' + E(HUB.fmtDate(a.t.due)) + ' &middot; ' + rel(a.diff) + '</span>'
    + '<span class="nm">' + E(a.t.title) + '</span>' + pchip(a.t)
    + '<span class="ev">' + E(a.e.name) + '</span></a>';
  if (actions.length) {
    const shown = actions.slice(0, 6);
    const more = actions.length - shown.length;
    document.getElementById('upnext').innerHTML =
      '<div class="sectionrow"><h2>Up next</h2><span class="note">overdue and due in the next 7 days</span></div>'
      + '<div class="upnext-list">' + shown.map(unRow).join('')
      + (more > 0 ? '<a class="unrow more" href="calendar.html"><span class="nm">+ ' + more + ' more on the calendar</span></a>' : '') + '</div>';
  } else {
    document.getElementById('upnext').innerHTML = '';
  }

  const pct = (n, total) => total ? (100 * n / total).toFixed(1) + '%' : '0%';
  const bigCard = e => {
    const rows = rowsByEvent[e.id] || [];
    const c = s => rows.filter(r => s.includes(r.status)).length;
    const near = (nearby[e.id] && nearby[e.id].items || []).length;
    const conf = c(['CONFIRMED']);
    const motion = rows.filter(r => WAITING.has(r.status)).length;
    const notyet = Math.max(0, rows.length - conf - motion);
    const ts = taskStats(e);
    const bar = rows.length
      ? '<div class="track"><div class="seg-c" style="width:' + pct(conf, rows.length) + '"></div><div class="seg-m" style="width:' + pct(motion, rows.length) + '"></div><div class="seg-s" style="width:' + pct(notyet, rows.length) + '"></div></div>'
      : '';
    const stats = rows.length
      ? '<div class="cstats"><span><b>' + conf + '</b> confirmed</span><span><b>' + motion + '</b> in motion</span><span><b>' + rows.length + '</b> targets</span>'
        + (ts ? '<span class="tk"><b>' + ts.done + '/' + ts.total + '</b> tasks' + (ts.overdue ? ' <span class="over">' + ts.overdue + ' overdue</span>' : '') + '</span>' : '')
        + '</div>'
      : '<div class="cstats"><span class="mut">No list yet. Open for recommendations.</span>'
        + (ts ? '<span class="tk"><b>' + ts.done + '/' + ts.total + '</b> tasks' + (ts.overdue ? ' <span class="over">' + ts.overdue + ' overdue</span>' : '') + '</span>' : '') + '</div>';
    return '<a class="ecard" href="event.html?e=' + encodeURIComponent(e.id) + '">'
      + '<div class="date">' + E(HUB.fmtDate(e.date)) + ' &middot; ' + E(HUB.countdown(e.date)) + '</div>'
      + '<h3>' + E(e.name) + '</h3>'
      + '<div class="where">' + [e.locationRaw, e.venue].filter(Boolean).map(E).join(' &middot; ') + '</div>'
      + '<div class="meta">' + (e.cityKey ? '<span class="tag city">' + E(e.cityKey) + '</span>' : '')
      + (e.status ? '<span class="tag line">' + E(e.status) + '</span>' : '')
      + (near ? '<span class="tag line">' + near + ' nearby</span>' : '') + '</div>'
      + '<div class="ecard-foot">' + bar + stats + '</div>'
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
