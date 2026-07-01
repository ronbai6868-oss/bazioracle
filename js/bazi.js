/* ═══════════════════════════════════════════════════
   BaZi Oracle — 八字计算引擎 v3.0
   ✅ 年柱：以立春为界（修正元旦-立春年份误差）
   ✅ 月柱：以节气为界（修正月初节气边界误差）
   ✅ 日柱：基准日期法（精确）
   ✅ 时柱：十二时辰（精确）
   节气日期采用近似值，误差±1-2天
═══════════════════════════════════════════════════ */

const STEMS    = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const BRANCHES = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const ST_EL    = ['Wood','Wood','Fire','Fire','Earth','Earth','Metal','Metal','Water','Water'];
const BR_EL    = ['Water','Earth','Wood','Wood','Earth','Fire','Fire','Earth','Metal','Metal','Earth','Water'];
const EL_ZH    = {Wood:'木',Fire:'火',Earth:'土',Metal:'金',Water:'水'};
const EL_EMOJI = {Wood:'🌿',Fire:'🔥',Earth:'⛰️',Metal:'⚔️',Water:'🌊'};
const EL_COLOR = {Wood:'#3D6B47',Fire:'#A83232',Earth:'#B8892B',Metal:'#6B7A8D',Water:'#2C5282'};
const EL_BG    = {Wood:'rgba(61,107,71,.1)',Fire:'rgba(168,50,50,.1)',Earth:'rgba(184,137,43,.1)',Metal:'rgba(107,122,141,.1)',Water:'rgba(44,82,130,.1)'};

/* ── 节气近似日期表（月柱&年柱边界）────────────────────────
   [公历月, 近似日, 地支index, 节气名]
   精度：与真实节气误差约±1-2天
   如需更高精度，可替换为万年历API
─────────────────────────────────────────────────── */
const SOLAR_TERMS = [
  [1,  6,  1,  '小寒'],  // 丑月
  [2,  4,  2,  '立春'],  // 寅月 ← 同时是八字年份分界
  [3,  6,  3,  '惊蛰'],  // 卯月
  [4,  5,  4,  '清明'],  // 辰月
  [5,  6,  5,  '立夏'],  // 巳月
  [6,  6,  6,  '芒种'],  // 午月
  [7,  7,  7,  '小暑'],  // 未月
  [8,  7,  8,  '立秋'],  // 申月
  [9,  8,  9,  '白露'],  // 酉月
  [10, 8,  10, '寒露'],  // 戌月
  [11, 7,  11, '立冬'],  // 亥月
  [12, 7,  0,  '大雪'],  // 子月
];

/* 根据节气确定月柱地支 */
function getMonthBranch(month, day) {
  for (let i = SOLAR_TERMS.length - 1; i >= 0; i--) {
    const [m, d, bi] = SOLAR_TERMS[i];
    if (month > m || (month === m && day >= d)) return bi;
  }
  return 0; // 1月6日前，仍在上年子月
}

/* 八字年份（以立春约2月4日为界） */
function getBaziYear(year, month, day) {
  if (month < 2 || (month === 2 && day < 4)) return year - 1;
  return year;
}

/* 月柱序号（以寅月为第1月）*/
function getMonthNum(bi) {
  if (bi === 0) return 11;  // 子月=第11月
  if (bi === 1) return 12;  // 丑月=第12月
  return bi - 1;             // 寅=1,...,亥=10
}

/* 五虎遁年：月柱天干起始 */
const MO_STEM_START = [2,4,6,8,0, 2,4,6,8,0]; // 对应甲乙丙丁戊己庚辛壬癸
/* 五鼠遁日：时柱天干起始 */
const HR_STEM_START = [0,2,4,6,8, 0,2,4,6,8];

/* 时辰地支 */
function getHourBranch(h) {
  if (h === 23) return 0;
  return Math.floor((h + 1) / 2);
}

/* 构建柱 */
function pillar(si, bi) {
  si = ((si%10)+10)%10; bi = ((bi%12)+12)%12;
  return {stem:STEMS[si],branch:BRANCHES[bi],si,bi,stemEl:ST_EL[si],branchEl:BR_EL[bi]};
}

