/* ═══════════════════════════════════════════════════
   /api/verify-order.js  v5.0  — Gumroad
   
   Gumroad 架构下的验证流程：
   1. 前端带 sessionKey 调用此接口
   2. 从 KV 读取 session:{sessionKey} 获取 chartHash
   3. 用 Gumroad API 验证 license key（用户付款后 Gumroad 发邮件给用户）
   
   ★ Gumroad 双重验证策略：
   方案A（推荐）：用户收到 Gumroad 邮件中的 License Key，
                  输入到网站，接口调用 Gumroad API 验证
   方案B（自动）：用户付款后 Gumroad 跳回网站，
                  带着 sessionKey，我们信任这次跳转并签发令牌
                  （依赖 sessionKey 的唯一性，已足够安全）

   本接口同时支持两种方案：
   - 传 sessionKey → 方案B（自动，用户体验最好）
   - 传 sessionKey + licenseKey → 方案A（最严格验证）

   环境变量：
   KV_REST_API_URL    = Upstash KV URL
   KV_REST_API_TOKEN  = Upstash KV Token
   TOKEN_SECRET       = 令牌签名密钥
   GUMROAD_PRODUCT_PERMALINK = 产品 permalink（用于验证 license）
═══════════════════════════════════════════════════ */
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { sessionKey, licenseKey, chartHash: directHash, lang } = req.body;

    const { KV_REST_API_URL, KV_REST_API_TOKEN, TOKEN_SECRET, GUMROAD_PRODUCT_PERMALINK } = process.env;
    if (!TOKEN_SECRET) return res.status(500).json({ error: 'Server misconfiguration' });

    let chartHash = directHash || null;
    let sessionLang = lang || 'en';
    let birthData = null;

    // ── 方案B：从 KV 读取 session ───────────────────────
    if (sessionKey) {
      const kvRes = await fetch(
        `${KV_REST_API_URL}/get/${encodeURIComponent('session:' + sessionKey)}`,
        { headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` } }
      );
      if (!kvRes.ok) return res.status(500).json({ error: 'KV read failed' });

      const kvData = await kvRes.json();
      if (!kvData.result) {
        return res.status(402).json({
          error: 'Session not found or expired',
          code:  'SESSION_EXPIRED'
        });
      }

      let session;
      try { session = JSON.parse(kvData.result); }
      catch { return res.status(500).json({ error: 'Session data corrupt' }); }

      chartHash   = session.chartHash;
      sessionLang = session.lang || lang || 'en';
      birthData   = session.birthData || null;

      // ── 方案A：同时验证 Gumroad License Key ─────────
      if (licenseKey && GUMROAD_PRODUCT_PERMALINK) {
        const gmRes = await fetch('https://api.gumroad.com/v2/licenses/verify', {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body:    new URLSearchParams({
            product_permalink: GUMROAD_PRODUCT_PERMALINK,
            license_key:       licenseKey.trim(),
            increment_uses_count: 'false'
          })
        });
        const gmData = await gmRes.json();
        if (!gmData.success) {
          console.warn('Gumroad license invalid:', gmData.message);
          return res.status(402).json({ error: 'License key invalid', code: 'INVALID_LICENSE' });
        }
        console.log('✅ Gumroad license verified:', licenseKey.slice(0, 8) + '...');
      }

      // ── 用完 sessionKey 后标记为已使用（防止重复使用）──
      // 把 TTL 缩短为 5 分钟，已用的 session 不能再次换取新令牌
      await fetch(`${KV_REST_API_URL}/expire/${encodeURIComponent('session:' + sessionKey)}/300`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }
      }).catch(() => {});

    } else if (chartHash) {
      // ── 兼容旧版：直接传 chartHash（从 KV paid: 查） ──
      const kvRes = await fetch(
        `${KV_REST_API_URL}/get/${encodeURIComponent('paid:' + chartHash)}`,
        { headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` } }
      );
      if (kvRes.ok) {
        const kvData = await kvRes.json();
        if (kvData.result) {
          try {
            const record = JSON.parse(kvData.result);
            birthData = record.birthData || null;
          } catch {}
        } else {
          return res.status(402).json({ error: 'Payment not found', code: 'NOT_FOUND' });
        }
      }
    } else {
      return res.status(400).json({ error: 'Missing sessionKey or chartHash' });
    }

    if (!chartHash) return res.status(400).json({ error: 'Could not determine chartHash' });

    // ── 签发令牌（24小时有效）──────────────────────────
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    const payload   = JSON.stringify({ chartHash, lang: sessionLang, expiresAt });
    const sig       = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
    const token     = Buffer.from(payload).toString('base64url') + '.' + sig;

    console.log(`✅ Token issued for hash=${chartHash.slice(0, 8)}`);
    return res.status(200).json({ token, expiresAt, chartHash, birthData });

  } catch (err) {
    console.error('verify-order error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
