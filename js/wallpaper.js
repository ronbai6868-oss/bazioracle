/* ═══════════════════════════════════════════════════
   wallpaper.js — 八字手机壁纸生成器
   
   方案：纯前端 Canvas 合成，零服务器成本
   - 5套元素背景（SVG渐变，每套对应一个五行）
   - 叠加用户天干汉字 + 元素符号 + 装饰纹样
   - 导出为 PNG，尺寸 1080×1920（手机壁纸标准）
   
   付费流程：同计算器，通过 Lemon Squeezy 付费后解锁下载
═══════════════════════════════════════════════════ */

/* ── 每种五行对应的壁纸配色方案 ─────────────────────────── */
const WALLPAPER_THEMES = {
  Wood: {
    name:    { en:'Forest Spirit', zh:'木之精灵' },
    bg1:     '#0A1F0F',  // 深墨绿
    bg2:     '#1A3D20',
    bg3:     '#2D5A3D',
    accent:  '#6BA868',  // 嫩绿
    gold:    '#C9A84C',
    symbol:  '木',
    emoji:   '🌿',
    pattern: 'bamboo',   // 竹纹
  },
  Fire: {
    name:    { en:'Eternal Flame', zh:'永恒之火' },
    bg1:     '#1A0505',
    bg2:     '#3D0D0D',
    bg3:     '#7A1C1C',
    accent:  '#E05050',
    gold:    '#F5A623',
    symbol:  '火',
    emoji:   '🔥',
    pattern: 'waves',
  },
  Earth: {
    name:    { en:'Golden Mountain', zh:'金色山岳' },
    bg1:     '#1A1205',
    bg2:     '#3D2D0A',
    bg3:     '#7A5C1C',
    accent:  '#D4A83A',
    gold:    '#C9A84C',
    symbol:  '土',
    emoji:   '⛰️',
    pattern: 'grid',
  },
  Metal: {
    name:    { en:'Moonlit Blade', zh:'月刃银辉' },
    bg1:     '#0A0F1A',
    bg2:     '#1A2035',
    bg3:     '#2C3A5C',
    accent:  '#8A9DC0',
    gold:    '#C8D8F0',
    symbol:  '金',
    emoji:   '⚔️',
    pattern: 'hexagon',
  },
  Water: {
    name:    { en:'Deep Ocean', zh:'深海之渊' },
    bg1:     '#050A1A',
    bg2:     '#0A1535',
    bg3:     '#142050',
    accent:  '#4A90D9',
    gold:    '#6BB8F5',
    symbol:  '水',
    emoji:   '🌊',
    pattern: 'ripple',
  }
};

