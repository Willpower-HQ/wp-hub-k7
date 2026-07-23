# Weekly Company Monitor Playbook (Mondays)

Goal: a digest email DRAFT (never auto-send) covering news at companies in the CRM: leadership hires and departures, funding, M&A, launches, plus the watch list from the daily syncs. To: events@drinkwillpower.com, CC: bill@drinkwillpower.com. Subject: "Company watch: week of <date>".

Run from `/Users/joaniefelder/Downloads/PowerHouse/wp-hub`.

## 1. Build the scan list
From data/contacts.json + companies in the raw shards:
- HOT list (scanned every week): companies whose contacts include wpTier "Tier A", category containing "VIP", or a pipeline row on an upcoming event.
- LONG TAIL: all other companies, split into 4 stable cohorts by first letter of name (A-F, G-M, N-S, T-Z). Scan cohort = ISO week number mod 4. Every company gets looked at roughly monthly.

## 2. Scan
- HOT companies: fetch Google News RSS per company: `https://news.google.com/rss/search?q="<company name>"+when:7d` (use WebFetch; no API key needed).
- LONG TAIL cohort: batch 5-6 names per query with OR, `when:30d`.
- Keep items whose headline matches signal keywords: appoints, hires, names, joins as, promoted to, steps down, departs, exits, resigns, CMO, CFO, CEO, chief, president, raises, Series, seed round, valuation, acquires, acquired, merger, launches, debuts, expands, opens, closes, shuts, layoffs, bankruptcy, IPO.
- Dedupe against `sync/state/seenNewsUrls.json` (and by normalized headline). Cap the digest at ~25 items, best first (leadership moves at HOT companies first).

## 3. Compose the draft
HTML email, light lavender style (Plus Jakarta Sans, #f7f5fb background, #7a5fd0 accents). No em dashes anywhere. Sections:
1. **People moves** (hires/departures) with "Your contacts there: <names and titles>" pulled from contacts.json.
2. **Funding and M&A**
3. **Launches and expansion**
4. **Watch list** from the week's meta alerts: possible job changes (leftCompany flags), bounces flagged, contacts auto-added from sent mail, replies to triage.
Each item: company, one-line headline, source and date, link.
If there is genuinely nothing, still draft a short "quiet week" note with the Watch List.

## 4. Finish
- Create the Gmail DRAFT (do not send).
- Append seen URLs to `sync/state/seenNewsUrls.json` (keep 90 days).
- Add a meta.json alert: "Weekly digest drafted <date>, N items" and push if data changed.
