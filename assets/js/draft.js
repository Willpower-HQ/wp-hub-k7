/* One-click outreach drafts. Opens a Gmail compose prefilled and CC'd to Bill.
   The human reviews and sends. Bill's voice: direct, specific, no em dashes, closes "Best," with no name. */
window.WP_DRAFT = (() => {
  const CC = 'bill@drinkwillpower.com';
  const first = name => ((name || '').trim().split(/\s+/)[0] || 'there').replace(/[^A-Za-z'.-]/g, '') || 'there';

  function kindFor(item) {
    const row = item.row || {}, cat = (item.c.category || []).map(x => (x || '').toUpperCase());
    if (row.role === 'Speaker target' || cat.some(x => x.includes('SPEAKER'))) return 'speaker';
    if (row.role === 'Vendor' || row.role === 'Sponsor guest' || row.vendorType || cat.some(x => x.includes('VENDOR') || x.includes('SPONSOR'))) return 'vendor';
    return 'invite';
  }

  function template(kind, c, ev) {
    const f = first(c.name), co = c.companyName || c.company || 'your team';
    const when = HUB.fmtDate(ev.date), venue = ev.venue || ev.locationRaw || '';
    const at = venue ? ' at ' + venue : '';
    if (kind === 'speaker') return {
      subject: 'Speaking at ' + ev.name + '?',
      body: 'Hi ' + f + ',\n\nWe are building the lineup for ' + ev.name + ' on ' + when + at + '. Given what you have built at ' + co + ', you would be a strong voice in the room. Open to a quick call about a speaking spot?\n\nBest,',
    };
    if (kind === 'vendor') return {
      subject: co + ' x ' + ev.name,
      body: 'Hi ' + f + ',\n\n' + ev.name + ' is ' + when + at + ', a curated room of founders and operators in wellness and CPG. We would love to feature ' + co + ' in the gifting suite. Can we get product in front of the guests? Happy to send details.\n\nBest,',
    };
    return {
      subject: ev.name + ' on ' + when,
      body: 'Hi ' + f + ',\n\n' + ev.name + ' is happening ' + when + at + '. We are bringing together founders and operators across wellness and CPG for a focused evening, and we would love to have ' + co + ' there. Are you around?\n\nBest,',
    };
  }

  function open(c, ev, kind) {
    if (!c || !c.email) return;
    const t = template(kind || 'invite', c, ev);
    const url = 'https://mail.google.com/mail/?view=cm&fs=1&tf=1'
      + '&to=' + encodeURIComponent(c.email)
      + '&cc=' + encodeURIComponent(CC)
      + '&su=' + encodeURIComponent(t.subject)
      + '&body=' + encodeURIComponent(t.body);
    window.open(url, '_blank', 'noopener');
  }

  return { open, kindFor, template };
})();
