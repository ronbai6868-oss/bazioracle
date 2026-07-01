/* ═══════════════════════════════════════════════════
   payment.js  v3.0
   ★ 不再依赖 order_id，改用 chartHash 验证
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

/* ── 发起支付 ────────────────────────────────────── */
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
    if (!data.checkoutUrl) throw new Error(data.error || 'No checkout URL');
    window.location.href = data.checkoutUrl;
  })
  .catch(err => {
    console.error('startPayment error:', err);
    alert(lang === 'zh' ? '支付跳转失败，请稍后重试。' : 'Could not redirect to checkout. Please try again.');
    if (btn) btn.disabled = false;
  });
}

/* ── 支付回调处理 ────────────────────────────────── */
// ★ 改为传 chartHash，不再传 orderId
async function handlePaymentReturn(chartHash, lang) {
  showPaymentVerifying(lang);

  // 重试最多6次（每次间隔递增，最多等待约30秒）
  // LS 订单从支付完成到 API 可查询通常需要 2-5 秒
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch('/api/verify-order', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chartHash, lang })
      });
      const data = await res.json();

      if (res.ok && data.token) {
        saveToken(data.token);
        return data.token;
      }

      if (res.status === 402 && attempt < 6) {
        console.log(`Attempt ${attempt}: order not ready yet, retrying in ${attempt * 2}s...`);
        await sleep(attempt * 2000);
        continue;
      }

      throw new Error(data.error || 'Verification failed');

    } catch (err) {
      if (attempt === 6) throw err;
      await sleep(2000);
    }
  }
  throw new Error('Could not verify payment status after multiple attempts');
}

/* ── 调用 AI 解读 ────────────────────────────────── */
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
  // 把 **标题** 转为带 .ai-section 包裹的结构，确保 CSS 样式生效
  let sections = [];
  let currentTitle = '';
  let currentLines = [];
  analysisText.split('\n').forEach(line => {
    const titleMatch = line.match(/^\*\*(.+?)\*\*\s*$/);
    if (titleMatch) {
      if (currentTitle || currentLines.length) {
        sections.push({ title: currentTitle, body: currentLines.join('\n').trim() });
      }
      currentTitle = titleMatch[1];
      currentLines = [];
    } else {
      if (line.trim()) currentLines.push(line);
    }
  });
  if (currentTitle || currentLines.length) {
    sections.push({ title: currentTitle, body: currentLines.join('\n').trim() });
  }
  const html = sections.map(s => `
    <div class="ai-section">
      ${s.title ? `<h4>${s.title}</h4>` : ''}
      ${s.body ? `<p>${s.body.replace(/\n/g,'<br>')}</p>` : ''}
    </div>`).join('');
  el.innerHTML = `
    <div class="ai-analysis-card">
      <div class="ai-analysis-header">
        <span class="ai-badge-pro">✦ AI ${lang==='zh'?'深度解读':'Deep Reading'}</span>
        <h3>${lang==='zh'?'您的专属八字命盘解读':'Your Personal BaZi Analysis'}</h3>
      </div>
      ${html}
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

/* ── 检查 URL 支付回调参数 ───────────────────────── */
function checkPaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('unlock') !== 'pending') return null;
  const hash = params.get('hash');
  if (!hash) return null;
  return {
    chartHash:   hash,
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

function isWallpaperUnlocked(chartHash) {
  return isUnlocked(chartHash);
}

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
