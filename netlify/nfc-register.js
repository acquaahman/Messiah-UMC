// Deploy as netlify/functions/nfc-register.js
// Separate machine-to-machine registration endpoint. Never expose its token in browser code.
const crypto = require('crypto');
const SUPABASE_URL = 'https://qxlssbpjspkhgtcixqgx.supabase.co';
const json = (statusCode, body) => ({statusCode, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}, body:JSON.stringify(body)});
function authorized(event) {
  const expected = process.env.NFC_PROVISIONER_TOKEN;
  const given = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!expected || !given || expected.length < 32 || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
async function sb(path, opts={}) {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw Error('Missing Supabase key');
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {...opts, headers:{apikey:key,Authorization:`Bearer ${key}`,...opts.headers}});
}
exports.handler = async (event) => {
  if (!authorized(event)) return json(401,{success:false,message:'Unauthorized provisioner'});
  if (event.httpMethod !== 'POST') return json(405,{success:false,message:'POST only'});
  let body;
  try { body=JSON.parse(event.body||'{}'); } catch { return json(400,{success:false,message:'Invalid JSON'}); }
  const code=String(body.tag_code||'').trim().toUpperCase();
  if (!/^MUMC-\d{3}$/.test(code)) return json(400,{success:false,message:'Invalid tag code'});
  const destination_url='https://www.messiahmethodistchurch.com/connect';
  try {
    const get=await sb(`nfc_tags?tag_code=eq.${encodeURIComponent(code)}&select=id,tag_code,status&limit=1`);
    if (!get.ok) throw Error(`Lookup failed: ${get.status}`);
    const rows=await get.json();
    if (rows.length) {
      // Preserve existing location, destination, notes, ID and tap history.
      // Reactivate previously registered production tag.
      if (rows[0].status === 'inactive') {
        const patch=await sb(`nfc_tags?id=eq.${encodeURIComponent(rows[0].id)}`,{method:'PATCH',headers:{'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify({status:'active'})});
        if (!patch.ok) throw Error(`Activation failed: ${patch.status}`);
      }
      return json(200,{success:true,action:rows[0].status==='inactive'?'reactivated':'existing',tag_code:code});
    }
    const payload={tag_code:code,location:`Production Tag ${code.slice(5)}`,destination_name:'All-Purpose Connect Page',destination_url,status:'active',notes:'Registered by Akwaman Tag Provisioner'};
    const created=await sb('nfc_tags',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(payload)});
    if (!created.ok) {
      // Concurrent insert: treat as retryable failure, never overwrite.
      if (created.status===409) return json(409,{success:false,message:'Concurrent registration; retry'});
      throw Error(`Create failed: ${created.status}`);
    }
    return json(201,{success:true,action:'created',tag_code:code});
  } catch(e) { console.error('Registration failed',e); return json(503,{success:false,message:'Registration unavailable; retry later'}); }
};
