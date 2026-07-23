# First Run / Full Rebuild Playbook

Use when the raw shards are missing or corrupted, or a full re-pull is wanted.

1. Full Notion pull into `sync/state/raw/` (the SQL endpoint returns max 100 rows per query; page with LIMIT 100 OFFSET 0,100,200,...):
   - contacts_p<offset>.json from CONTACTS `collection://26138388-847e-80e2-99c9-000b15a33e58`
     columns: url, "CONTACT NAME" AS name, "EMAIL ADDRESS" AS email, LINKEDIN AS linkedin, substr("TITLE / POSITION",1,200) AS title, "COMPANY NAME" AS companyRel, LOC AS loc, CATEGORY AS category, "OUTREACH STATUS" AS status, SENIORITY AS seniority, "WP TIER" AS tier, SOURCE AS source, "date:LAST CONTACT DATE:start" AS lastContact, substr("LAST FEEDBACK",1,300) AS feedback, substr(NOTES,1,300) AS notes
   - companies_p<offset>.json from COMPANIES `collection://26138388-847e-8058-b71c-000b8b464764` (fetch schema first; select url, title AS name, industry, partner tier, revenue, website/domain)
   - pipeline_p<offset>.json from EVENT PIPELINE `collection://b93edddb-fb76-4579-ad2f-5d5c83fa18f9`
     columns: url, Name AS name, Contact AS contactRel, Event AS eventRel, Company AS companyRel, Role AS role, Status AS status, Relationship AS relationship, Owner AS owner, "Top Target" AS topTarget, substr("Speaker Angle",1,300) AS speakerAngle, substr(Notes,1,300) AS notes, createdTime
   - events_p0.json from EVENT CALENDAR `collection://17a38388-847e-8104-8a6e-000b1b0c66cc`
     columns: url, "Event Name" AS name, "date:Date:start" AS dateStart, "date:Date:end" AS dateEnd, "Event Location" AS location, Venue AS venue, "Event Type" AS type, "Internal or External?" AS internal, Status AS status, "Website URL" AS website, "Luma URL" AS luma
2. Gmail history backfill (read-only): for each event label in `sync/labels.json`, search `label:"<label>"` plus `in:sent newer_than:180d`; record per-contact lastOutbound, outboundCount, lastInbound into data/pipeline.json (via the same attribution rules as MORNING_SYNC step 4). Bounce backfill: `from:mailer-daemon newer_than:90d`.
3. `python3 sync/build_data.py`
4. Review a dry-run report of any intended Notion writes with a human before applying (first run touches many rows).
5. Commit and push.