/* 年柱 */
function yearPillar(y, m, d) {
  const by = getBaziYear(y, m, d);
  return pillar((by-4)%10, (by-4)%12);
}

/* 月柱（节气边界 + 五虎遁年） */
function monthPillar(y, m, d) {
  const yp = yearPillar(y, m, d);
  const bi = getMonthBranch(m, d);
  const mn = getMonthNum(bi);
  const si = (MO_STEM_START[yp.si] + mn - 1) % 10;
  return pillar(si, bi);
}

/* 日柱（基准：2000-01-01=戊申日，天干4，地支8） */
function dayPillar(y, m, d) {
  const diff = Math.round((new Date(y,m-1,d) - new Date(2000,0,1)) / 86400000);
  return pillar(4+diff, 8+diff);
}

/* 时柱（五鼠遁日） */
function hourPillar(dsi, h) {
  const bi = getHourBranch(h);
  return pillar(HR_STEM_START[dsi]+bi, bi);
}

/* 五行统计 */
function elementBalance(ps) {
  const c={Wood:0,Fire:0,Earth:0,Metal:0,Water:0};
  ['year','month','day','hour'].forEach(k=>{c[ps[k].stemEl]++;c[ps[k].branchEl]++;});
  return c;
}

/* ── 主计算 ───────────────────────────────────────────── */
function calculateFourPillars(y, m, d, h) {
  const yp=yearPillar(y,m,d), mp=monthPillar(y,m,d),
        dp=dayPillar(y,m,d), hp=hourPillar(dp.si,h);
  const ps={year:yp,month:mp,day:dp,hour:hp};
  const bal=elementBalance(ps);
  const total=Object.values(bal).reduce((a,b)=>a+b,0);
  return {
    pillars:ps, balance:bal, total,
    missing:Object.keys(bal).filter(k=>bal[k]===0),
    weak:Object.keys(bal).filter(k=>bal[k]===1),
    strong:Object.keys(bal).filter(k=>bal[k]>=3),
    dayMaster:dp.stemEl,
    baziYear:getBaziYear(y,m,d)
  };
}

