/* ═══════════════════════════════════════════════
   BaZi Oracle — Shared Components v2.0
   支持中英双语切换 / EN-ZH Bilingual Support
   使用说明：每个HTML页面底部调用 initComponents('page-id')
═══════════════════════════════════════════════ */

// ── 修改这里来配置你的网站 ──────────────────────────
const STORE_URL  = "https://your-store-link.com"; // ← 替换成你的跨境电商店铺链接
const STORE_NAME = "BaZi Oracle";
const SITE_URL   = "https://getbazioracle.com";   // ← 你购买的域名
const GA_ID      = "G-N01MENQCSC";               // ← Google Analytics ID（注册后填写）
// ────────────────────────────────────────────────────

// ── 语言检测（从URL参数读取，无需存储）─────────────────
function getLang() {
  return new URLSearchParams(window.location.search).get('lang') === 'zh' ? 'zh' : 'en';
}

function switchLang(lang) {
  const url = new URL(window.location.href);
  if (lang === 'zh') { url.searchParams.set('lang', 'zh'); }
  else { url.searchParams.delete('lang'); }
  window.location.href = url.toString();
}

function applyLang() {
  const lang = getLang();
  const isZh = lang === 'zh';
  // 设置 html lang 属性（CSS 选择器依赖此属性）
  document.documentElement.lang = isZh ? 'zh-CN' : 'en';
  // 更新内联样式（双重保障，防止 CSS 未加载时失效）
  const ls = document.getElementById('ls');
  if (ls) ls.textContent = isZh ? '.en{display:none!important}' : '.zh{display:none!important}';
  // 高亮当前语言按钮
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === lang);
  });
}

// ── 生成带语言参数的链接 ────────────────────────────────
function langHref(path) {
  const lang = getLang();
  return lang === 'zh' ? path + '?lang=zh' : path;
}

// ── 导航HTML（中英双语）─────────────────────────────────
function getNavHTML(activePage) {
  const pages = [
    { id:'home',       en:'Home',         zh:'首页',     href:'/' },
    { id:'calculator', en:'Free Reading', zh:'免费测算', href:'/calculator/' },
    { id:'learn',      en:'Learn',        zh:'学习文章', href:'/learn/' },
    // { id:'shop', en:'Element Shop', zh:'五行商品', href:'/shop/' }, // 开通店铺后取消注释
  ];
  const linksHTML = pages.map(p => `
    <button class="nav-link${activePage===p.id?' active':''}"
      onclick="window.location='${langHref(p.href)}'">
      <span class="en">${p.en}</span>
      <span class="zh">${p.zh}</span>
    </button>`).join('');

  const mobileLinks = pages.map(p => `
    <a href="${langHref(p.href)}" class="${activePage===p.id?'active':''}">
      <span class="en">${p.en}</span>
      <span class="zh">${p.zh}</span>
    </a>`).join('');

  return `
<nav class="site-nav" role="navigation">
  <div class="nav-inner">
    <a href="${langHref('/')}" class="nav-logo">
      <span>☯</span> BaZi Oracle
    </a>
    <div class="nav-links" id="navLinks">
      ${linksHTML}
      <button class="nav-cta" onclick="window.location='${langHref('/calculator/')}'">
        <span class="en">✦ Get Free Reading</span>
        <span class="zh">✦ 获取免费测算</span>
      </button>
      <div class="lang-switcher" role="group" aria-label="Language switcher">
        <button class="lang-btn" data-lang="en" onclick="switchLang('en')" title="Switch to English" aria-label="English">EN</button>
        <button class="lang-btn" data-lang="zh" onclick="switchLang('zh')" title="切换为中文" aria-label="中文">中</button>
      </div>
    </div>
    <button class="nav-toggle" id="navToggle">☰</button>
  </div>
  <div class="nav-mobile" id="navMobile">
    ${mobileLinks}
    <a href="${langHref('/calculator/')}" style="color:var(--gold);font-weight:500">
      <span class="en">✦ Get Free Reading</span>
      <span class="zh">✦ 获取免费测算</span>
    </a>
    <div style="display:flex;gap:.5rem;padding:.5rem .75rem">
      <button class="lang-btn" data-lang="en" onclick="switchLang('en')" style="color:rgba(255,255,255,.6);font-size:.85rem">🌐 English</button>
      <button class="lang-btn" data-lang="zh" onclick="switchLang('zh')" style="color:rgba(255,255,255,.6);font-size:.85rem">🌐 中文</button>
    </div>
  </div>
</nav>`;
}

