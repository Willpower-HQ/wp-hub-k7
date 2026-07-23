let closeDrawer = () => {};
(async () => {
  const { contacts, events, pipeline, meta, eventById } = await HUB.load();
  const E = HUB.esc;
  document.getElementById('banners').innerHTML = HUB.staleBanner(meta);

  const bounced = contacts.filter(c => c.emailStatus === 'bounced').length;
  const noEmail = contacts.filter(c => !c.email && c.emailStatus !== 'bounced').length;
  document.getElementById('summary').innerHTML =
    '<span><b>' + contacts.length.toLocaleString() + '</b> contacts</span>'
    + '<span><b>' + contacts.filter(c => (c.metro || []).includes('NYC')).length.toLocaleString() + '</b> NYC metro</span>'
    + '<span><b>' + contacts.filter(c => (c.metro || []).includes('AUSTIN')).length.toLocaleString() + '</b> Austin metro</span>'
    + '<span><b>' + (bounced + noEmail).toLocaleString() + '</b> bounced or no email</span>';

  const countBy = fn => {
    const m = {};
    contacts.forEach(c => (fn(c) || []).forEach(v => { if (v) m[v] = (m[v] || 0) + 1; }));
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  const fill = (id, pairs) => { const s = document.getElementById(id); pairs.forEach(([v, n]) => { const o = document.createElement('option'); o.value = v; o.textContent = v + ' (' + n + ')'; s.appendChild(o); }); };
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
      && (!city || (c.metro || []).includes(city)) && (!cat || (c.category || []).includes(cat))
      && (!st || c.outreachStatus === st) && (!tier || c.wpTier === tier)
      && (!chk('bouncedF') || c.emailStatus === 'bounced') && (!chk('noEmailF') || !c.email));
  };

  const render = () => {
    const items = filtered();
    const slice = items.slice(page * PAGE, page * PAGE + PAGE);
    document.getElementById('rows').innerHTML = slice.length ? slice.map(c =>
      '<tr class="click" data-id="' + E(c.id) + '">'
      + '<td class="nm">' + E(c.name || '') + '</td>'
      + '<td>' + E(c.companyName || '') + '</td>'
      + '<td class="mut">' + E(c.title || '') + '</td>'
      + '<td>' + (c.metro || []).slice(0, 2).map(m => '<span class="tag city">' + E(m) + '</span>').join('') + '</td>'
      + '<td class="sub2">' + (c.category || []).slice(0, 2).map(E).join(', ') + '</td>'
      + '<td>' + HUB.emailCell(c) + '</td>'
      + '<td>' + (c.outreachStatus ? '<span class="st" data-s="' + E(c.outreachStatus) + '">' + E(c.outreachStatus) + '</span>' : '') + '</td>'
      + '</tr>').join('') : '<tr><td colspan="7" class="empty">No matches.</td></tr>';
    document.querySelectorAll('tr.click').forEach(tr => tr.onclick = () => openDrawer(tr.dataset.id));

    const pages = Math.ceil(items.length / PAGE);
    document.getElementById('pager').innerHTML = pages > 1
      ? '<button ' + (page === 0 ? 'disabled' : '') + ' id="pv">Prev</button><span class="pinfo">Page ' + (page + 1) + ' of ' + pages + ' &middot; ' + items.length.toLocaleString() + ' people</span><button ' + (page >= pages - 1 ? 'disabled' : '') + ' id="nx">Next</button>'
      : '<span class="pinfo">' + items.length.toLocaleString() + ' people</span>';
    const pv = document.getElementById('pv'), nx = document.getElementById('nx');
    if (pv) pv.onclick = () => { page--; render(); scrollTo(0, 0); };
    if (nx) nx.onclick = () => { page++; render(); scrollTo(0, 0); };
  };
  ['search'].forEach(id => document.getElementById(id).oninput = () => { page = 0; render(); });
  ['cityF','catF','statusF','tierF','bouncedF','noEmailF'].forEach(id => document.getElementById(id).onchange = () => { page = 0; render(); });
  render();
  document.getElementById('foot').textContent = meta.lastSyncAt ? 'Data refreshed ' + new Date(meta.lastSyncAt).toLocaleString() : '';

  const drawer = document.getElementById('drawer'), overlay = document.getElementById('overlay');
  closeDrawer = () => { drawer.classList.remove('open'); overlay.classList.remove('open'); };
  function openDrawer(cid) {
    const c = contacts.find(x => x.id === cid); if (!c) return;
    const hist = pipeline.filter(r => r.contactId === cid).map(r => ({ r, e: eventById[r.eventId] })).filter(h => h.e)
      .sort((a, b) => (b.e.date || '').localeCompare(a.e.date || ''));
    const field = (k, v) => v ? '<div class="field"><div class="k">' + k + '</div>' + v + '</div>' : '';
    drawer.innerHTML = '<button class="close" onclick="closeDrawer()">Close</button>'
      + '<h2>' + E(c.name || '') + '</h2>'
      + '<div class="role">' + E([c.title, c.companyName].filter(Boolean).join(' at ')) + '</div>'
      + '<div style="margin:14px 0">' + (c.metro || []).map(m => '<span class="tag city">' + E(m) + '</span> ').join('')
      + (c.wpTier ? '<span class="tag line">' + E(c.wpTier) + '</span> ' : '')
      + (c.flags && c.flags.leftCompany ? '<span class="st" data-s="BOUNCED EMAIL">may have left</span>' : '') + '</div>'
      + field('Email', c.emailStatus === 'bounced' ? '<span class="st" data-s="BOUNCED EMAIL">bounced</span> <span class="mut">' + E(c.bouncedEmail || '') + '</span>' : c.email ? '<span class="emailcell">' + E(c.email) + ' ' + HUB.copyBtn(c.email) + '</span>' : '<span class="mut">none on file</span>')
      + field('LinkedIn', c.linkedin ? '<a href="' + E(c.linkedin) + '" target="_blank" rel="noopener" style="text-decoration:underline">' + E(c.linkedin.replace(/^https?:\/\//, '')) + '</a>' : '')
      + field('Category', (c.category || []).map(E).join(', '))
      + field('Outreach status', c.outreachStatus ? '<span class="st" data-s="' + E(c.outreachStatus) + '">' + E(c.outreachStatus) + '</span>' + (c.lastContactDate ? ' <span class="mut">last contact ' + E(HUB.fmtDate(c.lastContactDate)) + '</span>' : '') : '')
      + field('Last feedback', E(c.lastFeedback))
      + field('Industry', E(c.industry))
      + field('Notes', E(c.notes))
      + '<div class="field"><div class="k">Event history</div>'
      + (hist.length ? '<div class="timeline">' + hist.map(h =>
          '<div class="ev"><b>' + E(h.e.name) + '</b> <span class="st" data-s="' + E(h.r.status) + '">' + E(h.r.status) + '</span>'
          + (h.r.sentProduct ? ' <span class="st" data-s="CONFIRMED">sent product</span>' : '')
          + '<div class="d">' + E(HUB.fmtDate(h.e.date)) + (h.r.role ? ' &middot; ' + E(h.r.role) : '') + '</div></div>').join('') + '</div>'
        : '<span class="mut">No event history yet.</span>') + '</div>'
      + '<div style="margin-top:20px"><a href="' + HUB.notionUrl(c.id) + '" target="_blank" rel="noopener"><button class="primary">Open in Notion</button></a></div>';
    drawer.classList.add('open'); overlay.classList.add('open');
  }
})();
