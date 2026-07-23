let closeDrawer = () => {};
(async () => {
  const { contacts, events, pipeline, meta, eventById } = await HUB.load();
  const E = HUB.esc;
  document.getElementById('banners').innerHTML = HUB.staleBanner(meta);

  // stats
  const bounced = contacts.filter(c => c.emailStatus === 'bounced').length;
  const noEmail = contacts.filter(c => !c.email && c.emailStatus !== 'bounced').length;
  document.getElementById('stats').innerHTML = [
    ['lav', contacts.length.toLocaleString(), 'Total contacts'],
    ['blue', contacts.filter(c => (c.metro || []).includes('NYC')).length.toLocaleString(), 'NYC metro'],
    ['green', contacts.filter(c => (c.metro || []).includes('AUSTIN')).length.toLocaleString(), 'Austin metro'],
    ['red', (bounced + noEmail).toLocaleString(), 'Bounced or missing email'],
  ].map(([c, n, l]) => '<div class="stat ' + c + '"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>').join('');

  // filter options with counts
  const countBy = fn => {
    const m = {};
    contacts.forEach(c => (fn(c) || []).forEach(v => { if (v) m[v] = (m[v] || 0) + 1; }));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  const fill = (id, pairs) => {
    const sel = document.getElementById(id);
    pairs.forEach(([v, n]) => { const o = document.createElement('option'); o.value = v; o.textContent = v + ' (' + n + ')'; sel.appendChild(o); });
  };
  fill('cityF', countBy(c => c.metro));
  fill('catF', countBy(c => c.category));
  fill('statusF', countBy(c => [c.outreachStatus]));
  fill('tierF', countBy(c => [c.wpTier]));

  let page = 0; const PAGE = 100;
  const val = id => document.getElementById(id).value;
  const chk = id => document.getElementById(id).checked;

  const filtered = () => {
    const q = val('search').toLowerCase(), city = val('cityF'), cat = val('catF'), st = val('statusF'), tier = val('tierF');
    return contacts.filter(c =>
      (!q || [c.name, c.companyName, c.title, c.email].some(v => (v || '').toLowerCase().includes(q)))
      && (!city || (c.metro || []).includes(city))
      && (!cat || (c.category || []).includes(cat))
      && (!st || c.outreachStatus === st)
      && (!tier || c.wpTier === tier)
      && (!chk('bouncedF') || c.emailStatus === 'bounced')
      && (!chk('noEmailF') || !c.email));
  };

  const render = () => {
    const items = filtered();
    const slice = items.slice(page * PAGE, page * PAGE + PAGE);
    document.getElementById('rows').innerHTML = slice.length ? slice.map(c =>
      '<tr class="click" data-id="' + E(c.id) + '">'
      + '<td class="co">' + E(c.name || '') + '</td>'
      + '<td>' + E(c.companyName || '') + '</td>'
      + '<td class="mut">' + E(c.title || '') + '</td>'
      + '<td>' + (c.metro || []).slice(0, 2).map(m => '<span class="chip city">' + E(m) + '</span>').join('') + '</td>'
      + '<td>' + (c.category || []).slice(0, 2).map(m => '<span class="chip cat">' + E(m) + '</span>').join('') + '</td>'
      + '<td>' + HUB.liLink(c.linkedin) + '</td>'
      + '<td>' + HUB.emailCell(c) + '</td>'
      + '<td>' + (c.outreachStatus ? '<span class="pill" data-s="' + E(c.outreachStatus) + '">' + E(c.outreachStatus) + '</span>' : '') + '</td>'
      + '</tr>').join('') : '<tr><td colspan="8" class="empty">No matches.</td></tr>';
    document.querySelectorAll('tr.click').forEach(tr => tr.onclick = () => openDrawer(tr.dataset.id));

    const pages = Math.ceil(items.length / PAGE);
    document.getElementById('pager').innerHTML = pages > 1
      ? '<button ' + (page === 0 ? 'disabled' : '') + ' id="pv">&larr; Prev</button><span class="pinfo">Page ' + (page + 1) + ' of ' + pages + ' (' + items.length.toLocaleString() + ' people)</span><button ' + (page >= pages - 1 ? 'disabled' : '') + ' id="nx">Next &rarr;</button>'
      : '<span class="pinfo">' + items.length.toLocaleString() + ' people</span>';
    const pv = document.getElementById('pv'), nx = document.getElementById('nx');
    if (pv) pv.onclick = () => { page--; render(); window.scrollTo(0, 0); };
    if (nx) nx.onclick = () => { page++; render(); window.scrollTo(0, 0); };
  };

  ['search'].forEach(id => document.getElementById(id).oninput = () => { page = 0; render(); });
  ['cityF','catF','statusF','tierF','bouncedF','noEmailF'].forEach(id => document.getElementById(id).onchange = () => { page = 0; render(); });
  render();
  document.getElementById('foot').textContent = meta.lastSyncAt ? 'Data refreshed ' + new Date(meta.lastSyncAt).toLocaleString() : '';

  // drawer
  const drawer = document.getElementById('drawer'), overlay = document.getElementById('overlay');
  closeDrawer = () => { drawer.classList.remove('open'); overlay.classList.remove('open'); };
  function openDrawer(id) {
    const c = contacts.find(x => x.id === id); if (!c) return;
    const hist = pipeline.filter(r => r.contactId === id).map(r => ({ r, e: eventById[r.eventId] }))
      .filter(h => h.e).sort((a, b) => (b.e.date || '').localeCompare(a.e.date || ''));
    const field = (k, v) => v ? '<div class="field"><div class="k">' + k + '</div>' + v + '</div>' : '';
    drawer.innerHTML = '<button class="close" onclick="closeDrawer()">Close</button>'
      + '<h2>' + E(c.name || '') + '</h2>'
      + '<div class="mut">' + E([c.title, c.companyName].filter(Boolean).join(' at ')) + '</div>'
      + '<div style="margin:10px 0">' + (c.metro || []).map(m => '<span class="chip city">' + E(m) + '</span>').join('')
      + (c.category || []).map(m => '<span class="chip cat">' + E(m) + '</span>').join('')
      + (c.wpTier ? '<span class="chip info">' + E(c.wpTier) + '</span>' : '')
      + (c.flags && c.flags.leftCompany ? '<span class="chip bad">May have left company</span>' : '') + '</div>'
      + field('Email', c.emailStatus === 'bounced' ? '<span class="chip bad">BOUNCED</span> <span class="mut">' + E(c.bouncedEmail || '') + '</span>' : c.email ? '<span class="emailcell">' + E(c.email) + ' ' + HUB.copyBtn(c.email) + '</span>' : '<span class="mut">none on file</span>')
      + field('LinkedIn', c.linkedin ? '<a href="' + E(c.linkedin) + '" target="_blank" rel="noopener">' + E(c.linkedin) + '</a>' : '')
      + field('Outreach status', c.outreachStatus ? '<span class="pill" data-s="' + E(c.outreachStatus) + '">' + E(c.outreachStatus) + '</span>' + (c.lastContactDate ? ' <span class="mut">last contact ' + E(HUB.fmtDate(c.lastContactDate)) + '</span>' : '') : '')
      + field('Last feedback', E(c.lastFeedback))
      + field('Industry', E(c.industry))
      + field('Notes', E(c.notes))
      + field('Source', (c.source || []).map(E).join(', '))
      + '<div class="field"><div class="k">Event history</div>'
      + (hist.length ? '<div class="timeline">' + hist.map(h =>
          '<div class="ev"><b>' + E(h.e.name) + '</b> <span class="pill" data-s="' + E(h.r.status) + '">' + E(h.r.status) + '</span>'
          + (h.r.sentProduct ? ' <span class="chip ok">sent product</span>' : '')
          + '<div class="d">' + E(HUB.fmtDate(h.e.date)) + (h.r.role ? ' &middot; ' + E(h.r.role) : '') + (h.r.speakerAngle ? ' &middot; ' + E(h.r.speakerAngle) : '') + '</div></div>').join('') + '</div>'
        : '<span class="mut">No event history yet.</span>') + '</div>'
      + '<div style="margin-top:18px"><a href="' + HUB.notionUrl(c.id) + '" target="_blank" rel="noopener"><button class="primary">Open in Notion</button></a></div>';
    drawer.classList.add('open'); overlay.classList.add('open');
  }
})();
