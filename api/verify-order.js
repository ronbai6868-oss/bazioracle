/* ═══════════════════════════════════════════════════
   /api/verify-order.js  v3.0

   ★ 新架构：完全不依赖 order_id
     LS 的 redirect_url 不支持 {order_id} 模板替换
     改为：用 chartHash 查 LS 最近已支付订单列表
           找到 custom_data.chart_hash 匹配的订单即验证通过

   Environment Variables：
   LS_API_KEY / TOKEN_SECRET
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

    const { LS_API_KEY, TOKEN_SECRET } = process.env;
    if (!LS_API_KEY || !TOKEN_SECRET) return res.status(500).json({ error: 'Server misconfiguration' });

    // ── 查询 LS 最近100个已支付订单 ──────────────────────
    const lsRes = await fetch(
      'https://api.lemonsqueezy.com/v1/orders?page[size]=100&sort=-createdAt&filter[status]=paid',
      {
        headers: {
          'Accept':        'application/vnd.api+json',
          'Authorization': `Bearer ${LS_API_KEY}`
        },
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!lsRes.ok) {
      const errText = await lsRes.text();
      console.error('LS orders fetch failed:', lsRes.status, errText);
      return res.status(402).json({ error: 'Could not verify payment status', code: 'LS_ERROR' });
    }

    const ordersData = await lsRes.json();
    const orders     = ordersData.data || [];
    console.log(`Checking ${orders.length} paid orders for hash=${chartHash.slice(0,8)}`);

    // ── 找到 custom_data.chart_hash 匹配的订单 ───────────
    // LS webhook 的 custom_data 在 meta.custom_data
    // LS orders API 的 custom_data 在 attributes.first_order_item.custom_data
    // 两个路径都检查，确保能找到
    const matched = orders.find(order => {
      const attrs = order.attributes || {};
      // 路径1：orders API（最常见）
      const cd1 = attrs.first_order_item?.custom_data;
      // 路径2：有些版本 LS 会放在顶层 meta
      const cd2 = attrs.meta?.custom_data;
      // 路径3：直接在 attributes 上
      const cd3 = attrs.custom_data;
      const cd  = cd1 || cd2 || cd3 || {};
      return cd.chart_hash === chartHash;
    });

    if (!matched) {
      console.log(`No paid order found for chartHash=${chartHash.slice(0,8)}`);
      return res.status(402).json({ error: 'Payment not found yet', code: 'NOT_FOUND' });
    }

    const orderId = matched.id;
    console.log(`✅ Verified order=${orderId} for hash=${chartHash.slice(0,8)}`);

    // ── 生成签名令牌（2小时有效）─────────────────────────
    const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
    const payload   = JSON.stringify({ orderId, chartHash, lang: lang || 'en', expiresAt });
    const sig       = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
    const token     = Buffer.from(payload).toString('base64url') + '.' + sig;

    return res.status(200).json({ token, expiresAt, orderId });

  } catch (err) {
    console.error('verify-order error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
