/* ═══════════════════════════════════════════════════
   payment.js — 前端支付与解锁逻辑
   
   职责：
   1. 计算命盘 Hash（绑定令牌与命盘，防止复用）
   2. 发起 Lemon Squeezy 结账流程
   3. 支付回来后验证订单，获取令牌
   4. 令牌验证通过后调用 DeepSeek 解读
   5. 渲染付费内容
   
   关键安全：API Key 永远不出现在此文件
             所有敏感操作走 /api/* 服务端接口
═══════════════════════════════════════════════════ */

/* ── 命盘 Hash（用于绑定令牌与命盘）────────────────────── */
function getChartHash(pillars) {
  const key = ['year','month','day','hour']
    .map(k => pillars[k].stem + pillars[k].branch)
    .join('');
  // djb2 hash（浏览器端无需 crypto）
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/* ── 令牌存储（sessionStorage，关闭标签页自动清除）──────── */
const TOKEN_KEY = 'bazi_unlock_token';
function saveToken(token)  { try { sessionStorage.setItem(TOKEN_KEY, token); } catch(e){} }
function loadToken()       { try { return sessionStorage.getItem(TOKEN_KEY); } catch(e){ return null; } }
function clearToken()      { try { sessionStorage.removeItem(TOKEN_KEY); } catch(e){} }

/* ── 判断当前命盘是否已解锁 ─────────────────────────────── */
function isUnlocked(chartHash) {
  const token = loadToken();
  if (!token) return false;
  try {
    const lastDot = token.lastIndexOf('.');
    if (lastDot === -1) return false;
    const payload = JSON.parse(atob(token.slice(0, lastDot).replace(/-/g,'+').replace(/_/g,'/')));
    // 检查过期
    if (Date.now() > payload.expiresAt) { clearToken(); return false; }
    // 检查命盘匹配
    if (payload.chartHash && payload.chartHash !== chartHash) return false;
    return true;
  } catch { return false; }
}

function getStoredToken() { return loadToken(); }

/* ── 发起支付 ────────────────────────────────────────────── */
async function startPayment(chartHash, lang) {
  const btn = document.getElementById('unlock-btn');
  if (btn) { btn.disabled = true; btn.textContent = lang==='zh' ? '正在跳转...' : 'Redirecting...'; }

  try {
    const res = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartHash, lang })
    });
    const data = await res.json();
    if (!res.ok || !data.checkoutUrl) {
      throw new Error(data.error || 'Failed to create checkout');
    }
    // 跳转到 Lemon Squeezy 收银台
    window.location.href = data.checkoutUrl;
  } catch (err) {
    console.error('startPayment error:', err);
    alert(lang==='zh'
      ? '支付跳转失败，请稍后重试。'
      : 'Could not redirect to checkout. Please try again.');
    if (btn) { btn.disabled = false; btn.textContent = lang==='zh' ? '立即解锁' : 'Unlock Now'; }
  }
}

/* ── 支付回调处理（用户从 LS 收银台回来后调用）────────────── */
async function handlePaymentReturn(orderId, chartHash, lang) {
  showPaymentVerifying(lang);

  // 重试最多5次（Webhook 可能比 redirect 稍晚几秒）
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch('/api/verify-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, chartHash, lang })
      });
      const data = await res.json();

      if (res.ok && data.token) {
        saveToken(data.token);
        return data.token;
      }

      // 未支付 or 验证中，等待后重试
      if (res.status === 402 && attempt < 5) {
        await sleep(2000 * attempt);
        continue;
      }

      // 其他错误
      throw new Error(data.error || 'Verification failed');

    } catch (err) {
      if (attempt === 5) throw err;
      await sleep(2000);
    }
  }
  throw new Error('Payment verification timed out');
}

/* ── 调用 DeepSeek 解读（带令牌）──────────────────────────── */
async function requestAnalysis(pillars, balance, missing, weak, strong, lang, chartHash) {
  const token = getStoredToken();
  if (!token) throw new Error('No unlock token');

  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Unlock-Token': token
    },
    body: JSON.stringify({ pillars, balance, missing, weak, strong, lang, chartHash })
  });

  const data = await res.json();

  if (!res.ok) {
    if (res.status === 401 || res.status === 402) {
      clearToken(); // 令牌失效，清除
    }
    throw new Error(data.error || `API error ${res.status}`);
  }

  return data.analysis;
}

/* ── UI 辅助 ─────────────────────────────────────────────── */
function showPaymentVerifying(lang) {
  const el = document.getElementById('payment-status');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = `
    <div class="payment-loading">
      <div class="spinner"></div>
      <p>${lang==='zh'
        ? '正在验证您的支付，请稍候...'
        : 'Verifying your payment, please wait...'}</p>
    </div>`;
}

