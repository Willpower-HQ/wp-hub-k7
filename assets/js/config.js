/* Per-event goals (targets). Edit freely. Numbers are how many CONFIRMED of each you want.
   Set a specific event by its id in goalsById; otherwise a sensible default is inferred from the name. */
window.WP_CONFIG = {
  team: ['Bill', 'Kathleen', 'Joanie', 'Intern'], // who tasks can be assigned to; edit freely
  goalsById: {
    // '<eventId>': { speakers: 6, vendors: 20, guests: 120 },
    '2c938388847e808990b5cbffa358108a': { speakers: 6, vendors: 22, guests: 120 }, // NYC Wellness Lounge Aug 19
    '34338388847e80b99659fe562ed10ce8': { speakers: 12, vendors: 25, guests: 250 }, // World of Sports F1
  },
  goalsFor(ev) {
    if (this.goalsById[ev.id]) return this.goalsById[ev.id];
    const n = (ev.name || '').toLowerCase();
    if (/world of sports|summit|human performance/.test(n)) return { speakers: 12, vendors: 25, guests: 250 };
    if (/wellness house/.test(n)) return { speakers: 8, vendors: 20, guests: 150 };
    if (/wellness lounge/.test(n)) return { speakers: 6, vendors: 20, guests: 120 };
    if (/catalyst|roundtable|dinner/.test(n)) return { speakers: 4, vendors: 8, guests: 40 };
    return { speakers: 5, vendors: 12, guests: 80 };
  },
};
