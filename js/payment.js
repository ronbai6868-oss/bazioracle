/* payment.js  v5.0
   - AI分析结果存入 localStorage（永久，按 chartHash）
   - 支持从缓存直接恢复，无需重新调用API
   - 收起/展开AI解读
   - 支付跳转传递 birthData
*/

/* ── 命盘 Hash ─────────────────────────────────── */
function getChartHash(pillars) {
  const key = ['year','month','day','hour'].map(k => pillars[k].stem + pillars[k].branch).join('');
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/* ── 令牌（sessionStorage）──────────────────────── */
const TOKEN_KEY = 'bazi_unlock_token';
function saveToken(t)  { try { sessionStorage.setItem(TOKEN_KEY, t); } catch(e){} }
function loadToken()   { try { return sessionStorage.getItem(TOKEN_KEY); } catch(e){ return null; } }
function clearToken()  { try { sessionStorage.removeItem(TOKEN_KEY); } catch(e){} }

/* ── AI分析永久缓存（localStorage）─────────────── */
function saveAnalysis(chartHash, text) {
  try {
    const store = JSON.parse(localStorage.getItem('bazi_analyses') || '{}');
    store[chartHash] = { text, savedAt: Date.now() };
    const keys = Object.keys(store);
    if (keys.length > 20) {
      const oldest = keys.sort((a,b) => store[a].savedAt - store[b].savedAt)[0];
      delete store[oldest];
    }
    localStorage.setItem('bazi_analyses', JSON.stringify(store));
  } catch(e) {}
}
function loadAnalysis(chartHash) {
  try {
    return JSON.parse(localStorage.getItem('bazi_analyses') || '{}')[chartHash]?.text || null;
  } catch(e) { return null; }
}

/* ── 已解锁判断 ─────────────────────────────────── */
function isUnlocked(chartHash) {
  // 先检查 localStorage 是否有缓存的分析结果（永久有效）
  if (loadAnalysis(chartHash)) return true;
  // 再检查 session token
  const token = loadToken();
  if (!token) return false;
  try {
    const lastDot = token.lastIndexOf('.');
    if (lastDot === -1) return false;
    const payload = JSON.parse(atob(token.slice(0,lastDot).replace(/-/g,'+').replace(/_/g,'/')));
    if (Date.now() > payload.expiresAt) { clearToken(); return false; }
    if (payload.chartHash && payload.chartHash !== chartHash) return false;
    return true;
  } catch { return false; }
}
function getStoredToken() { return loadToken(); }

/* ── 发起支付（传 birthData 供结果页恢复用）──────── */
function startPayment(chartHash, lang, productType = 'reading', element = null) {
  const btnId = productType === 'wallpaper' ? `btn-wp-${element}` : 'unlock-btn';
  const btn   = document.getElementById(btnId);
  if (btn) { btn.disabled = true; btn.textContent = lang==='zh' ? '跳转中...' : 'Redirecting...'; }

  // 把命盘原始生日数据打包传过去
  const birthData = window._currentChart
    ? { y: window._currentBirth?.y, m: window._currentBirth?.m, d: window._currentBirth?.d, h: window._currentBirth?.h }
    : null;

  const body = productType === 'wallpaper'
    ? { chartHash, lang, productType: 'wallpaper', element, birthData }
    : { chartHash, lang, productType: 'reading', birthData };

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
    if (btn) { btn.disabled = false; btn.textContent = lang==='zh' ? '✦ 解锁完整解读 — ¥29.9' : '✦ Unlock Full Reading — $3.99'; }
  });
}

/* ── 验证支付（供结果页调用）────────────────────── */
async function handlePaymentReturn(chartHash, lang, onProgress) {
  const maxAttempts = 8;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 进度回调：让调用方能更新UI
    if (onProgress) onProgress(attempt, maxAttempts);
    try {
      const res  = await fetch('/api/verify-order', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chartHash, lang })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        saveToken(data.token);
        return data;
      }
      if (res.status === 402 && attempt < maxAttempts) {
        const waitSec = attempt * 2;
        console.log(`Attempt ${attempt}/${maxAttempts}: waiting ${waitSec}s...`);
        await sleep(waitSec * 1000);
        continue;
      }
      // 402 且已达最大次数，或其他错误
      throw new Error(data.error || 'Payment not confirmed');
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await sleep(2000);
    }
  }
  throw new Error('Could not verify payment after multiple attempts');
}

/* ── 调用 AI 解读 ────────────────────────────────── */
async function requestAnalysis(pillars, balance, missing, weak, strong, lang, chartHash) {
  // 先查缓存
  const cached = loadAnalysis(chartHash);
  if (cached) return cached;

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
  if (data.analysis) saveAnalysis(chartHash, data.analysis);
  return data.analysis;
}

/* ── Markdown → HTML 转换 ─────────────────────────── */
function mdToHtml(text) {
  if (!text) return '';
  // 按行处理，避免混乱的正则嵌套
  const lines = text.split('\n');
  const out   = [];
  let inUl    = false;

  lines.forEach(line => {
    // ### 标题行
    const h3 = line.match(/^###\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    if (h3 || h2) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      const txt = h3 ? h3[1] : h2[1];
      out.push('<h4 class="md-h3">' + fmtInline(txt) + '</h4>');
      return;
    }
    // 列表项
    const li = line.match(/^[-*]\s+(.+)/) || line.match(/^\d+\.\s+(.+)/);
    if (li) {
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push('<li>' + fmtInline(li[1]) + '</li>');
      return;
    }
    // 关闭列表
    if (inUl) { out.push('</ul>'); inUl = false; }
    // 空行
    if (!line.trim()) { out.push('<br>'); return; }
    // 普通段落行
    out.push(fmtInline(line) + '<br>');
  });

  if (inUl) out.push('</ul>');
  return out.join('\n');
}

function fmtInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
}

/* ── 渲染AI解读（收起/展开）──────────────────────── */
function renderAnalysis(analysisText, lang) {
  const el = document.getElementById('ai-analysis-section');
  if (!el) return;

  // 按 ### 标题分段
  let sections = [], currentTitle = '', currentLines = [];
  analysisText.split('\n').forEach(line => {
    const h3 = line.match(/^###\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const boldLine = line.match(/^\*\*(.+?)\*\*\s*$/);
    const titleMatch = h3 || h2 || boldLine;
    if (titleMatch) {
      if (currentTitle || currentLines.length)
        sections.push({ title: currentTitle, body: currentLines.join('\n').trim() });
      currentTitle = (h3 || h2) ? titleMatch[1] : boldLine[1];
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  });
  if (currentTitle || currentLines.length)
    sections.push({ title: currentTitle, body: currentLines.join('\n').trim() });

  const sectionsHtml = sections.map((s, i) => {
    const bodyHtml = s.body ? '<div class="ai-body">' + mdToHtml(s.body) + '</div>' : '';
    return `<div class="ai-section${i >= 2 ? ' ai-section-collapsed' : ''}">
      ${s.title ? `<h4>${s.title}</h4>` : ''}
      ${bodyHtml}
    </div>`;
  }).join('');

  el.style.display = 'block';
  el.innerHTML = `
    <div class="ai-analysis-card">
      <div class="ai-analysis-header">
        <div>
          <span class="ai-badge-pro">✦ AI ${lang==='zh'?'深度解读':'Deep Reading'}</span>
          <h3>${lang==='zh'?'您的专属八字命盘解读':'Your Personal BaZi Analysis'}</h3>
        </div>
        <button class="btn-save-pdf btn-gold btn btn-sm" onclick="window._downloadPDF && window._downloadPDF()">
          📄 ${lang==='zh'?'保存报告':'Save PDF'}
        </button>
      </div>
      <div id="ai-sections-wrap">${sectionsHtml}</div>
      ${sections.length > 2 ? `<div class="ai-toggle-wrap">
        <button class="btn-ai-toggle" id="ai-toggle-btn" onclick="toggleAISections()">
          ${lang==='zh' ? '▼ 展开完整解读' : '▼ Show Full Reading'}
        </button>
      </div>` : ''}
    </div>`;
  el.dataset.lang = lang;
}

function toggleAISections() {
  const wrap = document.getElementById('ai-sections-wrap');
  const btn  = document.getElementById('ai-toggle-btn');
  if (!wrap || !btn) return;
  const lang = document.getElementById('ai-analysis-section')?.dataset.lang || 'en';
  const collapsed = wrap.querySelectorAll('.ai-section-collapsed');
  if (collapsed.length > 0) {
    collapsed.forEach(s => s.classList.remove('ai-section-collapsed'));
    btn.textContent = lang==='zh' ? '▲ 收起解读' : '▲ Collapse Reading';
  } else {
    wrap.querySelectorAll('.ai-section').forEach((s,i) => { if (i >= 2) s.classList.add('ai-section-collapsed'); });
    btn.textContent = lang==='zh' ? '▼ 展开完整解读' : '▼ Show Full Reading';
    wrap.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }
}

function showAnalysisLoading(lang) {
  const el = document.getElementById('ai-analysis-section');
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = `<div class="ai-analysis-card"><div class="ai-loading">
    <div class="ai-dots"><span></span><span></span><span></span></div>
    <p style="margin-top:1rem;color:rgba(255,255,255,.6)">${lang==='zh'
      ? '✦ AI 正在解读您的命盘，通常需要10-20秒...'
      : '✦ AI is reading your chart, usually takes 10-20 seconds...'}</p>
  </div></div>`;
}

function showUnlockSuccess(lang) {
  const el = document.getElementById('unlock-success');
  if (!el) return;
  el.style.display = 'flex';
  el.innerHTML = `<span>✅</span><span>${lang==='zh' ? '支付成功！完整命盘解读已解锁。' : 'Payment successful! Full reading unlocked.'}</span>`;
}

/* ── 工具 ────────────────────────────────────────── */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function checkPaymentReturn() {
  const p = new URLSearchParams(window.location.search);
  if (p.get('unlock') !== 'pending') return null;
  const hash = p.get('hash');
  if (!hash) return null;
  return { chartHash: hash, lang: p.get('lang') || 'en', productType: p.get('type') || 'reading', element: p.get('element') || null };
}
function cleanUrl() {
  const url = new URL(window.location.href);
  ['unlock','order_id','hash','lang','type','element'].forEach(k => url.searchParams.delete(k));
  window.history.replaceState({}, '', url.toString());
}

/* ── 壁纸令牌 ────────────────────────────────────── */
const WP_TOKEN_KEY = 'bazi_wp_tokens';
function saveWpToken(el, t) {
  try { const m = JSON.parse(sessionStorage.getItem(WP_TOKEN_KEY)||'{}'); m[el]=t; sessionStorage.setItem(WP_TOKEN_KEY,JSON.stringify(m)); } catch(e){}
}
function isWallpaperUnlocked(chartHash) { return isUnlocked(chartHash); }
function isWpElementUnlocked(element) {
  try {
    const m = JSON.parse(sessionStorage.getItem(WP_TOKEN_KEY)||'{}');
    if (!m[element]) return false;
    const ld = m[element].lastIndexOf('.');
    if (ld===-1) return false;
    const p = JSON.parse(atob(m[element].slice(0,ld).replace(/-/g,'+').replace(/_/g,'/')));
    return Date.now() <= p.expiresAt;
  } catch { return false; }
}
