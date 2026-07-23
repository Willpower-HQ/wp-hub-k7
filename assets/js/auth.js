/* Login gate + shared status store.
   - If firebase-config.js has an apiKey: require the team login, and store status edits in
     Firestore so they sync live to everyone.
   - If not configured: local mode (no login; edits persist in this browser via localStorage).
   Exposes window.WP_AUTH: onReady(cb), watchStatus(eventId, cb)->unsub, setStatus(eventId, contactId, status). */
window.WP_AUTH = (() => {
  const cfg = window.WP_FIREBASE || {};
  const enabled = !!cfg.apiKey && typeof firebase !== 'undefined';
  const teamEmail = window.WP_TEAM_EMAIL || 'team@drinkwillpower.com';
  let db = null, ready = false;
  const readyCbs = [];
  const fireReady = () => { ready = true; readyCbs.splice(0).forEach(cb => { try { cb(); } catch (e) {} }); };

  // ----- login gate -----
  function gate(auth) {
    if (document.getElementById('wpGate')) return;
    const g = document.createElement('div');
    g.id = 'wpGate';
    g.innerHTML = '<div class="wpgate-box">'
      + '<img src="assets/img/willpower-logo.png" alt="Willpower" class="wpgate-logo">'
      + '<div class="wpgate-t">Outreach HQ</div>'
      + '<div class="wpgate-s">Enter the team password to continue.</div>'
      + '<input id="wpGatePw" type="password" placeholder="Team password" autocomplete="current-password">'
      + '<button id="wpGateBtn" class="primary">Enter</button>'
      + '<div id="wpGateErr" class="wpgate-err"></div></div>';
    document.body.appendChild(g);
    const pw = g.querySelector('#wpGatePw'), btn = g.querySelector('#wpGateBtn'), err = g.querySelector('#wpGateErr');
    const submit = () => {
      err.textContent = ''; btn.disabled = true; btn.textContent = 'Checking...';
      auth.signInWithEmailAndPassword(teamEmail, pw.value).catch(e => {
        btn.disabled = false; btn.textContent = 'Enter';
        err.textContent = /password|credential|invalid/i.test(e.message) ? 'Wrong password. Try again.' : e.message;
      });
    };
    btn.onclick = submit;
    pw.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    setTimeout(() => pw.focus(), 50);
  }
  function ungate() { const g = document.getElementById('wpGate'); if (g) g.remove(); }

  function boot() {
    if (!enabled) { fireReady(); return; }         // local mode
    try {
      firebase.initializeApp(cfg);
      db = firebase.firestore();
      const auth = firebase.auth();
      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
      auth.onAuthStateChanged(u => {
        if (u) { ungate(); if (!ready) fireReady(); }
        else { gate(auth); }
      });
    } catch (e) { console.warn('Firebase init failed, local mode:', e); fireReady(); }
  }

  // ----- status store -----
  const lkey = eid => 'wp_status_' + eid;
  function localGet(eid) { try { return JSON.parse(localStorage.getItem(lkey(eid)) || '{}'); } catch (e) { return {}; } }
  function localSet(eid, map) { try { localStorage.setItem(lkey(eid), JSON.stringify(map)); } catch (e) {} }

  function watchStatus(eventId, cb) {
    if (!enabled || !db) { cb(localGet(eventId)); return () => {}; }
    return db.collection('overrides').doc('event_' + eventId)
      .onSnapshot(doc => cb(((doc.data() || {}).status) || {}), err => { console.warn(err); cb({}); });
  }
  async function setStatus(eventId, contactId, status) {
    if (!enabled || !db) {
      const m = localGet(eventId);
      if (!status || status === 'TO CONTACT') delete m[contactId]; else m[contactId] = status;
      localSet(eventId, m);
      // notify local watchers on next tick
      (WP_AUTH._localWatchers[eventId] || []).forEach(cb => cb(m));
      return;
    }
    const ref = db.collection('overrides').doc('event_' + eventId);
    const FV = firebase.firestore.FieldValue;
    if (!status || status === 'TO CONTACT') {
      await ref.set({ status: { [contactId]: FV.delete() } }, { merge: true }).catch(async () => {});
    } else {
      await ref.set({ status: { [contactId]: status } }, { merge: true });
    }
  }

  // local-mode watcher registry so setStatus updates open views
  const _localWatchers = {};
  const localWatch = (eventId, cb) => { (_localWatchers[eventId] = _localWatchers[eventId] || []).push(cb); };

  boot();
  return {
    enabled,
    onReady: cb => { if (ready) cb(); else readyCbs.push(cb); },
    watchStatus: (eventId, cb) => {
      if (!enabled) { localWatch(eventId, cb); cb(localGet(eventId)); return () => {}; }
      return watchStatus(eventId, cb);
    },
    setStatus,
    _localWatchers,
  };
})();
