# Willpower Outreach HQ

One place for the events team to work outreach: every contact in the database, filterable by city, plus an event view that recommends who to reach out to as speakers, vendors and cold invites, with live outreach status from Gmail.

- **index.html** Events landing. Add events in the Notion Event Calendar; they show up after the morning sync.
- **event.html?e=ID** The intern page: pick the event, work the lists.
- **contacts.html** Full directory with filters and per-person event history.

Data flows: Notion (source of truth) + Gmail (events@drinkwillpower.com) -> morning sync (Claude scheduled task on Joanie's Mac, ~7am) -> `data/*.json` -> this static site (GitHub Pages).

Playbooks live in `sync/`. The weekly company-news digest (Mondays) lands as a Gmail draft to events@, CC bill@.

Notes:
- The site is public but noindexed. Anyone with the exact URL can see contact emails; this tradeoff was accepted on 2026-07-23. To go private later: make the repo private and move hosting behind auth (one commit).
- The Mac must be awake at 7am for the sync. The site shows a "data is stale" banner if a sync is missed.
- Bounced emails are flagged and cleared in Notion, never deleted. People stay in the database.
