#!/usr/bin/env python3
"""Build data/tasks.json from a raw TASK TRACKER pull (sync/state/tasks_raw.json).

The morning sync writes sync/state/tasks_raw.json with the shape:
  { "event": "<undashed notion event id>", "eventName": "...", "pulledAt": "YYYY-MM-DD",
    "results": [ { "ACTION ITEM", "date:DUE DATE:start", "STATUS", "CATEGORY",
                   "PRIORITY LEVEL", "DESCRIPTION", "url", ["ASSIGNED PERSON"] }, ... ] }

This normalizes each row into a task the calendar can plot. Multiple raw files
(tasks_raw*.json) are merged so several events' checklists can coexist.
"""
import json, glob, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STATE = os.path.join(HERE, "state")
OUT = os.path.join(ROOT, "data", "tasks.json")

HEX32 = re.compile(r"([0-9a-f]{32})", re.I)


def undash(u):
    """Pull the 32-char notion id out of a page url or id string."""
    if not u:
        return None
    m = HEX32.search(str(u).replace("-", ""))
    return m.group(1).lower() if m else None


def norm(row, event_id):
    nid = undash(row.get("url"))
    assignee = row.get("ASSIGNED PERSON")
    if isinstance(assignee, str):
        try:
            assignee = json.loads(assignee)
        except Exception:
            assignee = [assignee] if assignee else []
    assignee = assignee or []
    return {
        "id": nid,
        "title": row.get("ACTION ITEM") or "",
        "event": event_id,
        "due": row.get("date:DUE DATE:start") or None,
        "status": row.get("STATUS") or "NOT STARTED",
        "category": row.get("CATEGORY") or "",
        "priority": row.get("PRIORITY LEVEL") or "",
        "desc": row.get("DESCRIPTION") or "",
        "assignee": assignee,
        "url": row.get("url") or "",
    }


def main():
    tasks, events, latest = [], {}, None
    for path in sorted(glob.glob(os.path.join(STATE, "tasks_raw*.json"))):
        with open(path) as f:
            raw = json.load(f)
        ev = undash(raw.get("event"))
        events[ev] = raw.get("eventName") or ev
        if raw.get("pulledAt"):
            latest = max(latest or "", raw["pulledAt"])
        for row in raw.get("results", []):
            if not (row.get("ACTION ITEM") or "").strip():
                continue
            tasks.append(norm(row, ev))

    tasks.sort(key=lambda t: (t["due"] or "9999", t["title"]))
    out = {"generatedAt": latest, "events": events, "tasks": tasks}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"wrote {len(tasks)} tasks for {len(events)} event(s) -> {OUT}")


if __name__ == "__main__":
    main()
