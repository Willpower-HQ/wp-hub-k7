/* Command palette: press Cmd/Ctrl+K (or tap Search in the nav) to jump to any person, company, or event. */
(async () => {
  const { contacts, events } = await HUB.load();
  const E = HUB.esc;
  const el = document.createElement('div'); el.id = 'pal';
  el.innerHTML = '<div class="palbox"><input type="text" id="palIn" placeholder="Search people, companies, events..." autocomplete="off" spellcheck="false"><div class="palresults" id="palRes"></div><div class="palhint">&uarr;&darr; to move &middot; Enter to open &middot; Esc to close</div></div>';
  document.body.appendChild(el);
  const input = el.querySelector('#palIn'), res = el.querySelector('#palRes');
  let items = [], sel = 0;
  const evAll = events.filter(e => e.date);

  const open = () => { el.classList.add('open'); input.value = ''; render(''); setTimeout(() => input.focus(), 30); };
  const close = () => el.classList.remove('open');
  el.onclick = e => { if (e.target === el) close(); };

  function search(q) {
    q = q.toLowerCase().trim();
    const out = [];
    if (!q) { evAll.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6).forEach(e => out.push({ k: 'Event', nm: e.name, sub: HUB.fmtDate(e.date), url: 'event.html?e=' + encodeURIComponent(e.id) })); return out; }
    events.forEach(e => { if ((e.name || '').toLowerCase().includes(q)) out.push({ k: 'Event', nm: e.name, sub: HUB.fmtDate(e.date), url: 'event.html?e=' + encodeURIComponent(e.id) }); });
    let n = 0;
    for (const c of contacts) { if (n >= 40) break; const hay = ((c.name || '') + ' ' + (c.companyName || '') + ' ' + (c.email || '')).toLowerCase(); if (hay.includes(q)) { out.push({ k: 'Person', nm: c.name, sub: [c.title, c.companyName].filter(Boolean).join(', '), url: 'contacts.html?c=' + encodeURIComponent(c.id) }); n++; } }
    return out.slice(0, 50);
  }
  const render = q => { items = search(q); sel = 0; paint(); };
  function paint() {
    res.innerHTML = items.length
      ? items.map((it, i) => '<div class="palr' + (i === sel ? ' sel' : '') + '" data-i="' + i + '"><span class="k">' + it.k + '</span><span style="min-width:0"><div class="nm">' + E(it.nm || '') + '</div><div class="sub">' + E(it.sub || '') + '</div></span></div>').join('')
      : '<div class="palr"><span class="sub">No matches</span></div>';
    res.querySelectorAll('.palr[data-i]').forEach(r => r.onclick = () => go(+r.dataset.i));
    const s = res.querySelector('.palr.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
  }
  const go = i => { const it = items[i]; if (it && it.url) location.href = it.url; };
  input.oninput = () => render(input.value);
  input.onkeydown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(sel); }
    else if (e.key === 'Escape') { close(); }
  };
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); } });
  document.querySelectorAll('.nav').forEach(nav => { const b = document.createElement('a'); b.href = '#'; b.className = 'navsearch'; b.innerHTML = 'Search'; b.onclick = ev => { ev.preventDefault(); open(); }; nav.appendChild(b); });
})();