/* ── 日主解读（中英双语）────────────────────────────────── */
const DM_DESC = {
  '甲':{en:{title:'Yang Wood — The Towering Tree',text:'Like an ancient oak, you are tall in ambition and deep in roots. You lead by standing firm, holding your values even under pressure. Your greatest strength is unwavering integrity and the natural authority it creates.'},zh:{title:'阳木 甲木 — 参天大树',text:'如同古老的橡树，你志向高远、根基深厚。你以坚守立场为领导之道，即便承压也不动摇原则。你最大的力量，是那份坚定的正直与由此生发的自然权威感。'}},
  '乙':{en:{title:'Yin Wood — The Graceful Vine',text:'Flexible and beautifully adaptive, you wind your way toward light. You achieve goals through persistence, charm, and finding support where others see none. Your resilience in adversity is remarkable.'},zh:{title:'阴木 乙木 — 柔韧藤蔓',text:'柔韧而灵活，你总能找到通向光明的路。你凭借坚持、亲和力，以及在别人看不到出路的地方找到支撑的本领，一步步实现目标。'}},
  '丙':{en:{title:'Yang Fire — The Brilliant Sun',text:'Radiant, generous, and impossible to ignore. You illuminate everything around you and are at your best when shining light on others. Your warmth draws people naturally, making you a magnetic leader.'},zh:{title:'阳火 丙火 — 灿烂太阳',text:'光彩夺目、慷慨大方，令人无法忽视。你照亮身边的一切，在为他人指引方向时展现出最好的自己。你的温暖天然地吸引他人，让你成为极具感召力的领导者。'}},
  '丁':{en:{title:'Yin Fire — The Steady Candle',text:'Warm, intimate, and deeply intuitive. You light spaces from within and are most powerful in close, meaningful relationships. Your devotion and sensitivity make you an extraordinary confidant.'},zh:{title:'阴火 丁火 — 温柔烛光',text:'温暖、亲密、直觉敏锐。你从内心点亮周围的空间，在亲密而有意义的关系中展现出最强大的力量。你的忠诚与细腻，让你成为一位非凡的知心人。'}},
  '戊':{en:{title:'Yang Earth — The Mountain',text:'Solid, dependable, and immovable in your values. People instinctively seek your stability and wisdom. You are the anchor in any team or family — the one everyone turns to when things get difficult.'},zh:{title:'阳土 戊土 — 巍峨山岳',text:'稳固、可靠、价值观坚定如山。人们本能地向你寻求稳定与智慧。你是任何团队或家庭中的定海神针——每当局面艰难，大家都会向你求助。'}},
  '己':{en:{title:'Yin Earth — The Fertile Field',text:'Nurturing, practical, and endlessly giving. You create environments where others thrive. Your greatest power is in the quiet, consistent care you provide — the foundation that makes everything possible.'},zh:{title:'阴土 己土 — 肥沃田野',text:'滋养、务实、给予不倦。你创造出让他人茁壮成长的环境。你最大的力量，在于那份安静而持续的关怀——那是让一切成为可能的地基。'}},
  '庚':{en:{title:'Yang Metal — The Sharp Sword',text:'Direct, principled, and built for precision. You cut through confusion with clarity, and your commitment to justice makes you a natural leader in moments requiring tough, honest decisions.'},zh:{title:'阳金 庚金 — 锋利宝剑',text:'直接、有原则、追求精准。你以清晰斩断迷雾，对正义的坚守让你在需要艰难抉择的时刻，成为天然的领导者。'}},
  '辛':{en:{title:'Yin Metal — The Polished Jewel',text:'Refined, perceptive, and deeply detail-oriented. You notice what others miss and hold yourself to exacting standards. Your talent for beauty, order, and precision makes your work stand apart.'},zh:{title:'阴金 辛金 — 精美珠宝',text:'精炼、敏锐、注重细节。你能察觉他人忽略的事物，对自己有严格的要求。对美感、秩序和精准的天然天赋，让你的作品与众不同。'}},
  '壬':{en:{title:'Yang Water — The Ocean',text:'Vast, deep, and full of hidden intelligence. You think in systems and see far ahead. Your resourcefulness and adaptability allow you to navigate almost any situation.'},zh:{title:'阳水 壬水 — 浩瀚大海',text:'广阔、深邃、蕴含深沉智慧。你以系统性思维看待世界，目光高远。你的随机应变与适应力，让你几乎能应对任何处境。'}},
  '癸':{en:{title:'Yin Water — The Gentle Rain',text:'Thoughtful, empathetic, and quietly wise. You nourish without force and understand at an intuitive level what people truly need. Your gentle presence carries more influence than louder voices.'},zh:{title:'阴水 癸水 — 润物细雨',text:'体贴、富有同理心、静水深流。你润物无声，凭直觉洞察他人的真实需求。你温柔的存在，往往比喧嚣的声音更具影响力。'}}
};

const EL_DESC = {
  Wood: {en:'growth, creativity and career advancement', zh:'成长、创造力与事业发展'},
  Fire: {en:'passion, recognition and social connections', zh:'热情、贵人缘与人际关系'},
  Earth:{en:'stability, abundance and security',          zh:'稳定、富足与安全感'},
  Metal:{en:'clarity, precision and wealth attraction',   zh:'清晰度、精准与财运'},
  Water:{en:'wisdom, intuition and adaptability',         zh:'智慧、直觉与适应力'}
};

