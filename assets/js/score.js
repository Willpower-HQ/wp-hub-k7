/* Event view builder.
   For Willpower (internal) events: curated invite suggestions from the database,
   boosted by whoever was on similar past events, plus role buckets for people already on the list.
   For external events: only people we know are attending (pipeline rows), never a database dump.
   SCORE.buildEventView(contacts, pipeline, event, eventById, events, opts) */
const SCORE = (() => {
  const TIER_W = { 'Tier A': 40, 'Connectors': 35, 'Founders': 35, 'Investors': 30, 'Tier B': 30, 'Media': 25, 'GROW NY': 22, 'Tier C': 20 };
  const VENDOR_INDUSTRIES = ['WELLNESS','FITNESS','FOOD','BEVERAGE','F&B','BEAUTY','HEALTH','SUPPLEMENT','CPG','NUTRITION'];
  const STATUS_RANK = {
    'CONFIRMED': 100, 'NEGOTIATIONS': 90, 'ENGAGED': 85, 'FINAL REMINDER SENT': 70,
    '3RD FOLLOW UP': 66, '2ND FOLLOW UP': 62, '1ST FOLLOW UP': 58, 'INTERESTED': 55,
    'CONTACTED': 50, 'BACKUP': 30, 'BOUNCED EMAIL': 10, 'TO CONTACT': 0, 'DECLINED': -10,
  };
  const IN_MOTION = new Set(['CONTACTED','INTERESTED','1ST FOLLOW UP','2ND FOLLOW UP','3RD FOLLOW UP','FINAL REMINDER SENT','ENGAGED','NEGOTIATIONS','CONFIRMED']);
  const SERIES = ['wellness','lounge','world','sports','performance','catalyst','house','padel','holiday','roundtable','summit','f1','formula','plunge','dinner'];
  const SUGGEST_CAP = 120;

  const has = (arr, v) => (arr || []).some(x => (x || '').toUpperCase().includes(v));
  const tokens = s => (s || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const isProductVendor = (row, c) => !!(row && (row.role === 'Vendor' || row.role === 'Sponsor guest' || (row.vendorType && row.vendorType.length))) || has((c || {}).category, 'VENDOR') || has((c || {}).category, 'SPONSOR');

  function similarPast(event, events) {
    const now = new Date();
    const evTok = new Set(tokens(event.name).filter(t => SERIES.includes(t)));
    return (events || []).filter(p => p.id !== event.id && p.date && new Date(p.date) < now)
      .filter(p => {
        const pt = tokens(p.name);
        const shareSeries = pt.some(t => evTok.has(t));
        const sameCity = event.cityKey && p.cityKey === event.cityKey;
        return shareSeries || (sameCity && (p.type || []).some(t => (event.type || []).includes(t)));
      });
  }

  function fitScore(c) {
    let s = 0, why = [];
    s += TIER_W[c.wpTier] || 8;
    if (c.wpTier) why.push(c.wpTier);
    if (has(c.category, 'VIP')) { s += 22; why.push('VIP'); }
    else if (has(c.category, 'GENERAL - TARGET')) s += 10;
    if (has(c.category, 'SPEAKER')) { s += 12; why.push('past speaker'); }
    if (c.seniority === 'C-SUITE') { s += 15; why.push('c-suite'); }
    else if (c.seniority === 'VP/SENIOR LEADERSHIP' || c.seniority === 'DIRECTOR') s += 8;
    if (VENDOR_INDUSTRIES.some(k => (c.industry || '').toUpperCase().includes(k))) s += 6;
    if (c.email && c.emailStatus === 'ok') s += 12; else s -= 4;
    return { s, why };
  }

  function buildEventView(contacts, pipeline, event, eventById, events, opts) {
    opts = opts || {};
    const rowsForEvent = {};
    const eventRows = [];
    (pipeline || []).forEach(r => { if (r.eventId === event.id) { eventRows.push(r); if (r.contactId) rowsForEvent[r.contactId] = r; } });

    // contacts who were on a similar past event -> boost + reason
    const pastEvents = similarPast(event, events);
    const pastIds = new Set(pastEvents.map(e => e.id));
    const pastByContact = {};
    (pipeline || []).forEach(r => {
      if (r.contactId && pastIds.has(r.eventId)) {
        const e = eventById[r.eventId];
        if (e && (!pastByContact[r.contactId] || (e.date > (eventById[pastByContact[r.contactId].eventId] || {}).date)))
          pastByContact[r.contactId] = r;
      }
    });

    const cById = {}; contacts.forEach(c => cById[c.id] = c);
    const mkItem = (c, row, score, why, extra) => Object.assign({ c, row: row || null, status: row ? row.status : null,
      rank: row ? (STATUS_RANK[row.status] ?? 0) : -1, score: score || 0, why: why || [],
      vendorType: row && row.vendorType }, extra || {});

    const buckets = { inprogress: [], speakers: [], vendors: [], attendees: [], suggested: [] };

    if (!event.internal) {
      // external event: ONLY people we know are attending (pipeline rows). Never a DB dump.
      eventRows.forEach(r => {
        const c = (r.contactId && cById[r.contactId]) || { name: r.companyName || r.name || 'Unknown', companyName: r.companyName };
        const it = mkItem(c, r, 0, [r.role, r.relationship].filter(Boolean));
        buckets.attendees.push(it);
        if (IN_MOTION.has(r.status)) buckets.inprogress.push(it);
      });
    } else {
      // internal event: role buckets for people on the list + curated suggestions from the DB
      const onList = new Set();
      eventRows.forEach(r => {
        const c = (r.contactId && cById[r.contactId]) || { name: r.companyName || r.name || 'Unknown', companyName: r.companyName };
        if (r.contactId) onList.add(r.contactId);
        const why = [];
        if (r.vendorType) why.push(...(Array.isArray(r.vendorType) ? r.vendorType : [r.vendorType]));
        const it = mkItem(c, r, 0, why.length ? why : [r.role].filter(Boolean));
        if (r.status === 'DECLINED') return;
        if (isProductVendor(r, c)) buckets.vendors.push(it);
        else if (r.role === 'Speaker target' || has(c.category, 'SPEAKER')) buckets.speakers.push(it);
        else buckets.attendees.push(it);
        if (IN_MOTION.has(r.status)) buckets.inprogress.push(it);
      });

      // suggestions: not already on the list, city-gated, curated + boosted, capped
      const sugg = [];
      contacts.forEach(c => {
        if (onList.has(c.id)) return;
        const inCity = event.cityKey && (c.metro || []).includes(event.cityKey);
        if (!inCity && !(opts.includeUnknown && !(c.metro || []).length)) return;
        if (c.emailStatus === 'bounced') return;
        const f = fitScore(c);
        let score = f.s, why = f.why.slice();
        const pr = pastByContact[c.id];
        if (pr) { score += 45; why.unshift('was on ' + (eventById[pr.eventId] || {}).name); }
        sugg.push(mkItem(c, null, score, why, { suggested: true }));
      });
      sugg.sort((a, b) => b.score - a.score);
      buckets.suggested = sugg.slice(0, opts.showAllSuggested ? sugg.length : SUGGEST_CAP);
      buckets.suggestedTotal = sugg.length;
    }

    buckets.inprogress.sort((a, b) => b.rank - a.rank || b.score - a.score);
    ['speakers', 'vendors', 'attendees'].forEach(k => buckets[k].sort((a, b) => b.rank - a.rank || b.score - a.score));

    // "All" = every unique person for this event (on-list + suggestions), most-advanced first
    const seen = new Set(), all = [];
    ['speakers', 'vendors', 'attendees', 'suggested'].forEach(k => (buckets[k] || []).forEach(it => {
      const key = it.c.id || ('n:' + (it.c.name || ''));
      if (seen.has(key)) return; seen.add(key); all.push(it);
    }));
    all.sort((a, b) => b.rank - a.rank || b.score - a.score);
    buckets.all = all;
    return { internal: !!event.internal, buckets, similarPast: pastEvents.map(e => e.name), eventRows };
  }

  // group a list of items by company name (Notion-style). Returns [{company, items}] preserving order.
  function groupByCompany(items) {
    const order = [], map = {};
    items.forEach(it => {
      const co = (it.c.companyName || it.c.company || 'Other').trim() || 'Other';
      if (!map[co]) { map[co] = []; order.push(co); }
      map[co].push(it);
    });
    // companies with more people (and better status) first
    return order.map(co => ({ company: co, items: map[co], best: Math.max(...map[co].map(i => i.rank)) , size: map[co].length }))
      .sort((a, b) => b.best - a.best || b.size - a.size || a.company.localeCompare(b.company));
  }

  return { buildEventView, groupByCompany, STATUS_RANK, IN_MOTION };
})();
