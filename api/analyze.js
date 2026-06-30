/* ═══════════════════════════════════════════════════
   /api/analyze.js
   验证令牌 → 调用 DeepSeek → 返回八字深度解读
   
   安全机制：
   1. 验证 HMAC 令牌签名（防伪造）
   2. 验证令牌过期时间（2小时）
   3. 验证命盘 Hash（令牌只能用于对应命盘）
   4. API Key 只在服务端，永不暴露给前端
   
   环境变量：
   TOKEN_SECRET      = 令牌签名密钥（与 webhook.js 相同）
   DEEPSEEK_API_KEY  = DeepSeek API Key
═══════════════════════════════════════════════════ */
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Unlock-Token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { pillars, balance, missing, weak, strong, lang, chartHash } = req.body;
    const token = req.headers['x-unlock-token'];

    // ── 1. 验证解锁令牌 ────────────────────────────────────
    const tokenSecret = process.env.TOKEN_SECRET;
    if (!tokenSecret) return res.status(500).json({ error: 'Server misconfiguration' });

    if (!token) {
      return res.status(402).json({
        error: 'Payment required',
        code: 'NO_TOKEN',
        message: 'Please complete payment to unlock the full analysis.'
      });
    }

    // 拆分 payload 和签名
    const lastDot = token.lastIndexOf('.');
    if (lastDot === -1) {
      return res.status(401).json({ error: 'Invalid token format', code: 'BAD_TOKEN' });
    }

    const payloadB64  = token.slice(0, lastDot);
    const tokenSig    = token.slice(lastDot + 1);

    // 验证签名（防伪造）
    const expectedSig = crypto
      .createHmac('sha256', tokenSecret)
      .update(Buffer.from(payloadB64, 'base64url').toString())
      .digest('hex');

    const sigBuf = Buffer.from(tokenSig, 'hex');
    const expBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(401).json({ error: 'Invalid token', code: 'BAD_SIGNATURE' });
    }

    // 解析 payload
    let payload;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    } catch {
      return res.status(401).json({ error: 'Malformed token', code: 'BAD_PAYLOAD' });
    }

    // 验证过期时间
    if (Date.now() > payload.expiresAt) {
      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
        message: 'Your unlock link has expired. Please contact support.'
      });
    }

    // 验证命盘 Hash（令牌只能用于付款时绑定的那份命盘）
    if (payload.chartHash && chartHash && payload.chartHash !== chartHash) {
      return res.status(401).json({
        error: 'Token chart mismatch',
        code: 'CHART_MISMATCH',
        message: 'This token was issued for a different chart.'
      });
    }

    // ── 2. 令牌验证通过，校验命盘数据 ─────────────────────
    if (!pillars?.day?.stem) {
      return res.status(400).json({ error: 'Invalid chart data' });
    }

    // ── 3. 调用 DeepSeek API ───────────────────────────────
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      console.error('DEEPSEEK_API_KEY not configured');
      return res.status(500).json({ error: 'AI service not configured' });
    }

    const isZh = (payload.lang || lang) === 'zh';
    const prompt = buildPrompt(pillars, balance, missing, weak, strong, isZh);

    const dsRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: isZh
              ? '你是一位精通八字命理的资深专家，融合传统命理智慧与现代心理学视角。你的解读深刻、温暖、具体、积极向上，给出真正有价值的人生指引，避免模糊笼统。'
              : 'You are a master BaZi Four Pillars analyst blending traditional Chinese metaphysics with modern psychological insight. Your readings are specific, warm, empowering, and practically useful — never vague or generic.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2000,
        temperature: 0.72,
        stream: false
      }),
      signal: AbortSignal.timeout(28000)
    });

    if (!dsRes.ok) {
      const errText = await dsRes.text();
      console.error('DeepSeek error:', dsRes.status, errText.slice(0, 200));
      return res.status(502).json({
        error: 'Analysis service temporarily unavailable. Please try again in a moment.'
      });
    }

    const data     = await dsRes.json();
    const analysis = data.choices?.[0]?.message?.content;

    if (!analysis) {
      return res.status(500).json({ error: 'Failed to generate analysis' });
    }

    return res.status(200).json({
      analysis,
      orderId: payload.orderId,
      generatedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('Analyze handler error:', err);
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Analysis timed out. Please try again.' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* ── DeepSeek Prompt（中英双语）──────────────────────────── */
function buildPrompt(pillars, balance, missing, weak, strong, isZh) {
  const EL_ZH = { Wood:'木', Fire:'火', Earth:'土', Metal:'金', Water:'水' };

  if (isZh) {
    const balStr     = Object.entries(balance).map(([e,n])=>`${EL_ZH[e]}${n}个`).join('、');
    const missingStr = missing.length ? missing.map(e=>EL_ZH[e]).join('、') : '无';
    const weakStr    = weak.filter(w=>!missing.includes(w)).map(e=>EL_ZH[e]).join('、') || '无';
    const strongStr  = strong.map(e=>EL_ZH[e]).join('、') || '无';

    return `请对以下八字命盘进行详细深度解读：

【命盘数据】
年柱：${pillars.year.stem}${pillars.year.branch}（${EL_ZH[pillars.year.stemEl]}/${EL_ZH[pillars.year.branchEl]}）
月柱：${pillars.month.stem}${pillars.month.branch}（${EL_ZH[pillars.month.stemEl]}/${EL_ZH[pillars.month.branchEl]}）
日柱：${pillars.day.stem}${pillars.day.branch}（${EL_ZH[pillars.day.stemEl]}/${EL_ZH[pillars.day.branchEl]}）← 日主
时柱：${pillars.hour.stem}${pillars.hour.branch}（${EL_ZH[pillars.hour.stemEl]}/${EL_ZH[pillars.hour.branchEl]}）

日主：${pillars.day.stem}（${EL_ZH[pillars.day.stemEl]}）
五行分布：${balStr}
缺失五行：${missingStr}
薄弱五行：${weakStr}
旺盛五行：${strongStr}

【请按以下结构进行深度解读，总字数700-900字】

**一、命主核心特质与天赋**
（基于日主和整体格局，具体描述此人的性格优势、思维方式和天然才能）

**二、五行喜用神分析**
（指出最有益的五行元素，以及需要平衡的五行，给出具体日常建议）

**三、事业与财运方向**
（适合的行业领域、赚钱方式、职场优势和财务注意事项）

**四、感情与婚姻特质**
（感情模式、择偶建议、婚姻相处之道）

**五、健康养生要点**
（基于五行对应脏腑，给出具体健康建议）

**六、近期最重要的3条人生建议**
（结合命盘现状，给出最有价值的调整方向）

语气温暖、具体、积极。避免模糊表述，每条分析都要有具体的落地建议。`;
  }

  const balStr     = Object.entries(balance).map(([e,n])=>`${e}(${n})`).join(', ');
  const missingStr = missing.length ? missing.join(', ') : 'None';
  const weakStr    = weak.filter(w=>!missing.includes(w)).join(', ') || 'None';
  const strongStr  = strong.join(', ') || 'None';

  return `Please provide a detailed BaZi Four Pillars analysis for this birth chart:

[Chart Data]
Year Pillar:  ${pillars.year.stem}${pillars.year.branch} (${pillars.year.stemEl}/${pillars.year.branchEl})
Month Pillar: ${pillars.month.stem}${pillars.month.branch} (${pillars.month.stemEl}/${pillars.month.branchEl})
Day Pillar:   ${pillars.day.stem}${pillars.day.branch} (${pillars.day.stemEl}/${pillars.day.branchEl}) ← Day Master
Hour Pillar:  ${pillars.hour.stem}${pillars.hour.branch} (${pillars.hour.stemEl}/${pillars.hour.branchEl})

Day Master: ${pillars.day.stem} (${pillars.day.stemEl})
Element Distribution: ${balStr}
Missing: ${missingStr} | Weak: ${weakStr} | Strong: ${strongStr}

[Structure your analysis as follows, ~500-600 words]

**1. Core Personality & Natural Gifts**
(Specific traits, thinking style, and innate talents — be concrete, not generic)

**2. Beneficial Elements (用神 Yong Shen)**
(Which elements most support this person, practical daily recommendations)

**3. Career & Wealth Path**
(Best industries, wealth-generating style, career strengths, financial pitfalls)

**4. Love & Relationships**
(Relationship patterns, ideal partner qualities, marriage dynamics)

**5. Health & Wellness**
(Element-organ correspondences, specific health areas to monitor and support)

**6. Top 3 Life Recommendations**
(The most impactful changes this person can make right now)

Tone: warm, specific, empowering. Every insight must have a practical takeaway.`;
}