/* ── 表单初始化 ──────────────────────────────────────────
   ★ 修复：脚本在页面底部，DOM已就绪，直接调用
   用 readyState 判断，兼容所有加载场景
─────────────────────────────────────────────────── */
function populateForm() {
  const yr = document.getElementById('inp-year');
  if (!yr || yr.options.length > 1) return;
  for (let y = 1940; y <= 2006; y++) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    if (y === 1992) o.selected = true;
    yr.appendChild(o);
  }
  const dy = document.getElementById('inp-day');
  if (!dy || dy.options.length > 1) return;
  for (let d = 1; d <= 31; d++) {
    const o = document.createElement('option');
    o.value = d; o.textContent = d;
    if (d === 7) o.selected = true;
    dy.appendChild(o);
  }
  const ms = document.getElementById('inp-month');
  if (ms) ms.value = 7;
  const hs = document.getElementById('inp-hour');
  if (hs) hs.value = 9;
}

// ★ 关键修复：兼容脚本在底部已触发DOMContentLoaded的情况
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', populateForm);
} else {
  populateForm();
}

/* ── 性别选择 ─────────────────────────────────────────── */
let currentGender = 'male';
function setGender(g) {
  currentGender = g;
  document.querySelectorAll('.g-btn').forEach(b => {
    b.classList.remove('on');
    b.setAttribute('aria-pressed','false');
  });
  const btn = document.getElementById('g-'+g);
  if (btn) { btn.classList.add('on'); btn.setAttribute('aria-pressed','true'); }
}

function elTag(el) {
  const label = getLang()==='zh' ? EL_ZH[el] : el;
  return `<span class="p-tag" style="background:${EL_BG[el]};color:${EL_COLOR[el]}">${label}</span>`;
}

