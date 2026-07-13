/* ═══════════════════════════════════════════════════
   /api/articles.js
   
   自动扫描 learn/ 目录，读取每篇文章的元数据
   返回文章列表供 learn/index.html 动态渲染
   
   文章只需要在 HTML 的 <head> 里包含：
   - <title> 标签
   - <meta name="description">
   - <meta name="article:category"> （可选，用于分类）
   - <meta name="article:readtime"> （可选，阅读时长）
   - <meta name="article:level"> （可选，难度级别）
   - <meta name="article:emoji"> （可选，卡片图标）
   - <meta name="article:color"> （可选，卡片颜色主题）
═══════════════════════════════════════════════════ */
import fs   from 'fs';
import path from 'path';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  try {
    // learn 目录路径（Vercel 部署时的根目录）
    const learnDir = path.join(process.cwd(), 'learn');

    if (!fs.existsSync(learnDir)) {
      return res.status(200).json({ articles: [] });
    }

    const articles = [];

    // 扫描所有子目录
    const entries = fs.readdirSync(learnDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const articlePath = path.join(learnDir, entry.name, 'index.html');
      if (!fs.existsSync(articlePath)) continue;

      try {
        const html = fs.readFileSync(articlePath, 'utf8');

        // 提取元数据
        const title       = extractMeta(html, 'title');
        const description = extractMetaName(html, 'description');
        const category    = extractMetaName(html, 'article:category')  || 'intro';
        const readtime    = extractMetaName(html, 'article:readtime')   || '5 min';
        const level       = extractMetaName(html, 'article:level')      || 'Beginner';
        const emoji       = extractMetaName(html, 'article:emoji')      || '☯';
        const color       = extractMetaName(html, 'article:color')      || 'water';
        const order       = parseInt(extractMetaName(html, 'article:order') || '99', 10);
        const titleZh     = extractMetaName(html, 'article:title:zh')   || '';
        const descZh      = extractMetaName(html, 'article:desc:zh')    || '';
        const levelZh     = extractMetaName(html, 'article:level:zh')   || '入门级';

        // 从 <title> 里去掉 " | BaZi Oracle" 后缀
        const cleanTitle = title.replace(/\s*\|\s*BaZi Oracle.*$/, '').trim();

        articles.push({
          slug:        entry.name,
          href:        `/learn/${entry.name}/`,
          title:       cleanTitle,
          titleZh,
          description,
          descZh,
          category,    // intro | elements | practical
          readtime,
          level,
          levelZh,
          emoji,
          color,       // wood | fire | earth | metal | water
          order,
          available:   true
        });

      } catch(e) {
        console.warn(`Failed to parse ${entry.name}:`, e.message);
      }
    }

    // 按 order 排序
    articles.sort((a, b) => a.order - b.order);

    return res.status(200).json({ articles, total: articles.length });

  } catch (err) {
    console.error('articles API error:', err);
    return res.status(500).json({ error: 'Failed to load articles' });
  }
}

// 提取 <title>...</title>
function extractMeta(html, tag) {
  const m = html.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

// 提取 <meta name="xxx" content="...">
function extractMetaName(html, name) {
  const m = html.match(
    new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']+)["']`, 'i')
  ) || html.match(
    new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+name=["']${name}["']`, 'i')
  );
  return m ? m[1].trim() : '';
}
