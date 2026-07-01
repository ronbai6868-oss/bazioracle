/* ═══════════════════════════════════════════════════
   /api/create-checkout.js  v2.0
   支持两种产品：完整解读 + 单张壁纸
   
   环境变量（Vercel Dashboard 设置）：
   LS_API_KEY           = Lemon Squeezy API Key
   LS_STORE_ID          = 店铺 ID
   LS_READING_VARIANT   = 「完整解读」产品 Variant ID
   LS_WALLPAPER_VARIANT = 「壁纸」产品 Variant ID
   SITE_URL             = https://getbazioracle.com
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
    if (!LS_API_KEY || !LS_STORE_ID) {
      return res.status(500).json({ error: 'Payment service not configured' });
    }

    const siteUrl  = SITE_URL || 'https://getbazioracle.com';
    const isWp     = productType === 'wallpaper';
    const variantId = isWp ? LS_WALLPAPER_VARIANT : LS_READING_VARIANT;

    if (!variantId) {
      return res.status(500).json({
        error: isWp ? 'Wallpaper product not configured' : 'Reading product not configured'
      });
    }

    // 构造产品名称与说明
    const productName = isWp
      ? (lang === 'zh' ? `八字壁纸 · ${element}元素` : `BaZi Wallpaper · ${element} Element`)
      : (lang === 'zh' ? '八字完整命盘深度解读' : 'Full BaZi Reading Unlock');

    const productDesc = isWp
      ? (lang === 'zh' ? `1080×1920 专属${element}元素壁纸，立即下载` : `1080×1920 personalised ${element} element wallpaper, instant download`)
      : (lang === 'zh' ? 'AI驱动的完整八字命盘解读，含五行分析、事业财运感情健康' : 'AI-powered complete BaZi analysis: elements, career, wealth, love & health');

    // 回调 URL（带参数，支付完成后跳回）
    const returnHash  = isWp ? `${chartHash}_wp_${element}` : chartHash;
    const redirectUrl = `${siteUrl}/calculator/?unlock=pending&hash=${encodeURIComponent(returnHash)}&lang=${lang || 'en'}&type=${productType}${element ? `&element=${element}` : ''}`;

    const body = {
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            custom: {
              chart_hash:   String(chartHash),
              lang:         String(lang || 'en'),
              product_type: String(productType),
              element:      String(element || '')
            }
          },
          product_options: {
            name:         productName,
            description:  productDesc,
            redirect_url: redirectUrl
          }
        },
        relationships: {
          store:   { data: { type: 'stores',   id: String(LS_STORE_ID)  } },
          variant: { data: { type: 'variants',  id: String(variantId)   } }
        }
      }
    };

    const lsRes = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        'Accept':        'application/vnd.api+json',
        'Content-Type':  'application/vnd.api+json',
        'Authorization': `Bearer ${LS_API_KEY}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });

    if (!lsRes.ok) {
      const err = await lsRes.text();
      console.error('LS checkout error:', lsRes.status, err);
      return res.status(502).json({ error: 'Failed to create checkout session' });
    }

    const data        = await lsRes.json();
    const checkoutUrl = data.data?.attributes?.url;
    if (!checkoutUrl) return res.status(500).json({ error: 'No checkout URL returned' });

    return res.status(200).json({ checkoutUrl, productType });

  } catch (err) {
    console.error('create-checkout error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
