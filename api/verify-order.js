/* ═══════════════════════════════════════════════════
   /api/verify-order.js
   支付完成后验证订单 → 生成解锁令牌
   
   流程：用户从 LS 收银台回来 → 前端携带 orderId 调用此接口
         → 向 LS API 确认订单已支付 → 生成 HMAC 令牌返回前端
   
   环境变量：
   LS_API_KEY    = Lemon Squeezy API Key
   TOKEN_SECRET  = 令牌签名密钥
═══════════════════════════════════════════════════ */
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { orderId, chartHash, lang } = req.body;
    if (!orderId || !chartHash) {
      return res.status(400).json({ error: 'Missing orderId or chartHash' });
    }

    const { LS_API_KEY, TOKEN_SECRET } = process.env;
    if (!LS_API_KEY || !TOKEN_SECRET) {
      return res.status(500).json({ error: 'Server misconfiguration' });
    }

    // ── 向 LS API 实时验证订单状态 ────────────────────────
    const lsRes = await fetch(`https://api.lemonsqueezy.com/v1/orders/${orderId}`, {
      headers: {
        'Accept': 'application/vnd.api+json',
        'Authorization': `Bearer ${LS_API_KEY}`
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!lsRes.ok) {
      console.error('LS order fetch failed:', lsRes.status);
      return res.status(402).json({ error: 'Could not verify payment status', code: 'LS_ERROR' });
    }

    const orderData = await lsRes.json();
    const attrs     = orderData.data?.attributes;

    // 验证订单状态
    if (attrs?.status !== 'paid') {
      return res.status(402).json({ error: 'Payment not confirmed', code: 'NOT_PAID', status: attrs?.status });
    }

    // 验证命盘 Hash（防止用一个订单解锁不同命盘）
    const customData    = attrs?.first_order_item?.custom_data || {};
    const orderHash     = customData.chart_hash;
    if (orderHash && orderHash !== chartHash) {
      console.warn('Chart hash mismatch', { orderHash, chartHash: chartHash.slice(0,8) });
      return res.status(401).json({ error: 'This payment does not match the current chart', code: 'HASH_MISMATCH' });
    }

    // ── 生成签名令牌（2小时有效）─────────────────────────
    const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
    const payload   = JSON.stringify({ orderId, chartHash, lang: lang || 'en', expiresAt });
    const sig       = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
    const token     = Buffer.from(payload).toString('base64url') + '.' + sig;

    console.log(`✅ Token issued: order=${orderId}, hash=${chartHash.slice(0,8)}`);
    return res.status(200).json({ token, expiresAt });

  } catch (err) {
    console.error('verify-order error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