/* ── 生成壁纸 Canvas ─────────────────────────────────────── */
function generateWallpaper(pillars, element, lang) {
  const theme = WALLPAPER_THEMES[element];
  if (!theme) return null;

  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ── 1. 背景渐变 ──
  const grad = ctx.createLinearGradient(0, 0, W * 0.3, H);
  grad.addColorStop(0,   theme.bg1);
  grad.addColorStop(0.4, theme.bg2);
  grad.addColorStop(1,   theme.bg3);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // ── 2. 装饰光晕（右上角） ──
  const radGrad = ctx.createRadialGradient(W * 0.8, H * 0.15, 50, W * 0.8, H * 0.15, W * 0.6);
  radGrad.addColorStop(0, theme.accent + '40');
  radGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, W, H);

  // ── 3. 八卦装饰圆圈 ──
  drawOctagonDecor(ctx, W / 2, H * 0.35, 300, theme.gold);

  // ── 4. 主元素汉字 ──
  ctx.save();
  ctx.font = `bold 280px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 发光效果
  ctx.shadowColor = theme.accent;
  ctx.shadowBlur  = 60;
  ctx.fillStyle   = theme.gold;
  ctx.fillText(theme.symbol, W / 2, H * 0.35);
  ctx.restore();

  // ── 5. 日主天干字 ──
  ctx.save();
  ctx.font = `normal 100px serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.shadowColor = theme.gold;
  ctx.shadowBlur  = 20;
  const dayChar = pillars.day.stem + pillars.day.branch;
  ctx.fillText(dayChar, W / 2, H * 0.35 + 200);
  ctx.restore();

  // ── 6. 四柱文字（居中展示）──
  const pillarsStr = ['year','month','day','hour']
    .map(k => pillars[k].stem + pillars[k].branch).join('  ');
  ctx.save();
  ctx.font = `normal 52px serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.letterSpacing = '8px';
  ctx.fillText(pillarsStr, W / 2, H * 0.58);
  ctx.restore();

  // ── 7. 分隔线 ──
  ctx.save();
  ctx.strokeStyle = theme.gold + '60';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(W * 0.2, H * 0.62);
  ctx.lineTo(W * 0.8, H * 0.62);
  ctx.stroke();
  ctx.restore();

  // ── 8. 元素名称（中英双语）──
  const elNameZh = { Wood:'木', Fire:'火', Earth:'土', Metal:'金', Water:'水' };
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = theme.gold;
  ctx.font = `600 44px 'DM Sans', sans-serif`;
  ctx.fillText(element.toUpperCase(), W / 2, H * 0.68);
  ctx.font = `normal 56px serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(theme.symbol + ' ' + (lang==='zh' ? theme.name.zh : theme.name.en), W / 2, H * 0.74);
  ctx.restore();

  // ── 9. 底部装饰 ──
  drawBottomDecor(ctx, W, H, theme);

  // ── 10. 品牌水印 ──
  ctx.save();
  ctx.font      = `normal 28px serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.textAlign = 'center';
  ctx.fillText('☯ BaZi Oracle · getbazioracle.com', W / 2, H - 60);
  ctx.restore();

  return canvas;
}

/* ── 八卦装饰圆 ─────────────────────────────────────────── */
function drawOctagonDecor(ctx, cx, cy, r, color) {
  // 外圆
  ctx.save();
  ctx.strokeStyle = color + '30';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // 中圆
  ctx.strokeStyle = color + '20';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
  ctx.stroke();
  // 八方射线
  ctx.strokeStyle = color + '15';
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * r * 0.1, cy + Math.sin(angle) * r * 0.1);
    ctx.lineTo(cx + Math.cos(angle) * r,        cy + Math.sin(angle) * r);
    ctx.stroke();
  }
  ctx.restore();
}

/* ── 底部装饰纹 ─────────────────────────────────────────── */
function drawBottomDecor(ctx, W, H, theme) {
  // 横向渐变线条
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const y    = H * 0.82 + i * 18;
    const grad = ctx.createLinearGradient(0, y, W, y);
    grad.addColorStop(0,   'transparent');
    grad.addColorStop(0.5, theme.gold + '40');
    grad.addColorStop(1,   'transparent');
    ctx.strokeStyle = grad;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
}

/* ── 壁纸预览（缩略图，用于展示）──────────────────────────  */
function generatePreviewCanvas(element, size = 200) {
  const theme  = WALLPAPER_THEMES[element];
  const aspect = 1080 / 1920;
  const W = size * aspect, H = size;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, W * 0.3, H);
  grad.addColorStop(0, theme.bg1);
  grad.addColorStop(1, theme.bg3);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.font      = `bold ${H * 0.35}px serif`;
  ctx.fillStyle = theme.gold;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = theme.accent;
  ctx.shadowBlur  = 15;
  ctx.fillText(theme.symbol, W / 2, H * 0.45);
  ctx.font      = `normal ${H * 0.1}px 'DM Sans',sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.shadowBlur = 0;
  ctx.fillText(element, W / 2, H * 0.72);
  return canvas;
}

/* ── 下载壁纸 ─────────────────────────────────────────────  */
function downloadWallpaper(canvas, element, lang) {
  const theme    = WALLPAPER_THEMES[element];
  // ★ 统一英文文件名，避免中文乱码
  const filename = `BaZi_Wallpaper_${element}_${theme.name.en.replace(/ /g,'_')}.png`;
  const link     = document.createElement('a');
  link.download  = filename;
  link.href      = canvas.toDataURL('image/png', 1.0);
  link.click();
}

