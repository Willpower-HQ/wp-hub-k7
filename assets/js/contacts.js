let closeDrawer = () => {};
(async () => {
  const { contacts, events, pipeline, meta, eventById } = await HUB.load();
  const E = HUB.esc;
  document.getElementById('banners').innerHTML = HUB.staleBanner(meta);

  // personal tags + saved views (this device)
  let TAGS = {}; try { TAGS = JSON.parse(localStorage.getItem('wp_tags') || '{}'); } catch (e) {}
  const saveTags = () => { try { localStorage.setItem('wp_tags', JSON.stringify(TAGS)); } catch (e) {} };
  const tagsOf = cid => TAGS[cid] || [];
  const allTags = () => [...new Set(Object.values(TAGS).flat())].sort();
  let VIEWS = []; try { VIEWS = JSON.parse(localStorage.getItem('wp_views') || '[]'); } catch (e) {}
  const saveViews = () => { try { localStorage.setItem('wp_views', JSON.stringify(VIEWS)); } catch (e) {} };

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
  const fillTags = () => { const s = document.getElementById('tagF'); const cur = s.value; s.innerHTML = '<option value="">All tags</option>' + allTags().map(t => '<option' + (t === cur ? ' selected' : '') + '>' + E(t) + '</option>').join(''); };
  fillTags();

  let page = 0; const PAGE = 100;
  const val = id => document.getElementById(id).value;
  const chk = id => document.getElementById(id).checked;
  const filtered = () => {
    const q = val('search').toLowerCase(), city = val('cityF'), cat = val('catF'), st = val('statusF'), tier = val('tierF'), tag = val('tagF');
    return contacts.filter(c =>
      (!q || [c.name, c.companyName, c.title, c.email].some(v => (v || '').toLowerCase().includes(q)))
      && (!city || (c.metro || []).includes(city)) && (!cat || (c.category || []).includes(cat))
      && (!st || c.outreachStatus === st) && (!tier || c.wpTier === tier)
      && (!tag || tagsOf(c.id).includes(tag))
      && (!chk('bouncedF') || c.emailStatus === 'bounced') && (!chk('noEmailF') || !c.email));
  };

  const row = c =>
    '<div class="prow click" data-id="' + E(c.id) + '">'
    + '<div class="who"><div class="nm">' + E(c.name || '') + (c.linkedin ? ' <a class="li" href="' + E(c.linkedin) + '" target="_blank" rel="noopener">in</a>' : '') + '</div>'
    + '<div class="t">' + E(c.title || '') + '</div>'
    + '<div style="margin-top:4px">' + (c.metro || []).slice(0, 2).map(m => '<span class="tag city">' + E(m) + '</span>').join('') + (c.category || []).slice(0, 1).map(m => '<span class="tag line">' + E(m) + '</span>').join('') + tagsOf(c.id).map(t => '<span class="tagchip">' + E(t) + '</span>').join('') + '</div></div>'
    + '<div class="co" data-label="Company">' + E(c.companyName || '') + '</div>'
    + '<div data-label="Status">' + (c.outreachStatus ? '<span class="st" data-s="' + E(c.outreachStatus) + '">' + E(c.outreachStatus) + '</span>' : '<span class="mut">-</span>') + '</div>'
    + '<div data-label="Email">' + HUB.emailCell(c) + '</div>'
    + '</div>';
  const render = () => {
    const items = filtered();
    const slice = items.slice(page * PAGE, page * PAGE + PAGE);
    document.getElementById('rows').innerHTML = slice.length
      ? '<div class="plist"><div class="phead-row"><span>Name / title</span><span>Company</span><span>Status</span><span>Email</span></div>' + slice.map(row).join('') + '</div>'
      : '<div class="plist"><div class="empty">No matches.</div></div>';
    document.querySelectorAll('.prow.click').forEach(r => r.onclick = e => { if (e.target.closest('a,button,select')) return; openDrawer(r.dataset.id); });

    const pages = Math.ceil(items.length / PAGE);
    document.getElementById('pager').innerHTML = pages > 1
      ? '<button ' + (page === 0 ? 'disabled' : '') + ' id="pv">Prev</button><span class="pinfo">Page ' + (page + 1) + ' of ' + pages + ' &middot; ' + items.length.toLocaleString() + ' people</span><button ' + (page >= pages - 1 ? 'disabled' : '') + ' id="nx">Next</button>'
      : '<span class="pinfo">' + items.length.toLocaleString() + ' people</span>';
    const pv = document.getElementById('pv'), nx = document.getElementById('nx');
    if (pv) pv.onclick = () => { page--; render(); scrollTo(0, 0); };
    if (nx) nx.onclick = () => { page++; render(); scrollTo(0, 0); };
  };
  ['search'].forEach(id => document.getElementById(id).oninput = () => { page = 0; render(); });
  ['cityF','catF','statusF','tierF','tagF','bouncedF','noEmailF'].forEach(id => document.getElementById(id).onchange = () => { page = 0; render(); });

  // saved views (this device)
  const currentFilters = () => ({ q: val('search'), city: val('cityF'), cat: val('catF'), st: val('statusF'), tier: val('tierF'), tag: val('tagF'), bounced: chk('bouncedF'), noEmail: chk('noEmailF') });
  const setF = (id, v) => { document.getElementById(id).value = v || ''; };
  const loadView = f => { setF('search', f.q); setF('cityF', f.city); setF('catF', f.cat); setF('statusF', f.st); setF('tierF', f.tier); setF('tagF', f.tag); document.getElementById('bouncedF').checked = !!f.bounced; document.getElementById('noEmailF').checked = !!f.noEmail; page = 0; render(); };
  const renderViewbar = () => {
    const vb = document.getElementById('viewbar');
    vb.innerHTML = '<span class="mut" style="font-size:12.5px">Saved views</span>'
      + '<select id="viewSel"><option value="">Choose a view...</option>' + VIEWS.map((v, i) => '<option value="' + i + '">' + E(v.name) + '</option>').join('') + '</select>'
      + '<button id="saveView">Save current filters</button>'
      + (VIEWS.length ? '<button id="delView">Delete</button>' : '');
    document.getElementById('viewSel').onchange = e => { if (e.target.value !== '') loadView(VIEWS[+e.target.value].f); };
    document.getElementById('saveView').onclick = () => { const name = prompt('Name this view (e.g. NYC VIP founders):'); if (name && name.trim()) { VIEWS.push({ name: name.trim(), f: currentFilters() }); saveViews(); renderViewbar(); } };
    const dv = document.getElementById('delView'); if (dv) dv.onclick = () => { const s = document.getElementById('viewSel'); if (s.value !== '' && confirm('Delete the view "' + VIEWS[+s.value].name + '"?')) { VIEWS.splice(+s.value, 1); saveViews(); renderViewbar(); } };
  };
  renderViewbar();
  render();
  const cparam = new URLSearchParams(location.search).get('c');
  if (cparam) setTimeout(() => openDrawer(cparam), 50);
  document.getElementById('foot').textContent = meta.lastSyncAt ? 'Data refreshed ' + new Date(meta.lastSyncAt).toLocaleString() : '';

  const drawer = document.getElementById('drawer'), overlay = document.getElementById('overlay');
  closeDrawer = () => { drawer.classList.remove('open'); overlay.classList.remove('open'); };
  function openDrawer(cid) {
    const c = contacts.find(x => x.id === cid); if (!c) return;
    const hist = pipeline.filter(r => r.contactId === cid).map(r => ({ r, e: eventById[r.eventId] })).filter(h => h.e)
      .sort((a, b) => (b.e.date || '').localeCompare(a.e.date || ''));
    const fbEntries = (c.lastFeedback || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
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
      + field('Industry', E(c.industry))
      + field('Notes', E(c.notes))
      + '<div class="field"><div class="k">Tags</div><div id="tagWrap">' + tagsOf(cid).map(t => '<span class="tagchip">' + E(t) + ' <span data-untag="' + E(t) + '" style="cursor:pointer">&times;</span></span>').join('') + '</div><div class="tagadd"><input id="tagIn" placeholder="Add a tag, press Enter"></div></div>'
      + '<div class="field"><div class="k">Relationship timeline</div>'
      + ((fbEntries.length || hist.length) ? '<div class="timeline">'
          + fbEntries.map(en => { const m = en.match(/^\[([^\]]+)\]\s*([\s\S]*)$/); const dt = m ? m[1] : '', tx = m ? m[2] : en; return '<div class="ev">' + E(tx) + (dt ? '<div class="d">' + E(dt) + '</div>' : '') + '</div>'; }).join('')
          + hist.map(h => '<div class="ev"><b>' + E(h.e.name) + '</b> <span class="st" data-s="' + E(h.r.status) + '">' + E(h.r.status) + '</span>'
            + (h.r.sentProduct ? ' <span class="st" data-s="CONFIRMED">sent product</span>' : '')
            + '<div class="d">' + E(HUB.fmtDate(h.e.date)) + (h.r.role ? ' &middot; ' + E(h.r.role) : '') + '</div></div>').join('') + '</div>'
        : '<span class="mut">No history yet.</span>') + '</div>'
      + '<div style="margin-top:20px"><a href="' + HUB.notionUrl(c.id) + '" target="_blank" rel="noopener"><button class="primary">Open in Notion</button></a></div>';
    const tagIn = drawer.querySelector('#tagIn');
    if (tagIn) tagIn.addEventListener('keydown', e => { if (e.key === 'Enter') { const t = tagIn.value.trim(); if (t) { TAGS[cid] = [...new Set([...(TAGS[cid] || []), t])]; saveTags(); fillTags(); openDrawer(cid); render(); } } });
    drawer.querySelectorAll('[data-untag]').forEach(x => x.onclick = () => { TAGS[cid] = (TAGS[cid] || []).filter(t => t !== x.dataset.untag); if (!TAGS[cid].length) delete TAGS[cid]; saveTags(); fillTags(); openDrawer(cid); render(); });
    drawer.classList.add('open'); overlay.classList.add('open');
  }
})();