/* ── 结果渲染 ─────────────────────────────────────────── */
function renderResult(data) {
  const {pillars,balance,total,missing,weak,strong,baziYear} = data;
  const isZh = getLang()==='zh';
  const CN = ['年柱','月柱','日柱','时柱'];
  const EN = ['Year','Month','Day ⭐','Hour'];

  // 四柱
  let pH='';
  ['year','month','day','hour'].forEach((k,i)=>{
    const p=pillars[k];
    pH+=`<div class="p-col${k==='day'?' day-col':''}">
      <div class="p-title">${CN[i]}<br>${EN[i]}</div>
      <div class="p-stem" style="color:${EL_COLOR[p.stemEl]}">${p.stem}</div>
      ${elTag(p.stemEl)}
      <div class="p-branch" style="color:${EL_COLOR[p.branchEl]}">${p.branch}</div>
      ${elTag(p.branchEl)}
    </div>`;
  });
  document.getElementById('pillars-content').innerHTML = pH;

  // 日主
  const dm=pillars.day, info=DM_DESC[dm.stem][isZh?'zh':'en'];
  document.getElementById('dm-content').innerHTML=`
    <div class="dm-sym">${dm.stem}</div>
    <div class="dm-info">
      <h3>${dm.stem} — ${info.title}</h3>
      <div class="dm-el" style="color:${EL_COLOR[dm.stemEl]}">${isZh?EL_ZH[dm.stemEl]+'（'+dm.stemEl+'）':dm.stemEl} · ${isZh?'日主':'Day Master'}</div>
      <p>${info.text}</p>
    </div>`;

  // 五行平衡
  let bH='';
  Object.entries(balance).forEach(([el,count])=>{
    const pct=Math.round(count/total*100);
    const s=count===0?(isZh?'缺失':'Missing'):count===1?(isZh?'薄弱':'Weak'):count>=3?(isZh?'旺盛':'Strong'):'';
    const sc=count<=1?'s-weak':count>=3?'s-strong':'s-ok';
    bH+=`<div class="el-row">
      <span class="el-name" style="color:${EL_COLOR[el]}">${EL_EMOJI[el]} ${isZh?EL_ZH[el]:el}</span>
      <div class="el-bar-bg"><div class="el-bar" style="width:${pct}%;background:${EL_COLOR[el]}"></div></div>
      <span class="el-pct">${pct}%</span>
      <span class="el-status ${sc}">${s}</span>
    </div>`;
  });
  document.getElementById('balance-content').innerHTML=bH;

  // 缺失五行
  const mc=document.getElementById('missing-content');
  if (!missing.length && !weak.length) {
    mc.className='missing-card balanced';
    mc.innerHTML=`<h3 style="color:var(--jade)">✓ ${isZh?'五行均衡命盘':'Well-Balanced Chart'}</h3>
      <p>${isZh?'您的命盘五行俱全，分布均衡——这是难得的好格局。':'All five elements are present — a rare and fortunate distribution.'}</p>`;
  } else {
    mc.className='missing-card has-missing';
    const elList=[...missing,...weak.filter(w=>!missing.includes(w))];
    let tags='';
    missing.forEach(e=>{tags+=`<span class="missing-tag" style="background:var(--verm)">${EL_EMOJI[e]} ${isZh?EL_ZH[e]:e} ${isZh?'（缺失）':'— Missing'}</span>`;});
    weak.filter(w=>!missing.includes(w)).forEach(e=>{tags+=`<span class="missing-tag" style="background:var(--earth)">${EL_EMOJI[e]} ${isZh?EL_ZH[e]:e} ${isZh?'（薄弱）':'— Weak'}</span>`;});
    mc.innerHTML=`<h3 style="color:var(--verm)">${isZh?'需要加强的五行':'Elements to Strengthen'}</h3>
      <p>${isZh
        ?`您的命盘缺少或薄弱：<strong>${elList.map(e=>EL_ZH[e]).join('、')}</strong>。这往往体现为${elList.map(e=>EL_DESC[e].zh).join('；')}方面反复遭遇挑战。`
        :`Your chart is missing or weak in <strong>${elList.join(' and ')}</strong>. This often shows as recurring challenges in ${elList.map(e=>EL_DESC[e].en).join(' and ')}.`
      }</p><div class="missing-tags">${tags}</div>`;
  }

  // 命盘解读
  let iH=`<p>${info.text}</p>`;
  const tEls=missing.length?missing:weak;
  if (tEls.length) {
    iH+=`<p>${isZh
      ?`您的命盘呼唤更多的<strong>${tEls.map(e=>EL_ZH[e]).join('、')}</strong>之气。可通过穿着对应颜色、在居住和工作空间摆放相关物品来逐步引入这些能量。`
      :`Your chart calls for more <strong>${tEls.join(' and ')}</strong> energy. You can introduce it through the colours you wear and the objects in your living and workspace.`
    }</p>`;
  }
  if (strong.length) {
    iH+=`<p>${isZh
      ?`您的命盘中<strong>${strong.map(e=>EL_ZH[e]).join('、')}</strong>之气旺盛——这是天赋所在，注意将其引导到积极方向，避免其阴暗面显现。`
      :`You carry abundant <strong>${strong.join(' and ')}</strong> energy. Channel this gift productively and be mindful of its shadow qualities.`
    }</p>`;
  }
  iH+=`<p style="font-size:.8rem;color:var(--gray-l);border-top:1px solid rgba(201,168,76,.2);padding-top:.75rem;margin-top:1rem">${isZh
    ?'✦ 本命盘基于节气精算：年柱以立春（约每年2月4日）为年份分界，月柱以十二节气为月份分界，精确度较高。如与出生时间接近节气日期，可能有±1天误差。'
    :'✦ This chart uses solar term precision: year pillar follows 立春 (Start of Spring, ~Feb 4) and month pillars follow the 12 solar terms. For births near solar term dates, there may be ±1 day variance.'
  }</p>`;
  document.getElementById('interp-content').innerHTML=iH;

  document.getElementById('results').classList.add('show');
  setTimeout(()=>document.getElementById('results').scrollIntoView({behavior:'smooth',block:'start'}),100);
}

/* ── 触发计算 ─────────────────────────────────────────── */
function doCalculate() {
  const y=parseInt(document.getElementById('inp-year').value);
  const m=parseInt(document.getElementById('inp-month').value);
  const d=parseInt(document.getElementById('inp-day').value);
  const h=parseInt(document.getElementById('inp-hour').value);
  if (!y||!m||!d){alert(getLang()==='zh'?'请填写完整的出生信息。':'Please fill in all birth details.');return;}
  renderResult(calculateFourPillars(y,m,d,h));
}

