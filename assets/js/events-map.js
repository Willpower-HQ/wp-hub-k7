(async () => {
  const { events, nearby, meta } = await HUB.load();
  const E = HUB.esc;

  const CITY = {
    NYC: [40.741, -73.989], AUSTIN: [30.267, -97.743], DALLAS: [32.777, -96.797],
    HOUSTON: [29.760, -95.369], 'SAN ANTONIO': [29.424, -98.494], MIAMI: [25.775, -80.194],
    CALIFORNIA: [34.052, -118.243], 'LAS VEGAS': [36.169, -115.139],
  };
  const VENUE = [
    ['remedy place flatiron', [40.7402, -73.9903]], ['remedy place', [40.7402, -73.9903]],
    ['center415', [40.7490, -73.9870]], ['hilton midtown', [40.7625, -73.9800]],
    ['javits', [40.7570, -74.0020]], ['pier 81', [40.7650, -73.9990]],
    ['soho house new york', [40.7400, -74.0050]], ['soho house', [30.2660, -97.7400]],
    ['cota', [30.1340, -97.6410]], ['padel39', [30.2620, -97.7220]], ['padel 39', [30.2620, -97.7220]],
    ['lefty', [30.2500, -97.7200]], ['the malin', [40.7230, -74.0020]],
    ['flute', [40.7650, -73.9820]], ['three monkeys', [40.7620, -73.9850]],
  ];
  // deterministic small offset so multiple pins in one city do not stack
  const jitter = (seed) => { let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 1000; return ((h / 1000) - 0.5) * 0.05; };
  const coordOf = (name, venue, cityKey, locationRaw) => {
    const v = (venue || '').toLowerCase();
    for (const [k, ll] of VENUE) if (v.includes(k)) return ll;
    const base = CITY[cityKey] || CITY[HUB.cityKey(locationRaw || '')] || null;
    if (!base) return null;
    return [base[0] + jitter(name || 'x'), base[1] + jitter((name || 'y') + 'b')];
  };

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upcoming = events.filter(e => e.date && new Date(e.date + 'T23:59:00') >= today && e.status !== 'CANCELLED');
  const pins = [];
  upcoming.forEach(e => {
    const ll = coordOf(e.name, e.venue, e.cityKey, e.locationRaw);
    if (ll) pins.push({ ll, name: e.name, date: e.date, venue: e.venue || e.locationRaw || '', cityKey: e.cityKey, mine: e.internal, url: 'event.html?e=' + encodeURIComponent(e.id), why: e.internal ? 'Willpower event' : 'external event we track' });
  });
  Object.entries(nearby).forEach(([eid, blk]) => {
    const host = events.find(e => e.id === eid);
    (blk.items || []).forEach(n => {
      const ck = (n.city || '').toUpperCase().includes('AUSTIN') ? 'AUSTIN' : n.city ? 'NYC' : (host && host.cityKey);
      const ll = coordOf(n.name, n.venue, ck, n.city);
      if (ll) pins.push({ ll, name: n.name, date: n.date, venue: n.venue || '', cityKey: ck, mine: false, url: n.url, why: n.why || 'industry event' });
    });
  });

  // city buttons
  const cities = [...new Set(pins.map(p => p.cityKey).filter(Boolean))].sort();
  let active = cities.includes('NYC') ? 'NYC' : (cities[0] || 'ALL');
  const btnRow = document.getElementById('cityBtns');
  const drawBtns = () => {
    btnRow.innerHTML = (['ALL'].concat(cities)).map(c =>
      '<button class="' + (active === c ? 'primary' : '') + '" data-c="' + c + '">' + (c === 'ALL' ? 'All cities' : c) + '</button>').join('');
    btnRow.querySelectorAll('button').forEach(b => b.onclick = () => { active = b.dataset.c; drawBtns(); draw(); });
  };

  const map = L.map('map', { scrollWheelZoom: false }).setView(CITY.NYC, 11);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd', attribution: '&copy; OpenStreetMap &copy; CARTO' }).addTo(map);
  const green = c => L.divIcon({ className: '', html: '<div style="width:16px;height:16px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);background:' + c + '"></div>', iconSize: [16, 16] });
  let markers = [];
  const draw = () => {
    markers.forEach(m => map.removeLayer(m)); markers = [];
    const show = pins.filter(p => active === 'ALL' || p.cityKey === active);
    const bounds = [];
    show.forEach(p => {
      const m = L.marker(p.ll, { icon: green(p.mine ? '#4a5d4e' : '#8a8790') }).addTo(map);
      m.bindPopup('<b>' + E(p.name) + '</b><br>' + E(HUB.fmtDate(p.date)) + (p.venue ? '<br>' + E(p.venue) : '') + (p.url ? '<br><a href="' + E(p.url) + '"' + (p.url.startsWith('event.html') ? '' : ' target="_blank" rel="noopener"') + '>open</a>' : ''));
      p._m = m; markers.push(m); bounds.push(p.ll);
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    document.getElementById('listHead').textContent = (active === 'ALL' ? 'All events' : active + ' events') + ' (' + show.length + ')';
    document.getElementById('list').innerHTML = show.length ? show.sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((p, i) =>
      '<div class="minirow" data-i="' + i + '" style="cursor:pointer">'
      + '<span class="d">' + E(HUB.fmtDate(p.date)) + '</span>'
      + '<span class="nm">' + E(p.name) + '</span>'
      + '<span class="tag ' + (p.mine ? 'city' : 'line') + '">' + (p.mine ? 'Willpower' : 'industry') + '</span>'
      + '<span class="loc">' + E(p.venue || '') + '</span></div>').join('') : '<div class="empty">No mapped events for this city.</div>';
    document.querySelectorAll('#list .minirow').forEach((row, i) => row.onclick = () => {
      const p = show.sort((a, b) => (a.date || '').localeCompare(b.date || ''))[i];
      if (p && p._m) { map.flyTo(p.ll, 14); p._m.openPopup(); scrollTo({ top: 0, behavior: 'smooth' }); }
    });
  };
  drawBtns(); draw();
  document.getElementById('foot').textContent = meta.lastSyncAt ? 'Data refreshed ' + new Date(meta.lastSyncAt).toLocaleString() : '';
})();
