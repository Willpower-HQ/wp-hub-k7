(async () => {
  const { pipeline, meta, eventById, contactById } = await HUB.load();
  const E = HUB.esc;
  const id = new URLSearchParams(location.search).get('e');
  const ev = eventById[id];
  if (!ev) { document.getElementById('title').textContent = 'Event not found'; return; }
  document.title = 'Run of Show · ' + ev.name;
  document.getElementById('title').textContent = ev.name;
  document.getElementById('sub').textContent = 'Run of show · ' + HUB.fmtDate(ev.date) + (ev.venue ? ' · ' + ev.venue : '');

  // confirmed people for this event = assignable pool
  const confirmed = pipeline.filter(r => r.eventId === ev.id && r.status === 'CONFIRMED' && r.contactId)
    .map(r => { const c = contactById[r.contactId] || {}; return { id: r.contactId, name: c.name || r.name || 'Unknown', company: c.companyName || '' }; })
    .filter(p => p.name && p.name !== 'Unknown');
  const byId = {}; confirmed.forEach(p => byId[p.id] = p);

  const KEY = 'wp_ros_' + ev.id;
  const TEMPLATE = [
    { time: '5:00', title: 'Doors open, check-in, gifting suite' },
    { time: '5:30', title: 'Welcome + Willpower intro' },
    { time: '5:45', title: 'Panel 1' },
    { time: '6:30', title: 'Break + activations' },
    { time: '6:45', title: 'Panel 2 / Fireside' },
    { time: '7:30', title: 'Closing remarks' },
    { time: '7:45', title: 'Dinner + networking' },
  ];
  let uid = 1;
  const seed = () => TEMPLATE.map(s => ({ id: 's' + (uid++), time: s.time, title: s.title, people: [] }));
  let slots;
  try { const saved = JSON.parse(localStorage.getItem(KEY) || 'null'); slots = (saved && saved.slots) || seed(); } catch (e) { slots = seed(); }
  slots.forEach(s => { const n = parseInt((s.id || 's0').slice(1), 10); if (n >= uid) uid = n + 1; });
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ slots })); } catch (e) {} };

  const render = () => {
    document.getElementById('ros').innerHTML = slots.map((s, i) => {
      const options = confirmed.filter(p => !s.people.some(pp => pp.id === p.id))
        .map(p => '<option value="' + E(p.id) + '">' + E(p.name) + (p.company ? ' (' + E(p.company) + ')' : '') + '</option>').join('');
      return '<div class="ros-slot" data-i="' + i + '">'
        + '<div class="time"><input value="' + E(s.time || '') + '" data-f="time" placeholder="time"></div>'
        + '<div><input class="ttl" value="' + E(s.title || '') + '" data-f="title" placeholder="Segment title">'
        + '<div class="people">'
        + s.people.map(p => '<span class="ros-chip">' + E(p.name) + '<span class="x" data-rm="' + E(p.id) + '">&times;</span></span>').join('')
        + (confirmed.length ? '<select class="addp"><option value="">+ add speaker</option>' + options + '</select>' : '<span class="mut" style="font-size:12px">no confirmed people yet</span>')
        + '</div></div>'
        + '<div class="ctrls"><button data-up="' + i + '"' + (i === 0 ? ' disabled' : '') + '>&uarr;</button><button data-down="' + i + '"' + (i === slots.length - 1 ? ' disabled' : '') + '>&darr;</button><button data-del="' + i + '">&times;</button></div>'
        + '</div>';
    }).join('') || '<div class="empty">No slots. Add one above.</div>';

    // unslotted confirmed speakers
    const slotted = new Set(slots.flatMap(s => s.people.map(p => p.id)));
    const unslotted = confirmed.filter(p => !slotted.has(p.id));
    document.getElementById('pool').innerHTML = confirmed.length
      ? '<div class="ros-pool"><b>' + confirmed.length + '</b> confirmed for this event &middot; '
        + (unslotted.length ? '<b>' + unslotted.length + '</b> not yet on the schedule: ' + unslotted.slice(0, 20).map(p => '<span class="nm">' + E(p.name) + '</span>').join(', ') : 'everyone confirmed is placed')
        + '</div>'
      : '<div class="ros-pool">No confirmed guests yet. Confirm people on the event page and they will be assignable here.</div>';

    // wire
    document.querySelectorAll('.ros-slot').forEach(el => {
      const i = +el.dataset.i;
      el.querySelectorAll('input[data-f]').forEach(inp => inp.onchange = () => { slots[i][inp.dataset.f] = inp.value; save(); });
      const sel = el.querySelector('select.addp');
      if (sel) sel.onchange = () => { const p = byId[sel.value]; if (p) { slots[i].people.push({ id: p.id, name: p.name }); save(); render(); } };
      el.querySelectorAll('.x[data-rm]').forEach(x => x.onclick = () => { slots[i].people = slots[i].people.filter(p => p.id !== x.dataset.rm); save(); render(); });
    });
    document.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { const i = +b.dataset.up; [slots[i - 1], slots[i]] = [slots[i], slots[i - 1]]; save(); render(); });
    document.querySelectorAll('[data-down]').forEach(b => b.onclick = () => { const i = +b.dataset.down; [slots[i + 1], slots[i]] = [slots[i], slots[i + 1]]; save(); render(); });
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { slots.splice(+b.dataset.del, 1); save(); render(); });
  };

  document.getElementById('addSlot').onclick = () => { slots.push({ id: 's' + (uid++), time: '', title: '', people: [] }); save(); render(); };
  document.getElementById('resetRos').onclick = () => { if (confirm('Reset the run of show to the default template? Your changes for this event will be lost.')) { slots = seed(); save(); render(); } };
  render();
  document.getElementById('foot').textContent = 'Saves on this device' + (meta.lastSyncAt ? ' · data refreshed ' + new Date(meta.lastSyncAt).toLocaleDateString() : '');
})();
