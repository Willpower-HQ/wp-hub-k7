#!/usr/bin/env python3
"""Apply Gmail-derived facts onto data/*.json after build_data.py has run.

Inputs (all optional, in sync/state/):
  bounces.json          {"bounces":[{"email","date",...}]}
  gmail_backfill.json   {"recipients": {"<email>": {"lastOutbound","outboundCount","lastInbound","threadIds","labels":[...],"subjects":[...]}}}

Outputs: updates data/contacts.json and data/pipeline.json in place, computes
followUp, and prints (a) contacts needing Notion bounce writes, (b) sent-mail
recipients not found in CONTACTS (auto-add candidates).
Run: python3 sync/apply_gmail.py
"""
import json, os, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
STATE = os.path.join(ROOT, 'sync', 'state')

def jload(p, default):
    try:
        return json.load(open(p))
    except Exception:
        return default

contacts_doc = jload(os.path.join(DATA, 'contacts.json'), None)
pipeline_doc = jload(os.path.join(DATA, 'pipeline.json'), None)
events_doc = jload(os.path.join(DATA, 'events.json'), None)
meta = jload(os.path.join(DATA, 'meta.json'), {'alerts': []})
if not contacts_doc:
    raise SystemExit('run sync/build_data.py first')

contacts = contacts_doc['contacts']
pipeline = pipeline_doc['rows'] if pipeline_doc else []
events = {e['id']: e for e in (events_doc['events'] if events_doc else [])}
by_email = {c['email']: c for c in contacts if c.get('email')}
by_id = {c['id']: c for c in contacts}
today = datetime.date.today()

# ---- 1. bounces ----
notion_writes = []
bounces = jload(os.path.join(STATE, 'bounces.json'), {}).get('bounces', [])
for b in bounces:
    em = b['email'].lower()
    c = by_email.get(em)
    if not c:
        # maybe already cleared on a prior run; check bouncedEmail
        c = next((x for x in contacts if (x.get('bouncedEmail') or '').lower() == em), None)
        if not c:
            meta['alerts'].append({'type': 'bounce', 'text': 'Bounced address not in CRM: ' + em})
            continue
    if c['emailStatus'] != 'bounced':
        c['emailStatus'] = 'bounced'
        c['bouncedEmail'] = em
        c['email'] = None
        notion_writes.append({'contactId': c['id'], 'name': c['name'], 'action': 'bounce', 'email': em, 'date': b.get('date')})

# ---- 2. sent/reply backfill onto pipeline ----
bf = jload(os.path.join(STATE, 'gmail_backfill.json'), {}).get('recipients', {})
label_to_events = {}
for e in events.values():
    for l in e.get('gmailLabels', []):
        label_to_events.setdefault(l, []).append(e['id'])

unknown = []
for em, info in bf.items():
    em = em.lower()
    c = by_email.get(em)
    if not c:
        unknown.append({'email': em, 'lastOutbound': info.get('lastOutbound'), 'subjects': info.get('subjects', [])[:2]})
        continue
    if info.get('lastOutbound') and (not c.get('lastContactDate') or info['lastOutbound'] > c['lastContactDate']):
        c['lastContactDate'] = info['lastOutbound']
    rows = [r for r in pipeline if r['contactId'] == c['id']]
    # attribute: label match, else single upcoming row
    target = None
    ev_ids = set()
    for l in info.get('labels', []):
        for eid in label_to_events.get(l, []):
            ev_ids.add(eid)
    cand = [r for r in rows if r['eventId'] in ev_ids]
    if not cand:
        up = [r for r in rows if events.get(r['eventId'], {}).get('date', '') >= str(today)]
        cand = up if len(up) == 1 else []
    for r in cand:
        r['lastOutbound'] = max(filter(None, [r.get('lastOutbound'), info.get('lastOutbound')]), default=None)
        r['lastInbound'] = max(filter(None, [r.get('lastInbound'), info.get('lastInbound')]), default=None)
        r['outboundCount'] = max(r.get('outboundCount') or 0, info.get('outboundCount') or 0)

# ---- 3. followUp computation ----
HUMAN_STATES = {'ENGAGED', 'NEGOTIATIONS', 'CONFIRMED', 'DECLINED', 'BACKUP', 'BOUNCED EMAIL'}
SUGGEST = {0: 'first outreach', 1: '1st follow-up', 2: '2nd follow-up', 3: '3rd follow-up', 4: 'final reminder'}
def busdays(d1, d2):
    n, d = 0, d1
    while d < d2:
        d += datetime.timedelta(days=1)
        if d.weekday() < 5:
            n += 1
    return n
for r in pipeline:
    r.setdefault('followUp', {'needed': False})
    e = events.get(r['eventId'])
    if not e or not e.get('date') or e['date'] < str(today):
        r['followUp'] = {'needed': False}
        continue
    if r.get('status') in HUMAN_STATES or not r.get('lastOutbound'):
        r['followUp'] = {'needed': False}
        continue
    if r.get('lastInbound') and r['lastInbound'] >= r['lastOutbound']:
        r['followUp'] = {'needed': False}
        continue
    lo = datetime.date.fromisoformat(r['lastOutbound'][:10])
    days = busdays(lo, today)
    if days >= 5:
        r['followUp'] = {'needed': True, 'daysSince': (today - lo).days,
                         'suggest': SUGGEST.get(min(r.get('outboundCount') or 1, 4), 'follow-up')}
    else:
        r['followUp'] = {'needed': False}

# ---- write ----
nfu = sum(1 for r in pipeline if r['followUp'].get('needed'))
nb = sum(1 for c in contacts if c['emailStatus'] == 'bounced')
if nb:
    meta['alerts'].append({'type': 'bounce', 'text': str(nb) + ' contacts have bounced emails (flagged, cleared, kept in CRM).'})
if nfu:
    meta['alerts'].append({'type': 'followup', 'text': str(nfu) + ' pipeline contacts are waiting on a follow-up.'})
json.dump(contacts_doc, open(os.path.join(DATA, 'contacts.json'), 'w'), separators=(',', ':'), sort_keys=True)
if pipeline_doc:
    json.dump(pipeline_doc, open(os.path.join(DATA, 'pipeline.json'), 'w'), separators=(',', ':'), sort_keys=True)
json.dump(meta, open(os.path.join(DATA, 'meta.json'), 'w'), separators=(',', ':'), sort_keys=True)

print('followUp needed:', nfu, '| bounced contacts:', nb)
print('\nNOTION WRITES NEEDED (bounce flags):')
print(json.dumps(notion_writes, indent=1))
print('\nAUTO-ADD CANDIDATES (sent-mail recipients not in CRM, pre-skiplist):')
print(json.dumps(unknown[:40], indent=1))
