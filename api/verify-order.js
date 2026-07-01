/* ═══════════════════════════════════════════════════
   /api/verify-order.js  v4.0

   新架构：从 Vercel KV 读取 webhook 写入的支付记录
   前端传 chartHash → 查 KV key "paid:{chartHash}" → 签发令牌

   环境变量：
   KV_REST_API_URL / KV_REST_API_TOKEN / TOKEN_SECRET
═══════════════════════════════════════════════════ */
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
    if (!KV_REST_API_URL || !KV_REST_API_TOKEN || !TOKEN_SECRET) {
      return res.status(500).json({ error: 'Server misconfiguration' });
    }

    // ── 从 KV 读取支付记录 ────────────────────────────
    const kvKey  = `paid:${chartHash}`;
    const kvRes  = await fetch(`${KV_REST_API_URL}/get/${encodeURIComponent(kvKey)}`, {
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
    });

    if (!kvRes.ok) {
      const err = await kvRes.text();
      console.error('KV get failed:', kvRes.status, err);
      return res.status(500).json({ error: 'KV read failed' });
    }

    const kvData = await kvRes.json();
    // Vercel KV REST API 返回 { result: "..." } 或 { result: null }
    const raw = kvData.result;

    if (!raw) {
      console.log(`KV miss: paid:${chartHash.slice(0,8)} not found yet`);
      return res.status(402).json({ error: 'Payment not found yet', code: 'NOT_FOUND' });
    }

    let record;
    try { record = JSON.parse(raw); }
    catch { return res.status(500).json({ error: 'KV data corrupt' }); }

    const orderId = record.orderId;
    console.log(`✅ KV hit: order=${orderId} hash=${chartHash.slice(0,8)}`);

    // ── 签发令牌（2小时有效）─────────────────────────
    const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
    const payload   = JSON.stringify({ orderId, chartHash, lang: lang || record.lang || 'en', expiresAt });
    const sig       = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
    const token     = Buffer.from(payload).toString('base64url') + '.' + sig;

    return res.status(200).json({ token, expiresAt, orderId });

  } catch (err) {
    console.error('verify-order error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
