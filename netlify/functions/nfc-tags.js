const crypto = require('crypto');
const SUPABASE_URL = 'https://qxlssbpjspkhgtcixqgx.supabase.co';

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function isValidSession(event) {
  const secret = process.env.DASHBOARD_SESSION_SECRET;
  if (!secret) return false;
  const cookie = event.headers.cookie || event.headers.Cookie || '';
  const match = cookie.match(/(?:^|;\s*)messiah_admin_session=([^;]+)/);
  if (!match) return false;
  const [timestamp, signature] = match[1].split('.');
  if (!timestamp || !signature) return false;
  const createdAt = Number(timestamp);
  const age = Date.now() - createdAt;
  if (!Number.isFinite(createdAt) || age < 0 || age > 8 * 60 * 60 * 1000) return false;
  const expected = crypto.createHmac('sha256', secret).update(timestamp).digest('hex');
  try {
    const a = Buffer.from(signature, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

function validate(body) {
  const tag = {
    tag_code: String(body.tag_code || '').trim().toUpperCase(),
    location: String(body.location || '').trim(),
    destination_name: String(body.destination_name || '').trim(),
    destination_url: String(body.destination_url || '').trim(),
    status: String(body.status || 'active').trim().toLowerCase(),
    notes: String(body.notes || '').trim() || null
  };
  if (!/^MUMC-\d{3,}$/.test(tag.tag_code)) return { error: 'Tag ID must look like MUMC-001.' };
  if (!tag.location) return { error: 'Location is required.' };
  if (!tag.destination_name) return { error: 'Destination is required.' };
  try {
    const url = new URL(tag.destination_url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch { return { error: 'Destination URL is not valid.' }; }
  if (!['active', 'inactive'].includes(tag.status)) return { error: 'Status must be active or inactive.' };
  return { tag };
}

async function sb(path, options = {}) {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('SUPABASE_SECRET_KEY is missing.');
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: key, ...(options.headers || {}) }
  });
}

async function getTags() {
  const [tagsRes, tapsRes] = await Promise.all([
    sb('nfc_tags?select=*&order=tag_code.asc'),
    sb('nfc_taps?select=tag_id,tapped_at&order=tapped_at.desc')
  ]);
  if (!tagsRes.ok) throw new Error(`Tag load failed: ${tagsRes.status} ${await tagsRes.text()}`);
  if (!tapsRes.ok) throw new Error(`Tap load failed: ${tapsRes.status} ${await tapsRes.text()}`);
  const tags = await tagsRes.json();
  const taps = await tapsRes.json();
  const stats = new Map();
  for (const tap of taps) {
    if (!stats.has(tap.tag_id)) stats.set(tap.tag_id, { tap_count: 0, last_tap: null });
    const item = stats.get(tap.tag_id);
    item.tap_count++;
    if (!item.last_tap) item.last_tap = tap.tapped_at;
  }
  return tags.map(tag => ({ ...tag, tap_count: stats.get(tag.id)?.tap_count || 0, last_tap: stats.get(tag.id)?.last_tap || null }));
}

async function createTag(event) {
  let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { success: false, message: 'Invalid JSON.' }); }
  const v = validate(body); if (v.error) return json(400, { success: false, message: v.error });
  const res = await sb('nfc_tags', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(v.tag) });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 409 || text.includes('duplicate key')) return json(409, { success: false, message: 'That Tag ID already exists.' });
    console.error('Create NFC tag failed:', res.status, text);
    return json(500, { success: false, message: 'Unable to create this tag.' });
  }
  const rows = await res.json();
  return json(201, { success: true, tag: rows[0] });
}

async function updateTag(event) {
  let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { success: false, message: 'Invalid JSON.' }); }
  const id = String(body.id || '').trim();
  if (!id) return json(400, { success: false, message: 'Tag record ID is required.' });
  const v = validate(body); if (v.error) return json(400, { success: false, message: v.error });
  const payload = { location: v.tag.location, destination_name: v.tag.destination_name, destination_url: v.tag.destination_url, status: v.tag.status, notes: v.tag.notes };
  const res = await sb(`nfc_tags?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(payload) });
  if (!res.ok) { console.error('Update NFC tag failed:', res.status, await res.text()); return json(500, { success: false, message: 'Unable to save this tag.' }); }
  const rows = await res.json();
  if (!rows.length) return json(404, { success: false, message: 'Tag not found.' });
  return json(200, { success: true, tag: rows[0] });
}

exports.handler = async function(event) {
  if (!isValidSession(event)) return json(401, { success: false, message: 'Unauthorized' });
  try {
    if (event.httpMethod === 'GET') return json(200, { success: true, tags: await getTags() });
    if (event.httpMethod === 'POST') return await createTag(event);
    if (event.httpMethod === 'PATCH') return await updateTag(event);
    return json(405, { success: false, message: 'Method not allowed' });
  } catch (error) {
    console.error('NFC tags function error:', error);
    return json(500, { success: false, message: 'Unable to process NFC tag request.' });
  }
};