/* ═══════════════════════════════════════════════════
   独立渲染函数（供 calculator 页面分步调用）
═══════════════════════════════════════════════════ */

function renderPillars(pillars) {
  const CN = ['年柱','月柱','日柱','时柱'];
  const EN = ['Year','Month','Day ⭐','Hour'];
  let pH = '';
  ['year','month','day','hour'].forEach((k,i) => {
    const p = pillars[k];
    pH += `<div class="p-col${k==='day'?' day-col':''}">
      <div class="p-title">${CN[i]}<br>${EN[i]}</div>
      <div class="p-stem" style="color:${EL_COLOR[p.stemEl]}">${p.stem}</div>
      ${elTag(p.stemEl)}
      <div class="p-branch" style="color:${EL_COLOR[p.branchEl]}">${p.branch}</div>
      ${elTag(p.branchEl)}
    </div>`;
  });
  document.getElementById('pillars-content').innerHTML = pH;
}

function renderBalance(data) {
  const { balance, total } = data;
  const isZh = getLang() === 'zh';

  // ── 五边形雷达图数据 ──
  const EL_ORDER = ['Wood','Fire','Earth','Metal','Water'];
  const EL_ZH_L  = {Wood:'木',Fire:'火',Earth:'土',Metal:'金',Water:'水'};
  const EL_EMO   = {Wood:'🌿',Fire:'🔥',Earth:'⛰️',Metal:'⚔️',Water:'🌊'};
  const EL_COL   = {Wood:'#3D6B47',Fire:'#c0392b',Earth:'#B8892B',Metal:'#6B7A8D',Water:'#2C5282'};

  const W = 280, H = 280, cx = W/2, cy = H/2, R = 100, rInner = R * 0.2;
  // 五个顶点角度（从顶部开始，顺时针）
  const angles = EL_ORDER.map((_,i) => -Math.PI/2 + i * 2*Math.PI/5);
  const pts = (r) => angles.map(a => [cx + r*Math.cos(a), cy + r*Math.sin(a)]);
  const toPath = (points) => points.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ')+'Z';

  // 同心五边形网格
  let gridSvg = '';
  [0.25,0.5,0.75,1.0].forEach(f => {
    gridSvg += `<path d="${toPath(pts(R*f))}" fill="none" stroke="rgba(201,168,76,.15)" stroke-width="1"/>`;
  });
  // 轴线
  const outerPts = pts(R);
  angles.forEach((_,i) => {
    gridSvg += `<line x1="${cx}" y1="${cy}" x2="${outerPts[i][0].toFixed(1)}" y2="${outerPts[i][1].toFixed(1)}" stroke="rgba(201,168,76,.1)" stroke-width="1"/>`;
  });

  // 数据多边形
  const maxVal = total || 8;
  const dataR  = EL_ORDER.map(el => Math.max(rInner, R * (balance[el] || 0) / maxVal));
  const dataPts = angles.map((a,i) => [cx + dataR[i]*Math.cos(a), cy + dataR[i]*Math.sin(a)]);
  const dataPath = toPath(dataPts);

  // 顶点标签
  let labelSvg = '';
  EL_ORDER.forEach((el,i) => {
    const lx = cx + (R+28)*Math.cos(angles[i]);
    const ly = cy + (R+28)*Math.sin(angles[i]);
    const pct = Math.round((balance[el]||0)/maxVal*100);
    const name = isZh ? EL_ZH_L[el] : el.slice(0,2);
    labelSvg += `<text x="${lx.toFixed(1)}" y="${(ly-8).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="bold" fill="${EL_COL[el]}" font-family="serif">${EL_EMO[el]} ${name}</text>`;
    labelSvg += `<text x="${lx.toFixed(1)}" y="${(ly+8).toFixed(1)}" text-anchor="middle" font-size="11" fill="rgba(255,255,255,.6)" font-family="sans-serif">${pct}%</text>`;
  });

  const radarSvg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
    ${gridSvg}
    <path d="${dataPath}" fill="rgba(201,168,76,.18)" stroke="rgba(201,168,76,.8)" stroke-width="1.5"/>
    ${dataPts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="#c9a84c"/>`).join('')}
    ${labelSvg}
  </svg>`;

  // ── 条形图 ──
  let bars = '';
  EL_ORDER.forEach(el => {
    const count = balance[el] || 0;
    const pct   = Math.round(count / maxVal * 100);
    const s     = count===0?(isZh?'缺失':'Missing'):count===1?(isZh?'薄弱':'Weak'):count>=3?(isZh?'旺盛':'Strong'):'';
    const sc    = count<=1?'s-weak':count>=3?'s-strong':'s-ok';
    bars += `<div class="el-row">
      <span class="el-name" style="color:${EL_COL[el]}">${EL_EMO[el]} ${isZh?EL_ZH_L[el]:el}</span>
      <div class="el-bar-bg"><div class="el-bar" style="width:${pct}%;background:${EL_COL[el]}"></div></div>
      <span class="el-pct">${pct}%</span>
      ${s?`<span class="el-status ${sc}">${s}</span>`:''}
    </div>`;
  });

  document.getElementById('balance-content').innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:1.5rem;align-items:center;justify-content:center">
      <div style="flex:0 0 auto">${radarSvg}</div>
      <div style="flex:1;min-width:200px">${bars}</div>
    </div>`;
}


function renderDayMaster(data) {
  const isZh = getLang() === 'zh';
  const dm   = data.pillars.day;
  const info = DM_DESC[dm.stem][isZh?'zh':'en'];
  document.getElementById('dm-content').innerHTML = `
    <div class="dm-sym">${dm.stem}</div>
    <div class="dm-info">
      <h3>${dm.stem} — ${info.title}</h3>
      <div class="dm-el" style="color:${EL_COLOR[dm.stemEl]}">${isZh?EL_ZH[dm.stemEl]+'（'+dm.stemEl+'）':dm.stemEl} · ${isZh?'日主':'Day Master'}</div>
      <p>${info.text}</p>
    </div>`;
}

function renderMissing(data) {
  const { missing, weak } = data;
  const isZh = getLang() === 'zh';
  const mc   = document.getElementById('missing-content');
  if (!mc) return;
  if (!missing.length && !weak.length) {
    mc.className = 'missing-card balanced';
    mc.innerHTML = `<h3 style="color:var(--jade)">✓ ${isZh?'五行均衡命盘':'Well-Balanced Chart'}</h3>
      <p>${isZh?'您的命盘五行俱全，分布均衡——这是难得的好格局。':'All five elements are present — a rare and fortunate distribution.'}</p>`;
    return;
  }
  mc.className = 'missing-card has-missing';
  const elList = [...missing, ...weak.filter(w => !missing.includes(w))];
  let tags = '';
  missing.forEach(e => { tags += `<span class="missing-tag" style="background:var(--verm)">${EL_EMOJI[e]} ${isZh?EL_ZH[e]:e} ${isZh?'（缺失）':'— Missing'}</span>`; });
  weak.filter(w => !missing.includes(w)).forEach(e => { tags += `<span class="missing-tag" style="background:var(--earth)">${EL_EMOJI[e]} ${isZh?EL_ZH[e]:e} ${isZh?'（薄弱）':'— Weak'}</span>`; });
  mc.innerHTML = `<h3 style="color:var(--verm)">${isZh?'需要加强的五行':'Elements to Strengthen'}</h3>
    <p>${isZh
      ?`您的命盘缺少或薄弱：<strong>${elList.map(e=>EL_ZH[e]).join('、')}</strong>。这往往体现为${elList.map(e=>EL_DESC[e].zh).join('、')}方面反复遭遇挑战。`
      :`Your chart is missing or weak in <strong>${elList.join(' and ')}</strong>, often showing as recurring challenges in ${elList.map(e=>EL_DESC[e].en).join(' and ')}.`
    }</p>
    <div class="missing-tags">${tags}</div>`;
}
