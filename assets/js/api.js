/* Talks to the Netlify status function. If the function is not deployed (e.g. still on GitHub Pages),
   every call fails softly and the caller falls back to on-device localStorage. */
window.WP_API = (() => {
  const URL = '/api/status';
  let configured = null; // null = unknown, true/false once checked
  async function getStatuses(eventId) {
    try {
      const r = await fetch(URL + '?event=' + encodeURIComponent(eventId), { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      configured = !!j.configured;
      return j.configured && j.statuses ? j.statuses : null;
    } catch (e) { configured = false; return null; }
  }
  async function setStatus(payload) {
    try {
      const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      return r.ok;
    } catch (e) { return false; }
  }
  return { getStatuses, setStatus, isConfigured: () => configured };
})();
