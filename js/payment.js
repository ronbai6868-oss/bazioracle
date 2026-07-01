/* ═══════════════════════════════════════════════════
   payment.js  v2.2
═══════════════════════════════════════════════════ */

/* ── 命盘 Hash ───────────────────────────────────── */
function getChartHash(pillars) {
  const key = ['year','month','day','hour']
    .map(k => pillars[k].stem + pillars[k].branch).join('');
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/* ── 令牌存储 ────────────────────────────────────── */
const TOKEN_KEY = 'bazi_unlock_token';
function saveToken(token)  { try { sessionStorage.setItem(TOKEN_KEY, token); } catch(e){} }
function loadToken()       { try { return sessionStorage.getItem(TOKEN_KEY); } catch(e){ return null; } }
function clearToken()      { try { sessionStorage.removeItem(TOKEN_KEY); } catch(e){} }

/* ── 判断是否已解锁 ──────────────────────────────── */
function isUnlocked(chartHash) {
  const token = loadToken();
  if (!token) return false;
  try {
    const lastDot = token.lastIndexOf('.');
    if (lastDot === -1) return false;
    const payload = JSON.parse(atob(token.slice(0, lastDot).replace(/-/g,'+').replace(/_/g,'/')));
    if (Date.now() > payload.expiresAt) { clearToken(); return false; }
    if (payload.chartHash && payload.chartHash !== chartHash) return false;
    return true;
  } catch { return false; }
}

function getStoredToken() { return loadToken(); }

/* ── 支付回调处理 ────────────────────────────────── */
async function handlePaymentReturn(orderId, chartHash, lang) {
  showPaymentVerifying(lang);

  // ★ 防御：orderId 是字面量 {order_id} 说明 LS 模板未替换
  if (!orderId || orderId === '{order_id}') {
    console.error('order_id 未被 Lemon Squeezy 替换，请检查 redirect_url 配置');
    throw new Error('Invalid order_id from Lemon Squeezy redirect');
  }

  // 重试最多 5 次（Webhook 可能比 redirect 晚几秒）
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch('/api/verify-order', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderId, chartHash, lang })
      });
      const data = await res.json();

      if (res.ok && data.token) {
        saveToken(data.token);
        return data.token;
      }

      if (res.status === 402 && attempt < 5) {
        console.log(`verify-order 402，第 ${attempt} 次重试...`, data);
        await sleep(2000 * attempt);
        continue;
      }

      throw new Error(data.error || 'Verification failed');

    } catch (err) {
      if (attempt === 5) throw err;
      await sleep(2000);
    }
  }
  throw new Error('Could not verify payment status');
}

/* ── 调用 AI 解读 ─────────────────────────────────── */
async function requestAnalysis(pillars, balance, missing, weak, strong, lang, chartHash) {
  const token = getStoredToken();
  if (!token) throw new Error('No unlock token');

  const res = await fetch('/api/analyze', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Unlock-Token': token },
    body:    JSON.stringify({ pillars, balance, missing, weak, strong, lang, chartHash })
  });

  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 || res.status === 402) clearToken();
    throw new Error(data.error || `API error ${res.status}`);
  }
  return data.analysis;
}

/* ── UI 辅助 ─────────────────────────────────────── */
function showPaymentVerifying(lang) {
  const el = document.getElementById('payment-status');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = `
    <div class="payment-loading">
      <div class="spinner"></div>
      <p>${lang==='zh' ? '正在验证您的支付，请稍候...' : 'Verifying your payment, please wait...'}</p>
    </div>`;
}

function showAnalysisLoading(lang) {
  const el = document.getElementById('ai-analysis-section');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = `
    <div class="ai-analysis-card">
      <div class="ai-loading">
        <div class="ai-dots"><span></span><span></span><span></span></div>
        <p style="margin-top:1rem">${lang==='zh'
          ? '✦ AI 正在解读您的命盘，通常需要10-20秒...'
          : '✦ AI is reading your chart, usually takes 10-20 seconds...'}</p>
      </div>
    </div>`;
}

function renderAnalysis(analysisText, lang) {
  const el = document.getElementById('ai-analysis-section');
  if (!el) return;
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
    <span>${lang==='zh' ? '支付成功！完整命盘解读已解锁。' : 'Payment successful! Full reading unlocked.'}</span>`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── 检查 URL 参数（支付回调）────────────────────── */
function checkPaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('unlock') !== 'pending') return null;
  const orderId = params.get('order_id');
  // ★ 如果 orderId 是字面量模板，当作没有
  return {
    orderId:     (orderId && orderId !== '{order_id}') ? orderId : null,
    chartHash:   params.get('hash'),
    lang:        params.get('lang') || 'en',
    productType: params.get('type') || 'reading',
    element:     params.get('element') || null
  };
}

/* ── 清理 URL ────────────────────────────────────── */
function cleanUrl() {
  const url = new URL(window.location.href);
  ['unlock','order_id','hash','lang','type','element'].forEach(k => url.searchParams.delete(k));
  window.history.replaceState({}, '', url.toString());
}

/* ── 壁纸令牌 ────────────────────────────────────── */
const WP_TOKEN_KEY = 'bazi_wp_tokens';

function saveWpToken(element, token) {
  try {
    const map = JSON.parse(sessionStorage.getItem(WP_TOKEN_KEY) || '{}');
    map[element] = token;
    sessionStorage.setItem(WP_TOKEN_KEY, JSON.stringify(map));
  } catch(e) {}
}

function isWallpaperUnlocked(chartHash) { return isUnlocked(chartHash); }

function isWpElementUnlocked(element) {
  try {
    const map = JSON.parse(sessionStorage.getItem(WP_TOKEN_KEY) || '{}');
    if (!map[element]) return false;
    const lastDot = map[element].lastIndexOf('.');
    if (lastDot === -1) return false;
    const payload = JSON.parse(atob(map[element].slice(0, lastDot).replace(/-/g,'+').replace(/_/g,'/')));
    return Date.now() <= payload.expiresAt;
  } catch { return false; }
}

/* ── 发起支付（支持完整解读 + 壁纸）─────────────── */
function startPayment(chartHash, lang, productType = 'reading', element = null) {
  const btnId = productType === 'wallpaper' ? `btn-wp-${element}` : 'unlock-btn';
  const btn   = document.getElementById(btnId);
  if (btn) btn.disabled = true;

  const body = productType === 'wallpaper'
    ? { chartHash, lang, productType: 'wallpaper', element }
    : { chartHash, lang, productType: 'reading' };

  fetch('/api/create-checkout', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body)
  })
  .then(r => r.json())
  .then(data => {
    if (!data.checkoutUrl) {
      console.error('Checkout error:', data);
      throw new Error(data.error || 'No checkout URL');
    }
    window.location.href = data.checkoutUrl;
  })
  .catch(err => {
    console.error('startPayment error:', err);
    alert(lang === 'zh' ? '支付跳转失败，请稍后重试。' : 'Could not redirect to checkout. Please try again.');
    if (btn) btn.disabled = false;
  });
}
