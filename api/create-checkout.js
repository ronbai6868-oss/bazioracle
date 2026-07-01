/* ═══════════════════════════════════════════════════
   /api/create-checkout.js  v3.0
   Environment Variables：
   LS_API_KEY / LS_STORE_ID / LS_READING_VARIANT
   LS_WALLPAPER_VARIANT / SITE_URL
═══════════════════════════════════════════════════ */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { chartHash, lang, productType = 'reading', element } = req.body;
    if (!chartHash) return res.status(400).json({ error: 'Missing chartHash' });

    const { LS_API_KEY, LS_STORE_ID, LS_READING_VARIANT, LS_WALLPAPER_VARIANT, SITE_URL } = process.env;
    if (!LS_API_KEY || !LS_STORE_ID) return res.status(500).json({ error: 'Payment service not configured' });

    const siteUrl     = SITE_URL || 'https://getbazioracle.com';
    const isWallpaper = productType === 'wallpaper';
    const variantId   = isWallpaper ? LS_WALLPAPER_VARIANT : LS_READING_VARIANT;
    if (!variantId) return res.status(500).json({ error: isWallpaper ? 'Wallpaper product not configured' : 'Reading product not configured' });

    const productName = isWallpaper
      ? (lang === 'zh' ? `八字壁纸 · ${element}元素` : `BaZi Wallpaper · ${element} Element`)
      : (lang === 'zh' ? '八字完整命盘深度解读' : 'Full BaZi Reading Unlock');

    const productDesc = isWallpaper
      ? (lang === 'zh' ? `1080×1920 专属${element}元素壁纸` : `1080×1920 personalised ${element} element wallpaper`)
      : (lang === 'zh' ? 'AI驱动完整八字命盘分析' : 'AI-powered complete BaZi analysis');

    const returnHash = isWallpaper ? `${chartHash}_wp_${element}` : chartHash;

    // ★ 不使用 {order_id} 模板（LS 在 redirect_url 里不替换）
    // 改为只传 hash，verify-order 用 hash 查 LS 订单列表
    const redirectUrl =
      `${siteUrl}/calculator/?unlock=pending`
      + `&hash=${encodeURIComponent(returnHash)}`
      + `&lang=${lang || 'en'}`
      + `&type=${productType}`
      + (element ? `&element=${encodeURIComponent(element)}` : '');

    // ★ custom_data 里的值必须全部是字符串
    // ★ custom_data.chart_hash 用 returnHash（壁纸时带 _wp_element 后缀）
    // 与 redirect_url 里的 hash 参数保持一致，确保 KV key 能匹配
    const customData = {
      chart_hash:   String(returnHash),
      lang:         String(lang || 'en'),
      product_type: String(productType)
    };
    if (isWallpaper && element) customData.element = String(element);

    const body = {
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: { custom: customData },
          product_options: {
            name:        productName,
            description: productDesc,
            redirect_url: redirectUrl
          }
        },
        relationships: {
          store:   { data: { type: 'stores',   id: String(LS_STORE_ID)  } },
          variant: { data: { type: 'variants', id: String(variantId)    } }
        }
      }
    };

    const lsRes = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method:  'POST',
      headers: {
        'Accept':        'application/vnd.api+json',
        'Content-Type':  'application/vnd.api+json',
        'Authorization': `Bearer ${LS_API_KEY}`
      },
      body:   JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });

    if (!lsRes.ok) {
      const err = await lsRes.text();
      console.error('LS checkout error:', lsRes.status, err);
      return res.status(lsRes.status).json({ error: 'Failed to create checkout', detail: err });
    }

    const data        = await lsRes.json();
    const checkoutUrl = data.data?.attributes?.url;
    if (!checkoutUrl) return res.status(500).json({ error: 'No checkout URL returned' });

    return res.status(200).json({ checkoutUrl, productType });

  } catch (err) {
    console.error('create-checkout error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