// ── 页脚HTML（中英双语）────────────────────────────────
function getFooterHTML() {
  const yr = new Date().getFullYear();
  return `
<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="fl">☯ BaZi Oracle</div>
        <p class="en">Ancient Chinese wisdom made accessible. Discover your elemental blueprint and create harmony in every area of your life.</p>
        <p class="zh">让古老的中国命理智慧触手可及。探索你的五行命盘，在生活的每个领域创造和谐。</p>
      </div>
      <div class="footer-col">
        <h5><span class="en">Learn</span><span class="zh">学习文章</span></h5>
        <a href="${langHref('/learn/')}"><span class="en">BaZi Basics</span><span class="zh">八字基础</span></a>
        <a href="${langHref('/learn/what-is-bazi-four-pillars/')}"><span class="en">What Is BaZi?</span><span class="zh">什么是八字？</span></a>
        <a href="${langHref('/learn/five-elements-complete-guide/')}"><span class="en">Five Elements</span><span class="zh">五行详解</span></a>
        <a href="${langHref('/learn/missing-elements-how-to-remedy/')}"><span class="en">Missing Elements</span><span class="zh">缺失五行补救</span></a>
      </div>
      <div class="footer-col">
        <h5><span class="en">Tools</span><span class="zh">工具</span></h5>
        <a href="${langHref('/calculator/')}"><span class="en">Free BaZi Reading</span><span class="zh">免费八字测算</span></a>
        <a href="${langHref('/calculator/')}"><span class="en">Element Calculator</span><span class="zh">五行计算器</span></a>
        <!-- <a href="${langHref('/shop/')}"><span class="en">Element Shop</span><span class="zh">五行商品</span></a> 开通店铺后取消注释 -->
      </div>
      <div class="footer-col">

        <h5><span class="en">Legal</span><span class="zh">法律</span></h5>
        <a href="/terms/"><span class="en">Terms of Service</span><span class="zh">服务条款</span></a>
        <a href="/privacy/"><span class="en">Privacy Policy</span><span class="zh">隐私政策</span></a>
        <a href="/refunds/"><span class="en">Refund Policy</span><span class="zh">退款政策</span></a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© ${yr} BaZi Oracle. <span class="en">All rights reserved.</span><span class="zh">保留所有权利。</span></span>
      <span style="color:rgba(255,255,255,.3);font-size:.8rem">
        <span class="en">Powered by AI · For entertainment purposes</span>
        <span class="zh">AI 驱动 · 仅供参考娱乐</span>
      </span>
    </div>
  </div>
</footer>`;
}

// ── 初始化（每个页面底部调用）──────────────────────────
function initComponents(activePage) {
  // 注入导航
  const navEl = document.getElementById('nav-placeholder');
  if (navEl) navEl.outerHTML = getNavHTML(activePage);

  // 注入页脚
  const footEl = document.getElementById('footer-placeholder');
  if (footEl) footEl.outerHTML = getFooterHTML();

  // 应用语言
  applyLang();

  // 汉堡菜单
  const toggle = document.getElementById('navToggle');
  const mobile = document.getElementById('navMobile');
  if (toggle && mobile) {
    toggle.addEventListener('click', () => {
      mobile.classList.toggle('open');
      toggle.textContent = mobile.classList.contains('open') ? '✕' : '☰';
    });
  }

  // Google Analytics
  if (typeof GA_ID !== 'undefined' && GA_ID && GA_ID !== 'G-XXXXXXXXXX') {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', GA_ID);
  }
}
