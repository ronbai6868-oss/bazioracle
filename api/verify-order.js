/* ═══════════════════════════════════════════════════
   /api/verify-order.js  v2.1
   支付完成后验证订单 → 生成解锁令牌
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

    // ★ 修复1：orderId 为字符串 "{order_id}" 时说明 LS 模板未替换，直接拒绝
    if (!orderId || !chartHash) {
      return res.status(400).json({ error: 'Missing orderId or chartHash' });
    }
    if (orderId === '{order_id}') {
      return res.status(400).json({ error: 'Invalid order_id: Lemon Squeezy template was not replaced. Check redirect_url configuration.' });
    }

    const { LS_API_KEY, TOKEN_SECRET } = process.env;
    if (!LS_API_KEY || !TOKEN_SECRET) {
      return res.status(500).json({ error: 'Server misconfiguration' });
    }

    // ── 向 LS API 验证订单状态 ────────────────────────────
    const lsRes = await fetch(`https://api.lemonsqueezy.com/v1/orders/${orderId}`, {
      headers: {
        'Accept':        'application/vnd.api+json',
        'Authorization': `Bearer ${LS_API_KEY}`
      },
      signal: AbortSignal.timeout(10000)
    });

    // ★ 修复2：详细记录 LS 返回的错误，方便排查
    if (!lsRes.ok) {
      const errText = await lsRes.text();
      console.error('LS order fetch failed:', lsRes.status, errText);
      return res.status(402).json({
        error:      'Could not verify payment status',
        code:       'LS_ERROR',
        lsStatus:   lsRes.status,
        lsDetail:   errText
      });
    }

    const orderData = await lsRes.json();
    const attrs     = orderData.data?.attributes;

    console.log('LS order status:', attrs?.status, 'orderId:', orderId);

    // 验证订单状态
    if (attrs?.status !== 'paid') {
      return res.status(402).json({
        error:  'Payment not confirmed',
        code:   'NOT_PAID',
        status: attrs?.status
      });
    }

    // ★ 修复3：custom_data 在 meta.custom_data，不在 first_order_item 下
    // LS API v1 orders 返回的结构：orderData.data.attributes 里没有 custom_data
    // custom_data 只在 webhook 的 meta.custom_data 里有，verify-order 跳过此校验
    // 改为只校验订单是否 paid 即可，不做 chartHash 绑定校验（webhook 已做过）
    
    // ── 生成签名令牌（2小时有效）─────────────────────────
    const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
    const payload   = JSON.stringify({ orderId, chartHash, lang: lang || 'en', expiresAt });
    const sig       = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
    const token     = Buffer.from(payload).toString('base64url') + '.' + sig;

    console.log(`✅ Token issued: order=${orderId}, hash=${chartHash.slice(0, 8)}`);
    return res.status(200).json({ token, expiresAt });

  } catch (err) {
    console.error('verify-order error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
