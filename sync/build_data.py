#!/usr/bin/env python3
"""Merge raw Notion pulls (sync/state/raw/*.json) into the dashboard's data/*.json.

Raw files are verbatim "results" arrays from notion-query-data-sources SQL pages:
  contacts_p*.json, companies_p*.json, pipeline_p*.json, events_p0.json
Run: python3 sync/build_data.py   (from the wp-hub repo root)
Idempotent; safe to re-run. Preserves gmail-derived fields from an existing
data/pipeline.json + data/contacts.json when present (lastOutbound, followUp,
emailStatus=bounced set by the Gmail scan) unless raw data supersedes them.
"""
import json, glob, os, re, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'sync', 'state', 'raw')
DATA = os.path.join(ROOT, 'data')
os.makedirs(DATA, exist_ok=True)

METRO = json.load(open(os.path.join(ROOT, 'sync', 'aliases.json')))
LOC_TO_METRO = {l.upper(): m for m, locs in METRO.items() for l in locs}
LABELS = json.load(open(os.path.join(ROOT, 'sync', 'labels.json'))) if os.path.exists(os.path.join(ROOT, 'sync', 'labels.json')) else {}


def load_pages(prefix):
    rows = []
    for f in sorted(glob.glob(os.path.join(RAW, prefix + '_p*.json'))):
        with open(f) as fh:
            part = json.load(fh)
            rows.extend(part.get('results', part) if isinstance(part, dict) else part)
    # dedupe by url (pages can overlap if table shifted between queries)
    seen, out = set(), []
    for r in rows:
        u = r.get('url')
        if u and u in seen:
            continue
        seen.add(u)
        out.append(r)
    return out


def page_id(url):
    if not url:
        return None
    m = re.search(r'([0-9a-f]{32})', url.replace('-', ''))
    return m.group(1) if m else url


def rel_ids(v):
    """Relation columns come as JSON arrays of page URLs."""
    if not v:
        return []
    try:
        arr = json.loads(v) if isinstance(v, str) else v
    except (ValueError, TypeError):
        return []
    return [page_id(u) for u in arr if u]


def multi(v):
    if not v:
        return []
    try:
        arr = json.loads(v) if isinstance(v, str) else v
        return arr if isinstance(arr, list) else [str(arr)]
    except (ValueError, TypeError):
        return [v]


def city_key(raw):
    if not raw:
        return None
    s = raw.upper()
    if re.search(r'NEW YORK|NYC|MANHATTAN|BROOKLYN|SOHO|TRIBECA', s):
        return 'NYC'
    if re.search(r'LOS ANGELES|\bLA\b|ANAHEIM|PALM SPRINGS|CALIFORNIA', s):
        return 'CALIFORNIA'
    if re.search(r'MIAMI|MIAMI BEACH', s):
        return 'MIAMI'
    if re.search(r'LAS VEGAS|\bVEGAS\b', s):
        return 'LAS VEGAS'
    for k in ('AUSTIN', 'DALLAS', 'HOUSTON', 'SAN ANTONIO', 'CHICAGO'):
        if k in s:
            return k
    for loc, m in LOC_TO_METRO.items():
        if loc in s:
            return m
    return None


def pick(row, *names):
    """Case/space-insensitive column getter (COMPANIES schema discovered at pull time)."""
    low = {re.sub(r'[^a-z]', '', k.lower()): v for k, v in row.items()}
    for n in names:
        v = low.get(re.sub(r'[^a-z]', '', n.lower()))
        if v not in (None, ''):
            return v
    return None


now = datetime.datetime.now().astimezone().isoformat(timespec='seconds')
alerts = []

# ---- companies ----
companies = {}
for r in load_pages('companies'):
    cid = page_id(r.get('url'))
    companies[cid] = {
        'name': pick(r, 'name', 'company name', 'company', 'title'),
        'industry': pick(r, 'industry'),
        'partnerTier': pick(r, 'partnertier', 'tier'),
        'revenue': pick(r, 'revenue', 'companyrevenue'),
        'website': pick(r, 'website', 'domain', 'url2', 'site'),
    }

# ---- previous gmail-derived state (preserved across rebuilds) ----
prev_contacts, prev_pipeline = {}, {}
try:
    for c in json.load(open(os.path.join(DATA, 'contacts.json')))['contacts']:
        prev_contacts[c['id']] = c