function showAnalysisLoading(lang) {
  const el = document.getElementById('ai-analysis-section');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = `
    <div class="ai-analysis-card">
      <div class="ai-loading">
        <div class="ai-dots">
          <span></span><span></span><span></span>
        </div>
        <p style="margin-top:1rem">${lang==='zh'
          ? '✦ AI 正在解读您的命盘，通常需要10-20秒...'
          : '✦ AI is reading your chart, usually takes 10-20 seconds...'}</p>
      </div>
    </div>`;
}

function renderAnalysis(analysisText, lang) {
  const el = document.getElementById('ai-analysis-section');
  if (!el) return;

  // 把 **标题** 格式转为 HTML
  const html = analysisText
    .replace(/\*\*(.+?)\*\*/g, '<h4>$1</h4>')
    .split('\n\n')
    .map(p => p.trim() ? `<p>${p.replace(/\n/g,'<br>')}</p>` : '')
    .join('');

  el.innerHTML = `
    <div class="ai-analysis-card">
      <div class="ai-analysis-header">
        <span class="ai-badge-pro">✦ AI ${lang==='zh'?'深度解读':'Deep Reading'}</span>
        <h3>${lang==='zh'?'您的专属八字命盘解读':'Your Personal BaZi Analysis'}</h3>
      </div>
      <div class="ai-content">${html}</div>
    </div>`;
}

function showUnlockSuccess(lang) {
  const el = document.getElementById('unlock-success');
  if (!el) return;
  el.style.display = 'flex';
  el.innerHTML = `
    <span class="check">✅</span>
    <span>${lang==='zh'
      ? '支付成功！完整命盘解读已解锁。'
      : 'Payment successful! Full reading unlocked.'}</span>`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── 检查 URL 参数（支付回调）──────────────────────────────── */
function checkPaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('unlock') !== 'pending') return null;
  return {
    orderId:     params.get('order_id'),
    chartHash:   params.get('hash'),
    lang:        params.get('lang') || 'en',
    productType: params.get('type') || 'reading',
    element:     params.get('element') || null
  };
}

/* 清理 URL（去掉支付参数，避免刷新重复验证）*/
function cleanUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('unlock');
  url.searchParams.delete('order_id');
  url.searchParams.delete('hash');
  window.history.replaceState({}, '', url.toString());
}

/* ═══════════════════════════════════════════════════
   壁纸支付扩展
   壁纸产品使用独立的 Lemon Squeezy Variant ID
═══════════════════════════════════════════════════ */
const WP_TOKEN_KEY = 'bazi_wp_tokens';

function saveWpToken(element, token) {
  try {
    const map = JSON.parse(sessionStorage.getItem(WP_TOKEN_KEY) || '{}');
    map[element] = token;
    sessionStorage.setItem(WP_TOKEN_KEY, JSON.stringify(map));
  } catch(e) {}
}

function isWallpaperUnlocked(chartHash) {
  // 若整个命盘解读已解锁，壁纸也视为解锁
  return isUnlocked(chartHash);
}

function isWpElementUnlocked(element) {
  try {
    const map = JSON.parse(sessionStorage.getItem(WP_TOKEN_KEY) || '{}');
    if (!map[element]) return false;
    const lastDot = map[element].lastIndexOf('.');
    if (lastDot === -1) return false;
    const payload = JSON.parse(atob(map[element].slice(0, lastDot)
      .replace(/-/g,'+').replace(/_/g,'/')));
    return Date.now() <= payload.expiresAt;
  } catch { return false; }
}

// 扩展 startPayment 支持壁纸产品
const _origStartPayment = typeof startPayment === 'function' ? startPayment : null;
function startPayment(chartHash, lang, productType = 'reading', element = null) {
  const btn = document.getElementById(productType === 'wallpaper' ? `btn-wp-${element}` : 'unlock-btn');
  if (btn) { btn.disabled = true; }

  const body = productType === 'wallpaper'
    ? { chartHash, lang, productType: 'wallpaper', element }
    : { chartHash, lang, productType: 'reading' };

  fetch('/api/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  .then(r => r.json())
  .then(data => {
    if (!data.checkoutUrl) {
      if (data.debug) console.error('LS debug detail:', data.debug);
      throw new Error(data.error || 'No checkout URL');
    }
    window.location.href = data.checkoutUrl;
  })
  .catch(err => {
    console.error('startPayment error:', err);
    alert(lang === 'zh'
      ? '支付跳转失败，请稍后重试。'
      : 'Could not redirect to checkout. Please try again.');
    if (btn) btn.disabled = false;
  });
}
