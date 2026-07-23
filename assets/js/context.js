let closeDrawer = () => {};
(async () => {
  const { contacts, events, pipeline, nearby, meta, eventById, contactById } = await HUB.load();
  const E = HUB.esc;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const bounced = contacts.filter(c => c.emailStatus === 'bounced');
  const leftco = contacts.filter(c => c.flags && c.flags.leftCompany);
  const dupeMap = {};
  contacts.forEach(c => { if (c.flags && c.flags.possibleDuplicateOf) { const k = (c.email || c.bouncedEmail || c.id); (dupeMap[k] = dupeMap[k] || []).push(c); } });
  // include the original each dupe points to
  contacts.forEach(c => { if (c.flags && c.flags.possibleDuplicateOf) { const orig = contactById[c.flags.possibleDuplicateOf]; if (orig) { const k = (orig.email || orig.id); (dupeMap[k] = dupeMap[k] || []); if (!dupeMap[k].includes(orig)) dupeMap[k].unshift(orig); } } });
  const dupeGroups = Object.values(dupeMap).filter(g => g.length > 1);

  const isUp = e => e.date && new Date(e.date + 'T23:59:00') >= today && e.status !== 'CANCELLED';
  const upcoming = events.filter(isUp).sort((a, b) => a.date.localeCompare(b.date));
  const past = events.filter(e => !isUp(e)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const nearItems = [];
  Object.entries(nearby).forEach(([eid, blk]) => (blk.items || []).forEach(n => nearItems.push(Object.assign({ host: (eventById[eid] || {}).name }, n))));

  document.getElementById('summary').innerHTML =
    '<span><b>' + bounced.length + '</b> bounced</span>'
    + '<span><b>' + dupeGroups.length + '</b> duplicate sets</span>'
    + '<span><b>' + leftco.length + '</b> possible job changes</span>'
    + '<span><b>' + upcoming.length + '</b> upcoming</span>'
    + '<span><b>' + nearItems.length + '</b> events near us</span>';

  const tabs = [
    ['bounced', 'Bounced emails', bounced.length],
    ['dupes', 'Duplicates', dupeGroups.length],
    ['left', 'Job changes', leftco.length],
    ['upcoming', 'Upcoming events', upcoming.length],
    ['past', 'Past events', past.length],
    ['near', 'Events near us', nearItems.length],
  ];
  let tab = 'bounced';

  const contactRow = c => '<div class="minirow click" data-id="' + E(c.id) + '" style="cursor:pointer">'
    + '<span class="nm">' + E(c.name || '') + '</span>'
    + '<span class="loc">' + E(c.companyName || '') + '</span>'
    + (c.emailStatus === 'bounced' ? '<span class="st" data-s="BOUNCED EMAIL">' + E(c.bouncedEmail || 'bounced') + '</span>' : c.email ? '<span class="emailcell">' + E(c.email) + '</span>' : '')
    + '</div>';

  const eventRow = e => {
    const rows = pipeline.filter(r => r.eventId === e.id);
    const conf = rows.filter(r => r.status === 'CONFIRMED').length;
    return '<a class="minirow" href="event.html?e=' + encodeURIComponent(e.id) + '">'
      + '<span class="d">' + E(HUB.fmtDate(e.date)) + '</span>'
      + '<span class="nm">' + E(e.name) + '</span>'
      + (e.cityKey ? '<span class="tag city">' + E(e.cityKey) + '</span>' : '')
      + '<span class="tag ' + (e.internal ? 'line' : 'ext') + '">' + (e.internal ? 'Willpower' : 'external') + '</span>'
      + '<span class="loc">' + (rows.length ? rows.length + ' on list, ' + conf + ' confirmed' : 'no list yet') + '</span></a>';
  };

  const render = () => {
    document.getElementById('tabs').innerHTML = tabs.map(([k, l, n]) =>
      '<button class="' + (tab === k ? 'on' : '') + '" data-t="' + k + '">' + l + '<span class="cnt">' + n + '</span></button>').join('');
    document.querySelectorAll('#tabs button').forEach(x => x.onclick = () => { tab = x.dataset.t; render(); });
    const b = document.getElementById('body');
    if (tab === 'bounced') b.innerHTML = intro('These addresses bounced. The email is cleared in Notion and the person kept. Find their new address on LinkedIn, then update Notion.') + list(bounced.length ? bounced.map(contactRow).join('') : empty('No bounced emails.'));
    else if (tab === 'dupes') b.innerHTML = intro('These people share an email with another row. Merge them in Notion.') + (dupeGroups.length ? dupeGroups.map(g => '<div class="panel"><h2>' + E(g[0].email || 'shared email') + '</h2>' + g.map(contactRow).join('') + '</div>').join('') : list(empty('No duplicates detected.')));
    else if (tab === 'left') b.innerHTML = intro('Auto-reply or notes suggest these people may have left their company. Verify on LinkedIn.') + list(leftco.length ? leftco.map(contactRow).join('') : empty('No flagged job changes.'));
    else if (tab === 'upcoming') b.innerHTML = list(upcoming.map(eventRow).join(''));
    else if (tab === 'past') b.innerHTML = list(past.map(eventRow).join(''));
    else if (tab === 'near') b.innerHTML = intro('Other events happening around our event dates, for scouting or for Bill to attend. See them on the map in City Scout.') + list(nearItems.length ? nearItems.map(n =>
      '<a class="minirow" href="' + E(n.url || '#') + '" target="_blank" rel="noopener"><span class="d">' + E(HUB.fmtDate(n.date)) + '</span><span class="nm">' + E(n.name) + '</span><span class="loc">' + E([n.city, n.why].filter(Boolean).join(' &middot; ')) + '</span></a>').join('') : empty('None found yet.'));
    document.querySelectorAll('.minirow.click').forEach(r => r.onclick = () => openDrawer(r.dataset.id));
  };
  const intro = t => '<div class="banner">' + t + '</div>';
  const list = inner => '<div class="minilist" style="margin-top:16px">' + inner + '</div>';
  const empty = t => '<div class="empty">' + t + '</div>';
  render();
  document.getElementById('foot').textContent = meta.lastSyncAt ? 'Data refreshed ' + new Date(meta.lastSyncAt).toLocaleString() : '';

  // drawer (reused, lighter)
  const drawer = document.getElementById('drawer'), overlay = document.getElementById('overlay');
  closeDrawer = () => { drawer.classList.remove('open'); overlay.classList.remove('open'); };
  function openDrawer(cid) {
    const c = contactById[cid]; if (!c) return;
    const field = (k, v) => v ? '<div class="field"><div class="k">' + k + '</div>' + v + '</div>' : '';
    drawer.innerHTML = '<button class="close" onclick="closeDrawer()">Close</button>'
      + '<h2>' + E(c.name || '') + '</h2><div class="role">' + E([c.title, c.companyName].filter(Boolean).join(' at ')) + '</div>'
      + field('Email', c.emailStatus === 'bounced' ? '<span class="st" data-s="BOUNCED EMAIL">bounced</span> <span class="mut">' + E(c.bouncedEmail || '') + '</span>' : c.email ? '<span class="emailcell">' + E(c.email) + ' ' + HUB.copyBtn(c.email) + '</span>' : '<span class="mut">none</span>')
      + field('LinkedIn', c.linkedin ? '<a href="' + E(c.linkedin) + '" target="_blank" rel="noopener" style="text-decoration:underline">' + E(c.linkedin.replace(/^https?:\/\//, '')) + '</a>' : '')
      + field('Notes', E(c.notes)) + field('Last feedback', E(c.lastFeedback))
      + '<div style="margin-top:20px"><a href="' + HUB.notionUrl(c.id) + '" target="_blank" rel="noopener"><button class="primary">Open in Notion</button></a></div>';
    drawer.classList.add('open'); overlay.classList.add('open');
  }
})();
