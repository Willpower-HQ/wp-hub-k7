/* Reads and writes EVENT PIPELINE status in Notion, so status edits on the site are shared with
   everyone (Notion is the master list). Needs env var NOTION_TOKEN (a Notion internal integration
   token with access to the EVENT PIPELINE database). See SETUP-NETLIFY-NOTION.md. */
const TOKEN = process.env.NOTION_TOKEN;
const PIPELINE_DB = 'a20964d0ceae41c590ef819266ed1334'; // EVENT PIPELINE database
const NV = '2022-06-28';
const dash = id => (id && id.replace(/-/g, '').length === 32)
  ? (id = id.replace(/-/g, ''), `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`) : id;
const undash = id => (id || '').replace(/-/g, '');
const headers = () => ({ Authorization: `Bearer ${TOKEN}`, 'Notion-Version': NV, 'Content-Type': 'application/json' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
const json = (code, obj) => ({ statusCode: code, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (!TOKEN) return json(200, { configured: false });
  try {
    if (event.httpMethod === 'GET') {
      const eventId = (event.queryStringParameters || {}).event;
      if (!eventId) return json(400, { error: 'missing event' });
      const map = {};
      let cursor;
      do {
        const r = await fetch(`https://api.notion.com/v1/databases/${PIPELINE_DB}/query`, {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ filter: { property: 'Event', relation: { contains: dash(eventId) } }, start_cursor: cursor, page_size: 100 }),
        });
        const j = await r.json();
        if (j.object === 'error') return json(200, { configured: true, error: j.message, statuses: {} });
        (j.results || []).forEach(p => {
          const contact = ((p.properties.Contact || {}).relation || [])[0];
          const status = ((p.properties.Status || {}).select || {}).name || null;
          if (contact) map[undash(contact.id)] = { status, pipelineId: undash(p.id) };
        });
        cursor = j.has_more ? j.next_cursor : undefined;
      } while (cursor);
      return json(200, { configured: true, statuses: map });
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      const { eventId, contactId, pipelineId, status, name } = b;
      if (!status) return json(400, { error: 'missing status' });
      if (pipelineId) {
        const r = await fetch(`https://api.notion.com/v1/pages/${dash(pipelineId)}`, {
          method: 'PATCH', headers: headers(),
          body: JSON.stringify({ properties: { Status: { select: { name: status } } } }),
        });
        const j = await r.json();
        if (j.object === 'error') return json(500, { error: j.message });
        return json(200, { ok: true, pipelineId: undash(j.id) });
      }
      // no existing row: create one linked to the contact + event (Owner = Bot so we never overwrite a human's row)
      if (!contactId || !eventId) return json(400, { error: 'need contactId + eventId to create' });
      const r = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          parent: { database_id: PIPELINE_DB },
          properties: {
            Name: { title: [{ text: { content: name || 'Contact' } }] },
            Contact: { relation: [{ id: dash(contactId) }] },
            Event: { relation: [{ id: dash(eventId) }] },
            Status: { select: { name: status } },
            Owner: { select: { name: 'Bot' } },
          },
        }),
      });
      const j = await r.json();
      if (j.object === 'error') return json(500, { error: j.message });
      return json(200, { ok: true, pipelineId: undash(j.id), created: true });
    }
    return json(405, { error: 'method not allowed' });
  } catch (e) {
    return json(500, { error: String(e) });
  }
};
