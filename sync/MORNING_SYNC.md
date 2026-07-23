# Morning Sync Playbook

Run from the repo root: `/Users/joaniefelder/Downloads/PowerHouse/wp-hub`. Follow the steps in order. Never send email in this run. All Notion writes must be minimal and idempotent: write a field only when the value actually changed, and never downgrade a status a human set.

Data source URLs:
- CONTACTS: `collection://26138388-847e-80e2-99c9-000b15a33e58`
- COMPANIES: `collection://26138388-847e-8058-b71c-000b8b464764`
- EVENT PIPELINE: `collection://b93edddb-fb76-4579-ad2f-5d5c83fa18f9`
- EVENT CALENDAR: `collection://17a38388-847e-8104-8a6e-000b1b0c66cc`

## 0. Preflight
1. `git pull` in the repo.
2. Read `sync/state/lastSync.json` ({"lastSyncAt": ISO}) and `sync/state/processedMessageIds.json` (JSON array). If lastSync is older than 2 days, widen every Gmail `newer_than:` below to gap+1 days.

## 1. Incremental Notion pull
For each of the 4 data sources, SQL-query rows where `datetime("Last edited time") > datetime('<lastSyncAt minus 1 hour>')` selecting the same columns as the pages in `sync/state/raw/` (see build_data.py comments). Merge changed rows into the matching `sync/state/raw/*_p*.json` shard by url (replace the row if it exists in any shard, else append to the last shard). If a full shard set is missing, re-pull everything as in FIRST_RUN.md.

## 2. Bounce scan (Gmail)
Search `from:(mailer-daemon OR postmaster) newer_than:2d`. For each message not in processedMessageIds:
- Extract the failed recipient (look for `Final-Recipient: rfc822;`, "wasn't delivered to", "Address not found", "550").
- Match it (lowercase) to a CONTACTS row. If matched:
  - Notion: set EMAIL ADDRESS empty, prepend NOTES with `BOUNCED <today>: <address>. ` (keep existing notes).
  - Notion: any EVENT PIPELINE row for that contact whose Event date is in the future: set Status = BOUNCED EMAIL, unless Status is CONFIRMED or DECLINED.
- Record the message id as processed. Add an alert to meta later ("N bounces flagged: names").
Never delete a contact.

## 3. Left-company scan (Gmail)
Search `newer_than:2d ("no longer with" OR "no longer at" OR "is no longer" OR "has left the company")`. If the sender or subject maps to a contact: do NOT clear the email; add note `Possible job change <today> (autoresponder). `, set the contact's flag in contacts.json (`flags.leftCompany`), add a meta alert. These also go in the weekly digest Watch List.

## 4. Outbound scan (Gmail)
Search `in:sent newer_than:2d`. For each message not processed, for each To recipient matched to a contact:
- Notion CONTACTS: LAST CONTACT DATE = send date (only if newer than current). OUTREACH STATUS: if currently "Not contacted" or empty, set "Contacted". Never downgrade.
- Event attribution for EVENT PIPELINE: use the thread's label if it maps to an event (`sync/labels.json`), else subject contains the event name, else if the contact has exactly one pipeline row on an upcoming event use that. If still ambiguous, skip pipeline update and add a meta alert.
- On the attributed pipeline row: count OUR messages in the thread; set Status by count (1 CONTACTED, 2 1ST FOLLOW UP, 3 2ND FOLLOW UP, 4 3RD FOLLOW UP, 5+ FINAL REMINDER SENT) but ONLY if the current status is TO CONTACT, CONTACTED, or a FOLLOW UP state. Never touch ENGAGED, NEGOTIATIONS, CONFIRMED, DECLINED, BACKUP, BOUNCED EMAIL.
- Update pipeline.json fields: lastOutbound, outboundCount, gmailThreadIds.

## 5. Inbound scan (Gmail)
Search `in:inbox newer_than:2d`. For senders matched to contacts:
- Notion CONTACTS: LAST FEEDBACK = first ~200 chars of the reply snippet with date prefix; LAST CONTACT DATE = reply date if newer.
- Attributed pipeline row (same rules as step 4): if Status is CONTACTED or a FOLLOW UP state, set ENGAGED. Never auto-set CONFIRMED; instead add the reply to meta alerts as "reply to triage: <name>".
- pipeline.json: lastInbound.

## 6. Auto-add new contacts
From step 4's sent messages, collect To recipients with NO contact match. Skip anything matching `sync/skiplist.json` (domains and local-part prefixes), and skip recipients that only ever appear in CC. For up to 10 per run (queue the rest in `sync/state/autoAddQueue.json`):
- Web-search the person (display name + email domain) for company, title, LinkedIn.
- Notion: create COMPANIES row if the domain matches no existing company (match by website/domain or name); create CONTACTS row: CONTACT NAME, EMAIL ADDRESS, TITLE / POSITION, LINKEDIN, COMPANY NAME relation, SOURCE = "GMAIL AUTO" (create the option if missing), OUTREACH STATUS = Contacted, LAST CONTACT DATE = send date, NOTES = "Auto-added from sent mail <today>. Research unverified." Add a meta alert listing who was added.