except Exception:
    pass
try:
    for p in json.load(open(os.path.join(DATA, 'pipeline.json')))['rows']:
        prev_pipeline[p['id']] = p
except Exception:
    pass

# ---- contacts ----
contacts, email_seen = [], {}
for r in load_pages('contacts'):
    cid = page_id(r.get('url'))
    comp = rel_ids(r.get('companyRel'))
    co = companies.get(comp[0]) if comp else None
    loc = multi(r.get('loc'))
    metro = sorted({LOC_TO_METRO.get((l or '').upper(), (l or '').upper()) for l in loc if l})
    email = (r.get('email') or '').strip().lower() or None
    notes = r.get('notes') or ''
    prev = prev_contacts.get(cid, {})
    bounced = 'BOUNCED' in notes.upper() or prev.get('emailStatus') == 'bounced'
    c = {
        'id': cid,
        'name': (r.get('name') or '').strip(),
        'email': None if bounced and not email else email,
        'emailStatus': 'bounced' if bounced else ('ok' if email else 'missing'),
        'bouncedEmail': prev.get('bouncedEmail') or (email if bounced else None),
        'linkedin': r.get('linkedin'),
        'title': r.get('title'),
        'companyId': comp[0] if comp else None,
        'companyName': co['name'] if co else None,
        'industry': co['industry'] if co else None,
        'partnerTier': co['partnerTier'] if co else None,
        'companyRevenue': co['revenue'] if co else None,
        'loc': loc, 'metro': metro,
        'category': multi(r.get('category')),
        'outreachStatus': r.get('status'),
        'seniority': r.get('seniority'),
        'wpTier': r.get('tier'),
        'source': multi(r.get('source')),
        'lastContactDate': r.get('lastContact'),
        'lastFeedback': r.get('feedback'),
        'notes': notes or None,
        'flags': {
            'leftCompany': bool(prev.get('flags', {}).get('leftCompany')),
            'possibleDuplicateOf': None,
        },
    }
    if email:
        if email in email_seen:
            c['flags']['possibleDuplicateOf'] = email_seen[email]
        else:
            email_seen[email] = cid
    contacts.append(c)

dupes = [c for c in contacts if c['flags']['possibleDuplicateOf']]
if dupes:
    alerts.append({'type': 'duplicates', 'text': str(len(dupes)) + ' possible duplicate contacts share an email with another row. Review in Notion.'})

# ---- events ----
events = []
for r in load_pages('events'):
    name = r.get('name') or ''
    labels = []
    for sub, ls in LABELS.items():
        if sub.lower() in name.lower():
            labels += ls
    events.append({
        'id': page_id(r.get('url')),
        'name': name,
        'date': r.get('dateStart'),
        'endDate': r.get('dateEnd') or None,
        'locationRaw': r.get('location'),
        'cityKey': city_key(r.get('location')),
        'venue': r.get('venue'),
        'type': multi(r.get('type')),
        'internal': r.get('internal') == 'Internal Event',
        'status': r.get('status'),
        'website': r.get('website'),
        'luma': r.get('luma'),
        'gmailLabels': labels,
    })
for e in events:
    if e['locationRaw'] and not e['cityKey']:
        alerts.append({'type': 'city', 'text': 'Event "' + e['name'] + '" city "' + e['locationRaw'] + '" is not in the metro alias map.'})

# ---- pipeline ----
pipeline = []
for r in load_pages('pipeline'):
    pid = page_id(r.get('url'))
    prev = prev_pipeline.get(pid, {})
    contact = rel_ids(r.get('contactRel'))
    event = rel_ids(r.get('eventRel'))
    pipeline.append({
        'id': pid,
        'name': r.get('name'),
        'contactId': contact[0] if contact else None,
        'eventId': event[0] if event else None,
        'role': r.get('role'),
        'status': r.get('status'),
        'relationship': r.get('relationship'),
        'owner': r.get('owner'),
        'topTarget': r.get('topTarget') == '__YES__',
        'speakerAngle': r.get('speakerAngle'),
        'notes': r.get('notes'),
        'sentProduct': bool(prev.get('sentProduct')),
        'lastOutbound': prev.get('lastOutbound'),
        'lastInbound': prev.get('lastInbound'),
        'outboundCount': prev.get('outboundCount', 0),
        'followUp': prev.get('followUp', {'needed': False}),
    })