/* ── 壁纸支付后自动打包下载（JSZip）────────────────────── */
async function autoDownloadWallpaperAfterPayment(pillars, element, lang) {
  // 生成购买的这张壁纸
  const canvas = generateWallpaper(pillars, element, lang);
  if (!canvas) return;

  // 尝试用 JSZip 打包（若加载失败则直接单张下载）
  try {
    // 动态加载 JSZip
    if (typeof JSZip === 'undefined') {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    const zip   = new JSZip();
    const theme = WALLPAPER_THEMES[element];
    const fname = `BaZi_Wallpaper_${element}_${theme.name.en.replace(/ /g,'_')}.png`;

    // canvas → blob
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png', 1.0));
    zip.file(fname, blob);

    // 加入使用说明
    const readme = `BaZi Wallpaper — ${element} (${theme.name.en})
========================================
Resolution: 1080 x 1920 px
Format: PNG
Generated by BaZi Oracle · getbazioracle.com

How to use:
1. Save this image to your phone
2. Go to Settings → Wallpaper → Choose Photo
3. Select this image and set as wallpaper

Your Four Pillars: ${['year','month','day','hour'].map(k=>pillars[k].stem+pillars[k].branch).join('  ')}
`;
    zip.file('README.txt', readme);

    const content  = await zip.generateAsync({ type: 'blob' });
    const zipLink  = document.createElement('a');
    zipLink.href   = URL.createObjectURL(content);
    zipLink.download = `BaZi_Wallpaper_${element}.zip`;
    zipLink.click();
    URL.revokeObjectURL(zipLink.href);

  } catch(e) {
    // JSZip 失败：直接单张下载
    console.warn('JSZip failed, falling back to single download:', e);
    downloadWallpaper(canvas, element, lang);
  }
}

/* ── 渲染壁纸选择 UI ─────────────────────────────────────── */
function renderWallpaperSection(pillars, dayMasterEl, missing, globalUnlocked, lang) {
  const isZh      = lang === 'zh';
  const container = document.getElementById('wallpaper-section');
  if (!container) return;

  // 推荐优先展示：日主元素 + 缺失元素
  const recommended = [dayMasterEl, ...missing.filter(e => e !== dayMasterEl)];
  const others      = Object.keys(WALLPAPER_THEMES).filter(e => !recommended.includes(e));
  const orderedEls  = [...recommended, ...others];

  let html = `
    <div class="wallpaper-header">
      <span class="free-badge" style="background:rgba(201,168,76,.15);color:var(--gold)">✦ NEW</span>
      <h3>${isZh ? '专属八字手机壁纸' : 'Personalised BaZi Wallpapers'}</h3>
      <p>${isZh
        ? '根据你的五行命盘生成的专属壁纸，每天开机让元素能量陪伴你。'
        : 'Wallpapers crafted from your elemental chart. Let your element\'s energy greet you every time you unlock your phone.'}</p>
    </div>
    <div class="wallpaper-grid">`;

  orderedEls.forEach(el => {
    const theme = WALLPAPER_THEMES[el];
    const isRec = recommended.includes(el);
    const isDM  = el === dayMasterEl;
    const isMis = missing.includes(el);

    html += `
      <div class="wallpaper-card${isDM ? ' wallpaper-recommended' : ''}">
        <div class="wallpaper-preview-wrap">
          <canvas id="wp-preview-${el}" class="wallpaper-preview" data-element="${el}"></canvas>
          ${isDM ? `<div class="wp-badge wp-badge-dm">${isZh?'你的日主':'Your Element'}</div>` : ''}
          ${isMis && !isDM ? `<div class="wp-badge wp-badge-missing">${isZh?'缺失':'Missing'}</div>` : ''}
        </div>
        <div class="wallpaper-info">
          <div class="wp-el-name">${EL_EMOJI[el]} ${isZh ? EL_ZH[el] : el}</div>
          <div class="wp-theme-name">${isZh ? theme.name.zh : theme.name.en}</div>
          <div class="wp-price">$1.99</div>
          ${(globalUnlocked || (typeof isWpElementUnlocked === 'function' && isWpElementUnlocked(el)))
            ? `<button class="btn-wp-download btn-gold btn btn-sm" onclick="handleWpDownload('${el}')">
                ${isZh ? '⬇ 下载壁纸' : '⬇ Download'}
               </button>`
            : `<button class="btn-wp-unlock btn-outline btn btn-sm" id="btn-wp-${el}" onclick="handleWpUnlock('${el}')">
                ${isZh ? '解锁 $1.99' : 'Unlock $1.99'}
               </button>`
          }
        </div>
      </div>`;
  });

  html += `</div>
    <p class="wp-note">${isZh
      ? '🖼 壁纸尺寸：1080×1920 像素，适合所有主流手机。购买后立即下载，无需注册账号。'
      : '🖼 Size: 1080×1920px, fits all major phones. Download immediately after purchase — no account needed.'}</p>`;

  container.innerHTML  = html;
  container.style.display = 'block';

  // 渲染所有预览缩略图
  orderedEls.forEach(el => {
    const previewCanvas = generatePreviewCanvas(el, 250);
    const target        = document.getElementById(`wp-preview-${el}`);
    if (target) {
      target.width  = previewCanvas.width;
      target.height = previewCanvas.height;
      target.getContext('2d').drawImage(previewCanvas, 0, 0);
    }
  });
}

/* ── 事件：下载按钮 ─────────────────────────────────────── */
function handleWpDownload(element) {
  if (!window._currentChart) return;
  const lang   = getLang();
  const canvas = generateWallpaper(window._currentChart.pillars, element, lang);
  downloadWallpaper(canvas, element, lang);
}

/* ── 事件：解锁按钮（跳转支付）──────────────────────────── */
function handleWpUnlock(element) {
  if (!window._currentChart) return;
  const lang  = getLang();
  const hash  = window._currentChart.chartHash + '_wp_' + element;
  startPayment(hash, lang, 'wallpaper', element);
}

// EL_ZH 兼容（从 bazi.js 引用，此处备份）
const EL_ZH_WP = { Wood:'木', Fire:'火', Earth:'土', Metal:'金', Water:'水' };
const EL_EMOJI_WP = { Wood:'🌿', Fire:'🔥', Earth:'⛰️', Metal:'⚔️', Water:'🌊' };