## 7. Follow-up computation (JSON only, never Notion)
For every pipeline row on an upcoming event with status CONTACTED / 1ST / 2ND FOLLOW UP: if lastOutbound is set, no lastInbound after it, and 5 or more business days have passed, set followUp = {needed:true, daysSince, suggest: next step name}. Otherwise followUp = {needed:false}.

## 8. Nearby events scan (NYC and Austin only)
Only scan for events in NYC and Austin. Willpower does not operate in other metros yet, so City Scout is scoped to those two cities. For each internal event in NYC or Austin dated within the next 60 days whose entry in data/nearby-events.json has `scannedAt` older than 7 days (or missing): run 3-4 web searches, e.g. "<city> wellness events <month year>", "lu.ma <city> wellness <month>", "eventbrite <city> health fitness founders <month year>", plus one tuned to the event type. Keep results within 10 days either side of our date, in or near the same city. Dedupe by name+date. Write items with {name, date, city, venue, url, source, why} and scannedAt. Do NOT scan events for our LA/Miami/Vegas tentpole rows (the City Scout map ignores non-NYC/Austin pins anyway). This is separate from the CONTACTS database, which keeps people from every city.

## 8b. Curated invite seeding for new Willpower events (RULE)
When a NEW internal (Willpower) event appears in Event Calendar with an empty or near-empty EVENT PIPELINE (fewer than 10 rows):
- Find similar PAST events: same series word in the name (wellness, lounge, world, sports, catalyst, house, padel, roundtable, holiday, performance) OR same city + same Event Type.
- Pull the people who were on those past events' pipelines (especially anyone CONFIRMED/attended). These are the proven guests. Example: a new "NYC Wellness Lounge" pulls the May 20 + prior Wellness Lounge guests.
- Add a curated top set (cap ~40) of additional CONTACTS that fit by city + tier + seniority + category, skipping bounced emails.
- Write these into EVENT PIPELINE as new rows: Contact linked, Event linked, Status = TO CONTACT, Owner = Bot, Relationship computed (Community if they are WP community, else Known if in CRM). Do NOT duplicate rows that already exist for that event.
- The dashboard also computes these suggestions live (Suggested invites tab), so seeding is about giving the team a real working list to act on. Cap writes and log what was added to meta alerts. First time on a given event, produce a dry-run list for human review before writing.

## 8c. Luma ingestion (RULE)
For any event with a Luma URL:
- Fetch the event's public guest list if available (Luma guest counts / featured guests are sometimes public; the full list often is not). For each attendee found: name, company, title, email if exposed.
- If the person is not in CONTACTS, add them (SOURCE = LUMA, research company/title/LinkedIn like step 7). 
- Create or update the EVENT PIPELINE row: for our events, a Luma registration means Status = CONFIRMED (they signed up); for external events, it means they are a confirmed ATTENDEE of that event (this is exactly the "attendees, not our database" list the external event page shows).
- If Luma does not expose the guest list, log that and skip; the external event page will keep prompting for the data.

## 8d. External vs internal (already enforced in the app)
- Internal (Willpower) events: the page shows role buckets for people on the list + curated Suggested invites from the database.
- External events: the page shows ONLY confirmed attendees (pipeline rows, ideally fed by Luma), never a database dump. Keep it that way.
- Vendor statuses for an event live in that event's vendor tracker (e.g. the Aug 19 "VENDOR TRACKER" db, data source collection://37238388-847e-800b-a4c9-000b83df7d45). build_data.py merges vendor-tracker rows (CONFIRMED vendors, vendor type, gifting-suite vs attendee) into the pipeline. When a new event gets its own vendor tracker, add its raw pull as sync/state/raw/vendors_<event>.json with an eventId field and build_data folds it in. Skip blank tracker rows (no contact and no company).

## 9. Publish
1. `python3 sync/build_data.py` (merges raw shards, preserves gmail-derived fields, writes data/*.json).
2. Apply this run's gmail-derived updates into data/contacts.json and data/pipeline.json (emailStatus, bouncedEmail, leftCompany, lastOutbound/lastInbound, outboundCount, followUp) if build_data did not already carry them.
3. Update meta.json alerts with everything collected above.
4. Update `sync/state/lastSync.json` and `processedMessageIds.json` (keep only ids from the last 14 days).
5. `git add -A data/ && git commit -m "morning sync <date>" && git push`.

If any single step fails, continue with the rest, and put the failure in meta.json alerts.
