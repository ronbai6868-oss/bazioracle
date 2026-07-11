/* ═══════════════════════════════════════════════════
   /api/webhook.js  v5.0  — Paddle
   
   Paddle 支付成功 → 验证签名 → 写入 Vercel KV
   
   Paddle 签名方式与 Lemon Squeezy 不同：
   - 使用 TS（时间戳）+ H1（HMAC-SHA256）双重验证
   - 签名在请求头 Paddle-Signature 中
   - 签名格式：ts=xxxx;h1=xxxx
   
   KV key: "paid:{chart_hash}"
   KV val: JSON { txnId, chartHash, lang, birthData, paidAt }
   TTL: 48小时
   
   环境变量：
   PADDLE_WEBHOOK_SECRET  = Paddle Webhook 签名密钥
   KV_REST_API_URL        = Upstash KV URL
   KV_REST_API_TOKEN      = Upstash KV Token
═══════════════════════════════════════════════════ */
import crypto from 'crypto';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    // ── 1. 读取原始 body ─────────────────────────────────
    const rawBody = await getRawBody(req);
    const bodyStr = rawBody.toString('utf8');

    // ── 2. 验证 Paddle 签名 ──────────────────────────────
    // Paddle-Signature: ts=1671552000;h1=xxxxxxxxxxxx
    const sigHeader = req.headers['paddle-signature'];
    const secret    = process.env.PADDLE_WEBHOOK_SECRET;

    if (!sigHeader || !secret) {
      console.warn('Webhook: missing Paddle-Signature or secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 解析签名头
    const parts = Object.fromEntries(
      sigHeader.split(';').map(p => p.split('='))
    );
    const ts = parts['ts'];
    const h1 = parts['h1'];

    if (!ts || !h1) {
      console.warn('Webhook: malformed Paddle-Signature header');
      return res.status(401).json({ error: 'Invalid signature format' });
    }

    // 防重放攻击：时间戳不能超过5分钟
    const tsDiff = Math.abs(Date.now() / 1000 - parseInt(ts));
    if (tsDiff > 300) {
      console.warn('Webhook: timestamp too old, possible replay attack');
      return res.status(401).json({ error: 'Timestamp too old' });
    }

    // 计算期望签名：HMAC-SHA256(ts:body)
    const signedPayload  = `${ts}:${bodyStr}`;
    const expectedH1     = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    if (!crypto.timingSafeEqual(
      Buffer.from(h1, 'hex'),
      Buffer.from(expectedH1, 'hex')
    )) {
      console.warn('Webhook: invalid Paddle signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // ── 3. 解析事件 ──────────────────────────────────────
    const event     = JSON.parse(bodyStr);
    const eventType = event.event_type;

    console.log('Paddle webhook event:', eventType);

    // 只处理交易完成事件
    // Paddle 事件：transaction.completed 表示支付成功
    if (eventType !== 'transaction.completed') {
      return res.status(200).json({ received: true, action: 'ignored', event: eventType });
    }

    const txnData    = event.data;
    const txnId      = txnData?.id;
    const status     = txnData?.status;
    const customData = txnData?.custom_data || {};

    // 确认交易状态是 completed
    if (status !== 'completed') {
      return res.status(200).json({ received: true, action: 'not_completed', status });
    }

    const chartHash = customData?.chart_hash;
    const lang      = customData?.lang || 'en';
    const birthData = customData?.birth_data || null;

    if (!txnId || !chartHash) {
      console.error('Webhook: missing txnId or chartHash', { txnId, chartHash });
      return res.status(400).json({ error: 'Missing transaction data' });
    }

    // ── 4. 写入 Vercel KV（TTL 48小时）──────────────────
    const kvUrl   = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;

    if (!kvUrl || !kvToken) {
      console.error('KV not configured');
      return res.status(500).json({ error: 'KV not configured' });
    }

    const kvKey = `paid:${chartHash}`;
    const kvVal = JSON.stringify({
      txnId,
      orderId:   txnId,   // 兼容 verify-order 读取 orderId 字段
      chartHash,
      lang,
      birthData,
      paidAt: Date.now()
    });

    const setRes = await fetch(`${kvUrl}/set/${encodeURIComponent(kvKey)}`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${kvToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value: kvVal, ex: 172800 })
    });

    if (!setRes.ok) {
      const err = await setRes.text();
      console.error('KV set failed:', setRes.status, err);
      return res.status(500).json({ error: 'KV write failed' });
    }

    console.log(`✅ Paddle Webhook: txn=${txnId} hash=${chartHash.slice(0, 8)} written to KV`);
    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data',  c => chunks.push(c));
    req.on('end',   () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
