/* ═══════════════════════════════════════════════════
   /api/create-checkout.js  v6.0  — Paddle
   
   替换 Lemon Squeezy，改用 Paddle Billing API
   支持：完整解读 + 五行壁纸
   
   环境变量（在 Vercel 中配置）：
   PADDLE_API_KEY          = Paddle API Key（以 pdl_ 开头）
   PADDLE_READING_PRICE_ID = 完整解读的 Price ID（以 pri_ 开头）
   PADDLE_WALLPAPER_PRICE_ID = 壁纸的 Price ID（以 pri_ 开头）
   SITE_URL                = https://getbazioracle.com
═══════════════════════════════════════════════════ */
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
      PADDLE_API_KEY,
      PADDLE_READING_PRICE_ID,
      PADDLE_WALLPAPER_PRICE_ID,
      SITE_URL
    } = process.env;

    if (!PADDLE_API_KEY) {
      return res.status(500).json({ error: 'Payment service not configured' });
    }

    const siteUrl     = SITE_URL || 'https://getbazioracle.com';
    const isWallpaper = productType === 'wallpaper';
    const priceId     = isWallpaper ? PADDLE_WALLPAPER_PRICE_ID : PADDLE_READING_PRICE_ID;

    if (!priceId) {
      return res.status(500).json({
        error: isWallpaper ? 'Wallpaper product not configured' : 'Reading product not configured'
      });
    }

    // returnHash：壁纸带 _wp_element 后缀，用于 KV key
    const returnHash = isWallpaper ? `${chartHash}_wp_${element}` : chartHash;

    // 支付完成后跳转到结果页
    const successUrl = isWallpaper
      ? `${siteUrl}/reading/?hash=${encodeURIComponent(returnHash)}&lang=${lang || 'en'}&unlock=pending&type=wallpaper&element=${encodeURIComponent(element || '')}&origHash=${encodeURIComponent(chartHash)}`
      : `${siteUrl}/reading/?hash=${encodeURIComponent(chartHash)}&lang=${lang || 'en'}&unlock=pending`;

    // 自定义数据：传给 Webhook，供后端恢复命盘
    const customData = {
      chart_hash:   returnHash,
      lang:         lang || 'en',
      product_type: productType
    };
    if (isWallpaper && element) customData.element = element;
    if (!isWallpaper && birthData) customData.birth_data = JSON.stringify(birthData);

    // ── 调用 Paddle API 创建一次性结账链接 ──────────────
    // Paddle Billing API v1: POST /transactions
    // 文档：https://developer.paddle.com/api-reference/transactions/create-transaction
    const paddleBody = {
      items: [
        {
          price_id: priceId,
          quantity: 1
        }
      ],
      custom_data: customData,
      checkout: {
        url: successUrl   // 支付成功后跳转
      },
      // 支付完成后 Paddle 会自动把订单参数附加到 successUrl
      // 例如：?_ptxn=txn_xxxxxxxx
    };

    // Paddle 使用 sandbox（测试）或 production（正式）环境
    // 测试环境 API：https://sandbox-api.paddle.com
    // 正式环境 API：https://api.paddle.com
    const isSandbox   = PADDLE_API_KEY.startsWith('test_');
    const paddleBase  = isSandbox
      ? 'https://sandbox-api.paddle.com'
      : 'https://api.paddle.com';

    const paddleRes = await fetch(`${paddleBase}/transactions`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${PADDLE_API_KEY}`
      },
      body:   JSON.stringify(paddleBody),
      signal: AbortSignal.timeout(10000)
    });

    if (!paddleRes.ok) {
      const err = await paddleRes.text();
      console.error('Paddle transaction error:', paddleRes.status, err);
      return res.status(paddleRes.status).json({ error: 'Failed to create checkout', detail: err });
    }

    const data = await paddleRes.json();

    // Paddle 返回的结账 URL 在 data.data.checkout.url
    const checkoutUrl = data?.data?.checkout?.url;
    if (!checkoutUrl) {
      console.error('No checkout URL in Paddle response:', JSON.stringify(data).slice(0, 300));
      return res.status(500).json({ error: 'No checkout URL returned from Paddle' });
    }

    return res.status(200).json({ checkoutUrl, productType });

  } catch (err) {
    console.error('create-checkout error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
