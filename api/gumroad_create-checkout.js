/* ═══════════════════════════════════════════════════
   /api/create-checkout.js  v7.0  — Gumroad
   
   架构：
   1. 前端调用此接口，传入 chartHash + birthData
   2. 接口把 chartHash 存入 KV（key = session:{sessionKey}）
   3. 返回 Gumroad 购买链接（含 sessionKey 参数）
   4. 用户在 Gumroad 付款后跳回 /reading/?session=xxx
   5. reading 页面用 sessionKey 调 verify-order 解锁

   环境变量：
   GUMROAD_READING_URL     = 完整解读产品的 Gumroad 链接
                             例：https://yourname.gumroad.com/l/bazi-reading
   GUMROAD_WALLPAPER_URL   = 壁纸产品的 Gumroad 链接
   SITE_URL                = https://getbazioracle.com
   KV_REST_API_URL         = Upstash KV URL
   KV_REST_API_TOKEN       = Upstash KV Token
═══════════════════════════════════════════════════ */
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { chartHash, lang, productType = 'reading', element, birthData } = req.body;
    if (!chartHash) return res.status(400).json({ error: 'Missing chartHash' });

    const {
      GUMROAD_READING_URL,
      GUMROAD_WALLPAPER_URL,
      SITE_URL,
      KV_REST_API_URL,
      KV_REST_API_TOKEN
    } = process.env;

    if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
      return res.status(500).json({ error: 'KV not configured' });
    }

    const siteUrl     = SITE_URL || 'https://getbazioracle.com';
    const isWallpaper = productType === 'wallpaper';
    const gumroadUrl  = isWallpaper ? GUMROAD_WALLPAPER_URL : GUMROAD_READING_URL;

    if (!gumroadUrl) {
      return res.status(500).json({ error: 'Gumroad product URL not configured' });
    }

    // returnHash：壁纸带 _wp_element 后缀
    const returnHash = isWallpaper ? `${chartHash}_wp_${element}` : chartHash;

    // ── 生成唯一 sessionKey（32位随机十六进制）──────────
    const sessionKey = crypto.randomBytes(16).toString('hex');

    // ── 把 chartHash + birthData 存入 KV（TTL 2小时）──
    // key = session:{sessionKey}
    const kvPayload = JSON.stringify({
      chartHash:   returnHash,
      origHash:    chartHash,
      lang:        lang || 'en',
      productType,
      element:     element || null,
      birthData:   birthData ? JSON.stringify(birthData) : null,
      createdAt:   Date.now()
    });

    const kvUrl   = `${KV_REST_API_URL}/set/${encodeURIComponent('session:' + sessionKey)}`;
    const kvRes   = await fetch(kvUrl, {
      method:  'POST',
      headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ value: kvPayload, ex: 7200 })  // 2小时有效
    });

    if (!kvRes.ok) {
      const err = await kvRes.text();
      console.error('KV session write failed:', kvRes.status, err);
      return res.status(500).json({ error: 'Failed to create session' });
    }

    // ── 构建 Gumroad 购买链接 ─────────────────────────
    // Gumroad 支持在 URL 里加自定义参数，付款完成后会原样带回
    // wanted=true 让 Gumroad 直接跳到购买页而不是产品介绍页
    const successUrl = isWallpaper
      ? `${siteUrl}/reading/?session=${sessionKey}&lang=${lang||'en'}&unlock=pending&type=wallpaper&origHash=${encodeURIComponent(chartHash)}`
      : `${siteUrl}/reading/?session=${sessionKey}&lang=${lang||'en'}&unlock=pending`;

    // Gumroad permalink 格式：https://xxx.gumroad.com/l/yyy?wanted=true&success_redirect=...
    const checkoutUrl = `${gumroadUrl}?wanted=true&success_redirect=${encodeURIComponent(successUrl)}`;

    console.log(`✅ Session created: ${sessionKey.slice(0,8)}... for hash=${returnHash.slice(0,8)}`);
    return res.status(200).json({ checkoutUrl, productType, sessionKey });

  } catch (err) {
    console.error('create-checkout error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
