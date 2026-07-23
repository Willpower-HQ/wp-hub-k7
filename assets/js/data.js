/* Shared data loading, metro aliases, formatters. */
const HUB = (() => {
  // LOC value -> metro key. Keep in sync with sync/aliases.json.
  const METRO = {
    AUSTIN: ['AUSTIN','ROUND ROCK','CEDAR PARK','LEANDER','KYLE','DRIPPING SPRINGS','PFLUGERVILLE','GEORGETOWN','SAN MARCOS'],
    NYC: ['NYC','NEW JERSEY','CONNECTICUT'],
    DALLAS: ['DALLAS','PLANO','McKINNEY','COPPELL','SOUTHLAKE','FLOWER MOUND','ARLINGTON','FORT WORTH','COLONY','PROSPER','MANSFIELD','COLLEYVILLE'],
    HOUSTON: ['HOUSTON','CYPRESS','SPRING'],
    'SAN ANTONIO': ['SAN ANTONIO','HELOTES'],
  };
  const LOC_TO_METRO = {};
  Object.entries(METRO).forEach(([m, locs]) => locs.forEach(l => LOC_TO_METRO[l.toUpperCase()] = m));

  // Free-text event location -> metro key
  function cityKey(raw) {
    if (!raw) return null;
    const s = raw.toUpperCase();
    if (/NEW YORK|NYC|MANHATTAN|BROOKLYN|SOHO|TRIBECA/.test(s)) return 'NYC';
    if (/AUSTIN/.test(s)) return 'AUSTIN';
    if (/DALLAS|FORT WORTH/.test(s)) return 'DALLAS';
    if (/HOUSTON/.test(s)) return 'HOUSTON';
    if (/SAN ANTONIO/.test(s)) return 'SAN ANTONIO';
    if (/MIAMI/.test(s)) return 'MIAMI';
    if (/LOS ANGELES|\bLA\b|CALIFORNIA/.test(s)) return 'CALIFORNIA';
    const hit = Object.keys(LOC_TO_METRO).find(l => s.includes(l));
    return hit ? LOC_TO_METRO[hit] : null;
  }

  function metrosOf(locArr) {
    const out = new Set();
    (locArr || []).forEach(l => {
      const u = (l || '').toUpperCase();
      out.add(LOC_TO_METRO[u] || u);
    });
    return [...out];
  }

  let cache = null;
  async function load() {
    if (cache) return cache;
    const get = async (f) => {
      try { const r = await fetch('data/' + f + '?v=' + Date.now()); return r.ok ? r.json() : null; }
      catch (e) { return null; }
    };
    const [contacts, events, pipeline, nearby, meta] = await Promise.all([
      get('contacts.json'), get('events.json'), get('pipeline.json'), get('nearby-events.json'), get('meta.json'),
    ]);
    cache = {
      contacts: (contacts && contacts.contacts) || [],
      events: (events && events.events) || [],
      pipeline: (pipeline && pipeline.rows) || [],
      nearby: (nearby && nearby.byEvent) || {},
      meta: meta || {},
    };
    cache.contactById = Object.fromEntries(cache.contacts.map(c => [c.id, c]));
    cache.eventById = Object.fromEntries(cache.events.map(e => [e.id, e]));
    return cache;
  }

  const esc = s => (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate = d => {
    if (!d) return '';
    const dt = new Date(d + (d.length === 10 ? 'T12:00:00' : ''));
    return isNaN(dt) ? d : dt.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
  };
  const daysUntil = d => Math.ceil((new Date(d + 'T12:00:00') - new Date()) / 86400000);
  const countdown = d => {
    const n = daysUntil(d);
    if (isNaN(n)) return '';
    if (n > 1) return 'in ' + n + ' days';
    if (n === 1) return 'tomorrow';
    if (n === 0) return 'today';
    if (n === -1) return 'yesterday';
    return Math.abs(n) + ' days ago';
  };

  function copyBtn(text) {
    return '<button class="copy" data-copy="' + esc(text) + '" title="Copy" onclick="HUB.copy(this,event)">&#10697;</button>';
  }
  function copy(btn, ev) {
    ev && ev.stopPropagation();
    navigator.clipboard.writeText(btn.dataset.copy).then(() => {
      btn.classList.add('ok'); btn.innerHTML = '&#10003;';
      setTimeout(() => { btn.classList.remove('ok'); btn.innerHTML = '&#10697;'; }, 1200);
    });
  }

  function emailCell(c) {
    if (c.emailStatus === 'bounced') return '<span class="chip bad" title="' + esc(c.bouncedEmail || '') + '">BOUNCED</span>' + (c.linkedin ? ' ' + liLink(c.linkedin) : '');
    if (!c.email) return c.linkedin ? '<span class="chip ghost">LinkedIn only</span>' : '<span class="chip ghost">no contact info</span>';
    return '<span class="emailcell">' + esc(c.email) + ' ' + copyBtn(c.email) + '</span>';
  }
  const liLink = url => url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener" title="LinkedIn" onclick="event.stopPropagation()">in&#8599;</a>' : '';

  function staleBanner(meta) {
    if (!meta || !meta.lastSyncAt) return '';
    const h = (Date.now() - new Date(meta.lastSyncAt)) / 3600000;
    if (h <= 36) return '';
    return '<div class="banner warn">Data was last refreshed ' + Math.round(h / 24) + ' day(s) ago. The morning sync may not have run. Ask Claude to run a refresh.</div>';
  }

  function notionUrl(id) { return 'https://www.notion.so/' + String(id || '').replace(/-/g, ''); }

  return { load, cityKey, metrosOf, esc, fmtDate, daysUntil, countdown, copy, copyBtn, emailCell, liLink, staleBanner, notionUrl, METRO };
})();
