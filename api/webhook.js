/* ═══════════════════════════════════════════════════
   /api/webhook.js  v4.0
   
   LS 支付成功 → 验证签名 → 写入 Vercel KV
   KV key: "paid:{chart_hash}"
   KV val: JSON { orderId, chartHash, lang, paidAt }
   TTL: 48小时（前端验证窗口）

   环境变量：
   LS_WEBHOOK_SECRET / KV_REST_API_URL / KV_REST_API_TOKEN
═══════════════════════════════════════════════════ */
import crypto from 'crypto';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    // 1. 读取原始 body
    const rawBody = await getRawBody(req);
    const bodyStr = rawBody.toString('utf8');

    // 2. 验证 LS 签名
    const signature     = req.headers['x-signature'];
    const webhookSecret = process.env.LS_WEBHOOK_SECRET;
    if (!signature || !webhookSecret) {
      console.warn('Webhook: missing signature or secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const expectedSig = crypto.createHmac('sha256', webhookSecret).update(bodyStr).digest('hex');
    const sigBuf = Buffer.from(signature,    'hex');
    const expBuf = Buffer.from(expectedSig,  'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      console.warn('Webhook: invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // 3. 解析事件
    const event     = JSON.parse(bodyStr);
    const eventName = event.meta?.event_name;
    if (eventName !== 'order_created') {
      return res.status(200).json({ received: true, action: 'ignored' });
    }

    const orderAttrs = event.data?.attributes;
    const customData = event.meta?.custom_data;   // ← custom_data 只在 webhook meta 里有

    if (orderAttrs?.status !== 'paid') {
      return res.status(200).json({ received: true, action: 'not_paid' });
    }

    const orderId   = String(event.data?.id || '');
    const chartHash = customData?.chart_hash;
    const lang      = customData?.lang || 'en';

    if (!orderId || !chartHash) {
      console.error('Webhook: missing orderId or chartHash', { orderId, chartHash });
      return res.status(400).json({ error: 'Missing order data' });
    }

    // 4. 写入 Vercel KV（TTL 48小时 = 172800秒）
    const kvUrl   = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    if (!kvUrl || !kvToken) {
      console.error('KV not configured');
      return res.status(500).json({ error: 'KV not configured' });
    }

    const kvKey  = `paid:${chartHash}`;
    const kvVal  = JSON.stringify({ orderId, chartHash, lang, paidAt: Date.now() });
    const setRes = await fetch(`${kvUrl}/set/${encodeURIComponent(kvKey)}`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ value: kvVal, ex: 172800 })
    });

    if (!setRes.ok) {
      const err = await setRes.text();
      console.error('KV set failed:', setRes.status, err);
      return res.status(500).json({ error: 'KV write failed' });
    }

    console.log(`✅ Webhook: order=${orderId} hash=${chartHash.slice(0,8)} written to KV`);
    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
