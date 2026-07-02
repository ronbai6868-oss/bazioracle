/* /api/verify-order.js  v4.1 */
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { chartHash, lang } = req.body;
    if (!chartHash) return res.status(400).json({ error: 'Missing chartHash' });

    const { KV_REST_API_URL, KV_REST_API_TOKEN, TOKEN_SECRET } = process.env;
    if (!KV_REST_API_URL || !KV_REST_API_TOKEN || !TOKEN_SECRET) return res.status(500).json({ error: 'Server misconfiguration' });

    const kvRes  = await fetch(`${KV_REST_API_URL}/get/${encodeURIComponent('paid:' + chartHash)}`, {
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
    });
    if (!kvRes.ok) return res.status(500).json({ error: 'KV read failed' });

    const kvData = await kvRes.json();
    const raw    = kvData.result;
    if (!raw) {
      console.log(`KV miss: paid:${chartHash.slice(0,8)} not found yet`);
      return res.status(402).json({ error: 'Payment not found yet', code: 'NOT_FOUND' });
    }

    let record;
    try { record = JSON.parse(raw); } catch { return res.status(500).json({ error: 'KV data corrupt' }); }

    const orderId   = record.orderId;
    const birthData = record.birthData || null; // webhook 写入的生日数据
    console.log(`✅ KV hit: order=${orderId} hash=${chartHash.slice(0,8)}`);

    // 令牌有效期：24小时（给用户足够时间查看结果页）
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    const payload   = JSON.stringify({ orderId, chartHash, lang: lang || record.lang || 'en', expiresAt });
    const sig       = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
    const token     = Buffer.from(payload).toString('base64url') + '.' + sig;

    return res.status(200).json({ token, expiresAt, orderId, birthData });

  } catch (err) {
    console.error('verify-order error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
