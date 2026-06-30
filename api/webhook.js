/* ═══════════════════════════════════════════════════
   /api/webhook.js
   Lemon Squeezy 支付回调处理
   
   关键安全点：
   1. 验证 Webhook 签名（防止伪造支付通知）
   2. 生成 HMAC 签名解锁令牌
   3. 令牌含过期时间（2小时），防止无限复用
   
   环境变量：
   LS_WEBHOOK_SECRET  = Lemon Squeezy Webhook 签名密钥
   TOKEN_SECRET       = 自定义令牌签名密钥（随机字符串，至少32位）
═══════════════════════════════════════════════════ */
import crypto from 'crypto';

// Vercel 默认会解析 body，但 Webhook 验签需要原始 body
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    // ── 1. 读取原始请求体（验签必须用原始数据）─────────────
    const rawBody = await getRawBody(req);
    const bodyStr = rawBody.toString('utf8');

    // ── 2. 验证 Lemon Squeezy 签名（核心安全步骤）──────────
    const signature = req.headers['x-signature'];
    if (!signature) {
      console.warn('Webhook: missing signature');
      return res.status(401).json({ error: 'Missing signature' });
    }

    const webhookSecret = process.env.LS_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('LS_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Server misconfiguration' });
    }

    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(bodyStr)
      .digest('hex');

    // 使用 timingSafeEqual 防止时序攻击
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSig, 'hex');
    if (sigBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      console.warn('Webhook: invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // ── 3. 解析事件 ────────────────────────────────────────
    const event = JSON.parse(bodyStr);
    const eventName = event.meta?.event_name;

    // 只处理支付成功事件
    if (eventName !== 'order_created') {
      return res.status(200).json({ received: true, action: 'ignored' });
    }

    const orderData  = event.data?.attributes;
    const customData = event.meta?.custom_data;

    // 验证订单状态
    if (orderData?.status !== 'paid') {
      return res.status(200).json({ received: true, action: 'not_paid' });
    }

    const orderId   = event.data?.id;
    const chartHash = customData?.chart_hash;
    const lang      = customData?.lang || 'en';

    if (!orderId || !chartHash) {
      console.error('Webhook: missing orderId or chartHash', { orderId, chartHash });
      return res.status(400).json({ error: 'Missing order data' });
    }

    // ── 4. 生成 HMAC 签名解锁令牌 ─────────────────────────
    const tokenSecret = process.env.TOKEN_SECRET;
    if (!tokenSecret) {
      console.error('TOKEN_SECRET not configured');
      return res.status(500).json({ error: 'Server misconfiguration' });
    }

    const expiresAt = Date.now() + 2 * 60 * 60 * 1000; // 2小时有效期
    const payload   = JSON.stringify({ orderId, chartHash, lang, expiresAt });
    const signature2 = crypto
      .createHmac('sha256', tokenSecret)
      .update(payload)
      .digest('hex');

    const token = Buffer.from(payload).toString('base64url') + '.' + signature2;

    // ── 5. 记录日志（可选：接入数据库）───────────────────────
    console.log(`✅ Payment verified: order=${orderId}, hash=${chartHash.slice(0,8)}...`);

    // 返回成功（LS 收到200即认为 Webhook 处理成功）
    return res.status(200).json({ received: true, token });

  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// 读取原始请求体
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
