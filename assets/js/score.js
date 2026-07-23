/* Recommendation engine: buckets contacts into Speakers / Vendors / Cold Invite for an event,
   and surfaces anyone already in motion (contacted -> confirmed) at the top.
   Pure functions, testable in console: SCORE.recommend(contacts, pipeline, event, eventById, opts) */
const SCORE = (() => {
  const TIER_W = { 'Tier A': 40, 'Connectors': 35, 'Founders': 35, 'Investors': 30, 'Tier B': 30, 'Media': 25, 'GROW NY': 22, 'Tier C': 20 };
  const VENDOR_INDUSTRIES = ['WELLNESS','FITNESS','FOOD','BEVERAGE','F&B','BEAUTY','HEALTH','SUPPLEMENT','CPG','NUTRITION'];
  // higher = more advanced / float higher in "in progress"
  const STATUS_RANK = {
    'CONFIRMED': 100, 'NEGOTIATIONS': 90, 'ENGAGED': 85,
    'FINAL REMINDER SENT': 70, '3RD FOLLOW UP': 66, '2ND FOLLOW UP': 62, '1ST FOLLOW UP': 58,
    'INTERESTED': 55, 'CONTACTED': 50, 'BACKUP': 30, 'BOUNCED EMAIL': 10, 'TO CONTACT': 0, 'DECLINED': -10,
  };
  const IN_MOTION = new Set(['CONTACTED','INTERESTED','1ST FOLLOW UP','2ND FOLLOW UP','3RD FOLLOW UP','FINAL REMINDER SENT','ENGAGED','NEGOTIATIONS','CONFIRMED']);

  const has = (arr, v) => (arr || []).some(x => (x || '').toUpperCase().includes(v));

  function speakerScore(c, hist) {
    let s = 0, why = [];
    if (has(c.category, 'SPEAKER')) { s += 100; why.push('speaker category'); }
    else if (c.seniority === 'C-SUITE' || c.wpTier === 'Founders') { s += 60; why.push('c-suite / founder'); }
    else return null;
    if (c.wpTier === 'Tier A') { s += 15; why.push('Tier A'); }
    if (hist.spoke) { s += 12; why.push('spoke before'); }
    if (has(c.category, 'VIP')) { s += 10; why.push('VIP'); }
    if (c.email && c.emailStatus === 'ok') s += 8;
    return { s, why };
  }
  function vendorScore(c, hist) {
    let s = 0, why = [];
    if (has(c.category, 'VENDOR')) { s += 100; why.push('vendor'); }
    else if (has(c.category, 'SPONSOR')) { s += 90; why.push('sponsor'); }
    else if (VENDOR_INDUSTRIES.some(k => (c.industry || '').toUpperCase().includes(k))) { s += 55; why.push((c.industry||'').toLowerCase()); }
    else return null;
    if (hist.vendor) { s += 15; why.push('vendor before'); }
    if (hist.sentProduct) { s += 8; why.push('sent product'); }
    if (c.partnerTier) s += 10;
    if (c.email && c.emailStatus === 'ok') s += 8;
    return { s, why };
  }
  function coldScore(c) {
    let s = 0, why = [];
    s += TIER_W[c.wpTier] || 10;
    if (c.wpTier) why.push(c.wpTier);
    if (has(c.category, 'VIP')) { s += 20; why.push('VIP'); }
    else if (has(c.category, 'GENERAL - TARGET')) s += 10;
    if (c.seniority === 'C-SUITE') { s += 15; why.push('c-suite'); }
    else if (c.seniority === 'VP/SENIOR LEADERSHIP' || c.seniority === 'DIRECTOR') s += 8;
    if (c.email && c.emailStatus === 'ok') s += 15; else s -= 5;
    return { s, why };
  }
  function historyOf(rows, eventById, contactId) {
    const past = (rows || []).filter(r => r.contactId === contactId).filter(r => {
      const e = eventById[r.eventId];
      return e && e.date && new Date(e.date) < new Date();
    });
    return {
      spoke: past.some(r => r.role === 'Speaker target' && r.status === 'CONFIRMED'),
      vendor: past.some(r => r.role === 'Sponsor guest' || r.role === 'Vendor'),
      sentProduct: past.some(r => r.sentProduct),
      attended: past.filter(r => r.status === 'CONFIRMED').length,
    };
  }
  const ROLE_BUCKET = { 'Speaker target': 'speakers', 'Sponsor guest': 'vendors', 'Vendor': 'vendors', 'Attendee target': 'cold', 'VIP host': 'cold' };

  function recommend(contacts, pipeline, event, eventById, opts) {
    opts = opts || {};
    const rowsForEvent = {};
    (pipeline || []).forEach(r => { if (r.eventId === event.id && r.contactId) rowsForEvent[r.contactId] = r; });

    const buckets = { inprogress: [], speakers: [], vendors: [], cold: [] };
    contacts.forEach(c => {
      const row = rowsForEvent[c.id];
      const inCity = event.cityKey && (c.metro || []).includes(event.cityKey);
      if (!row && !inCity && !opts.includeUnknown) return;
      if (!row && opts.includeUnknown && (c.metro || []).length && event.cityKey && !inCity) return;
      if (row && row.status === 'DECLINED') return;

      const hist = historyOf(pipeline, eventById, c.id);
      const sp = speakerScore(c, hist), ve = vendorScore(c, hist);
      let bucket, score, why;
      if (row && ROLE_BUCKET[row.role]) {
        bucket = ROLE_BUCKET[row.role];
        const sc = bucket === 'speakers' ? (sp || { s: 50, why: [] }) : bucket === 'vendors' ? (ve || { s: 50, why: [] }) : coldScore(c);
        score = sc.s; why = sc.why;
      } else if (sp) { bucket = 'speakers'; score = sp.s; why = sp.why; }
      else if (ve) { bucket = 'vendors'; score = ve.s; why = ve.why; }
      else { const co = coldScore(c); bucket = 'cold'; score = co.s; why = co.why; }

      const status = row ? row.status : null;
      const rank = status ? (STATUS_RANK[status] ?? 0) : -1;
      const item = { c, row: row || null, bucket, score, why, hist, status, rank, vendorType: row && row.vendorType, logistics: row && row.logistics };
      buckets[bucket].push(item);
      if (status && IN_MOTION.has(status)) buckets.inprogress.push(item);
    });

    // in-progress: most advanced first (confirmed -> contacted)
    buckets.inprogress.sort((a, c) => c.rank - a.rank || c.score - a.score);
    // within each recommendation bucket, people already in motion float above cold ones
    ['speakers', 'vendors', 'cold'].forEach(k => buckets[k].sort((a, c) => c.rank - a.rank || c.score - a.score));
    return buckets;
  }

  return { recommend, historyOf, STATUS_RANK, IN_MOTION };
})();