# ---- merge per-event vendor tracker (statuses + vendor type) into pipeline ----
STATUS_RANK = {'CONFIRMED': 100, 'NEGOTIATIONS': 90, 'ENGAGED': 85, 'FINAL REMINDER SENT': 70,
               '3RD FOLLOW UP': 66, '2ND FOLLOW UP': 62, '1ST FOLLOW UP': 58, 'INTERESTED': 55,
               'CONTACTED': 50, 'BACKUP': 30, 'BOUNCED EMAIL': 10, 'TO CONTACT': 0, 'DECLINED': -10}
ROLE_FROM_CAT = {'VENDOR': 'Vendor', 'SPEAKER': 'Speaker target', 'ATTENDEE': 'Attendee target'}
contact_by_id = {c['id']: c for c in contacts}
pipe_by_key = {(p['contactId'], p['eventId']): p for p in pipeline if p['contactId']}

for vf in sorted(glob.glob(os.path.join(RAW, 'vendors_*.json'))):
    doc = json.load(open(vf))
    ev_id = page_id(doc.get('eventId'))
    for r in doc.get('results', []):
        cats = multi(r.get('category'))
        role = next((ROLE_FROM_CAT[c] for c in cats if c in ROLE_FROM_CAT), 'Attendee target')
        status = r.get('status') or 'TO CONTACT'
        vtype = multi(r.get('vendorType'))
        cid = (rel_ids(r.get('contactRel')) or [None])[0]
        coid = (rel_ids(r.get('companyRel')) or [None])[0]
        co = companies.get(coid) if coid else None
        # skip blank placeholder rows (no person, no company)
        if not cid and not co:
            continue
        if cid and (cid, ev_id) in pipe_by_key:
            p = pipe_by_key[(cid, ev_id)]
            if STATUS_RANK.get(status, 0) > STATUS_RANK.get(p.get('status'), 0):
                p['status'] = status
            if 'VENDOR' in cats:
                p['role'] = 'Vendor'
            if vtype:
                p['vendorType'] = vtype
            if r.get('logistics'):
                p['logistics'] = r.get('logistics')
        else:
            name = (contact_by_id.get(cid, {}).get('name') if cid else None) or (co['name'] if co else None) or 'Unknown vendor'
            row = {
                'id': page_id(r.get('url')), 'name': name, 'contactId': cid, 'eventId': ev_id,
                'role': role, 'status': status, 'relationship': None, 'owner': None,
                'topTarget': r.get('topTarget') == '__YES__', 'speakerAngle': None,
                'notes': (r.get('notes') or None), 'sentProduct': False, 'lastOutbound': None,
                'lastInbound': None, 'outboundCount': 0, 'followUp': {'needed': False},
                'vendorType': vtype or None, 'logistics': r.get('logistics'),
                'companyName': co['name'] if co else None, 'source': 'vendor-tracker',
            }
            pipeline.append(row)
            if cid:
                pipe_by_key[(cid, ev_id)] = row

# ---- write ----
def dump(fname, obj):
    with open(os.path.join(DATA, fname), 'w') as f:
        json.dump(obj, f, separators=(',', ':'), sort_keys=True)
    print(fname, os.path.getsize(os.path.join(DATA, fname)) // 1024, 'KB')

dump('contacts.json', {'generatedAt': now, 'contacts': contacts})
dump('events.json', {'generatedAt': now, 'events': events})
dump('pipeline.json', {'generatedAt': now, 'rows': pipeline})
if not os.path.exists(os.path.join(DATA, 'nearby-events.json')):
    dump('nearby-events.json', {'byEvent': {}})
meta = {'lastSyncAt': now, 'counts': {'contacts': len(contacts), 'companies': len(companies), 'events': len(events), 'pipeline': len(pipeline)}, 'alerts': alerts}
dump('meta.json', meta)
print('contacts:', len(contacts), 'companies:', len(companies), 'events:', len(events), 'pipeline:', len(pipeline), 'alerts:', len(alerts))
