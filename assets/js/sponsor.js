(async () => {
  const { pipeline, meta, eventById, contactById } = await HUB.load();
  const E = HUB.esc;
  const id = new URLSearchParams(location.search).get('e');
  const ev = eventById[id];
  if (!ev) { document.getElementById('hero').innerHTML = '<h1>Event not found</h1>'; return; }
  document.title = 'The Room · ' + ev.name;

  const confirmed = pipeline.filter(r => r.eventId === ev.id && r.status === 'CONFIRMED')
    .map(r => ({ r, c: contactById[r.contactId] || { name: r.name, companyName: r.companyName } }));
  const isSpk = x => x.r.role === 'Speaker target' || (x.c.category || []).some(y => /SPEAKER/i.test(y));
  const isVen = x => x.r.role === 'Vendor' || x.r.role === 'Sponsor guest' || x.r.vendorType;
  const speakers = confirmed.filter(isSpk);
  const vendors = confirmed.filter(x => !isSpk(x) && isVen(x));
  const guests = confirmed.filter(x => !isSpk(x) && !isVen(x));
  const companies = [...new Set(confirmed.map(x => x.c.companyName).filter(Boolean))];

  document.getElementById('hero').innerHTML =
    '<div class="ehero"><div class="kicker">The Room</div><h1>' + E(ev.name) + '</h1>'
    + '<div class="facts"><span class="f"><span class="dot">Date</span> <b>' + E(HUB.fmtDate(ev.date)) + '</b></span>'
    + (ev.venue || ev.locationRaw ? '<span class="f"><span class="dot">Where</span> <b>' + E(ev.venue || ev.locationRaw) + '</b></span>' : '')
    + '<span class="f"><span class="dot">Confirmed</span> <b>' + confirmed.length + '</b></span>'
    + '<span class="f"><span class="dot">Brands</span> <b>' + companies.length + '</b></span></div>'
    + '<div class="sub" style="margin-top:14px">A curated room of founders and operators across wellness, performance and CPG.</div></div>';

  const nameLine = x => '<div class="prow"><div class="who"><div class="nm">' + E(x.c.name || '') + '</div><div class="t">' + E([x.c.title, x.c.companyName].filter(Boolean).join(', ')) + '</div>'
    + (x.r.product ? '<div class="why">' + E(x.r.product) + '</div>' : '') + '</div></div>';
  const section = (title, arr) => arr.length
    ? '<div class="sectionrow"><h2>' + title + '</h2><span class="note">' + arr.length + '</span></div><div class="plist">' + arr.map(nameLine).join('') + '</div>' : '';

  document.getElementById('room').innerHTML =
    section('Speakers', speakers) + section('Vendors &amp; partners', vendors) + section('Guests', guests)
    || '<div class="banner">No confirmations yet.</div>';
  document.getElementById('foot').textContent = 'Willpower Outreach HQ' + (meta.lastSyncAt ? ' &middot; as of ' + new Date(meta.lastSyncAt).toLocaleDateString() : '');
})();
