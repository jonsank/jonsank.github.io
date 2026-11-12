import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { cover } from '../src/covers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const readContent = () => JSON.parse(readFileSync(path.join(root, 'content/site.json'), 'utf8'));
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const safeURL = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; } };
const pad = n => String(n).padStart(2, '0');

export function validateContent(data) {
  if (!data.profile?.brand || !Array.isArray(data.profile.about)) throw new Error('请填写个人资料');
  if (!Array.isArray(data.sections) || !data.sections.length || !Array.isArray(data.entries)) throw new Error('请配置栏目与内容');
  const ids = new Set(['library', 'about', 'contact', 'assets']);
  const types = new Set();
  for (const section of data.sections) {
    if (!/^[a-z][a-z0-9-]*$/.test(section.id) || ids.has(section.id)) throw new Error(`栏目路径无效或重复：${section.id}`);
    if (!section.type || types.has(section.type) || !section.label || !section.title) throw new Error(`栏目类型无效或重复：${section.id}`);
    ids.add(section.id); types.add(section.type);
  }
  const entryIds = new Set();
  for (const entry of data.entries) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.id) || entryIds.has(entry.id)) throw new Error(`内容 ID 无效或重复：${entry.id}`);
    if (!types.has(entry.type) || !entry.title || !entry.description || !Array.isArray(entry.tags)) throw new Error(`内容配置不完整：${entry.id}`);
    if (!Array.isArray(entry.sections) || !entry.sections.length || entry.sections.some(s => !s.heading || !Array.isArray(s.paragraphs) || s.paragraphs.some(p => typeof p !== 'string'))) throw new Error(`正文配置不完整：${entry.id}`);
    entryIds.add(entry.id);
  }
}

export function buildSite({ outputDirectory = path.join(root, 'dist'), data = readContent() } = {}) {
  validateContent(data);
  const out = path.resolve(outputDirectory);
  if (out === root || root.startsWith(out + path.sep)) throw new Error('输出目录不能覆盖源码');
  const { profile, entries, sections } = data;
  const h = escapeHTML;
  const sectionOf = entry => sections.find(s => s.type === entry.type);
  const routeOf = entry => `${sectionOf(entry).id}/${entry.id}/`;
  const css = readFileSync(path.join(root, 'src/styles.css'), 'utf8');
  const client = readFileSync(path.join(root, 'src/client.js'), 'utf8');
  const revision = createHash('sha256').update(css + client + JSON.stringify(data)).digest('hex').slice(0, 10);
  const art = readFileSync(path.join(root, 'src/hero-art.html'), 'utf8');
  const pages = new Map();
  const arrow = '<span aria-hidden="true">↗</span>';
  const moon = '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20.5 13.2A8.6 8.6 0 0 1 10.8 3.5 8.6 8.6 0 1 0 20.5 13.2Z"/></svg>';
  const sun = '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>';

  function context(route) {
    const depth = route.split('/').filter(Boolean).length;
    const prefix = depth ? '../'.repeat(depth) : './';
    return { prefix, u: target => prefix + target };
  }
  function navLink(url, label, current, childPaths = []) { return `<a href="${h(url)}"${childPaths.length ? ` data-nav-paths="${h(childPaths.join(' '))}"` : ''}${current ? ' class="current" aria-current="page"' : ''}>${h(label)}</a>`; }
  function frame(route, title, description, active, body, { article = false, legacy = false } = {}) {
    const { u } = context(route);
    const pageTitle = title ? `${title} · ${profile.brand}` : `${profile.brand} · 笔记与项目`;
    const contentActive = active === 'library' || sections.some(s => s.id === active);
    const nav = [navLink(u(''), '首页', active === 'home'), navLink(u('library/'), '笔记与项目', contentActive, [u('library/'), ...sections.map(s => u(s.id + '/'))]), navLink(u('about/'), '关于', active === 'about')].join('');
    const legacyData = legacy ? `<script type="application/json" id="legacy-routes">${JSON.stringify(Object.fromEntries(entries.map(e => [e.id, routeOf(e)]))).replace(/</g, '\\u003c')}</script>` : '';
    return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="theme-color" content="#f8f9fb"><meta name="site-revision" content="${revision}"><meta name="site-root" content="${u('')}"><meta name="description" content="${h(description)}"><meta property="og:type" content="${article ? 'article' : 'website'}"><meta property="og:title" content="${h(pageTitle)}"><meta property="og:description" content="${h(description)}"><title>${h(pageTitle)}</title><link rel="icon" href="${u('assets/avatar.jpg')}" type="image/jpeg"><script>try{if(localStorage.getItem('personal-site-theme')==='dark')document.documentElement.dataset.theme='dark'}catch{}</script><link rel="stylesheet" href="${u('styles.css')}?v=${revision}"><script src="${u('app.js')}?v=${revision}" defer></script></head><body${legacy ? ' data-page="home"' : ''}><a class="skip-link" href="#main">跳至正文</a><header class="site-header shell"><div class="header-inner glass"><a class="brand" href="${u('')}" aria-label="${h(profile.brand)} 首页">${h(profile.brand)}</a><nav class="main-nav" aria-label="主导航">${nav}</nav><div class="header-actions"><a class="header-contact" href="${u('contact/')}"${active === 'contact' ? ' aria-current="page"' : ''}>联系</a><button class="theme-toggle glass-control" type="button" aria-label="切换到深色模式" aria-pressed="false" title="切换外观">${moon}${sun}</button></div></div></header><main id="main">${body}</main><footer class="shell site-footer"><a href="${u('')}" class="footer-name">${h(profile.brand)}</a><span>© ${new Date().getUTCFullYear()}</span><nav aria-label="页脚导航"><a href="${u('library/')}">全部内容</a><a href="${u('about/')}">关于</a><a href="${u('contact/')}">联系</a></nav><a href="#main" class="back-top">回到顶部 ↑</a></footer><div id="toast" class="toast glass" role="status" aria-live="polite"></div>${legacyData}</body></html>`;
  }
  function card(entry, u) {
    const s = sectionOf(entry);
    return `<a class="content-card" href="${u(routeOf(entry))}" data-search="${h([entry.title, entry.description, s.title, ...entry.tags].join(' ').toLocaleLowerCase())}" aria-label="阅读${h(entry.title)}${entry.demo ? '（示例）' : ''}">${cover(entry, entries.indexOf(entry))}<div class="card-body"><div class="card-meta"><span>${h(s.label)}</span>${entry.demo ? '<span class="demo-label">示例</span>' : ''}</div><h3>${h(entry.title)}</h3><p class="card-description">${h(entry.description)}</p><div class="card-bottom"><div class="card-tags">${entry.tags.map(t => `<span>${h(t)}</span>`).join('')}</div>${arrow}</div></div></a>`;
  }
  function breadcrumbs(u, items) {
    return `<nav class="breadcrumbs" aria-label="面包屑"><a href="${u('')}">首页</a>${items.map(item => `<span aria-hidden="true">/</span>${item.href ? `<a href="${u(item.href)}">${h(item.label)}</a>` : `<span aria-current="page">${h(item.label)}</span>`}`).join('')}</nav>`;
  }
  function sectionTabs(u, current) {
    return `<nav class="collection-tabs glass" aria-label="内容分类">${navLink(u('library/'), '全部内容', current === 'library')}${sections.map(s => navLink(u(s.id + '/'), s.label, current === s.id)).join('')}</nav>`;
  }

  const home = context('');
  const homeBody = `<section class="hero shell"><div class="hero-copy"><p class="eyebrow">A PERSONAL COLLECTION</p><div class="identity-row"><img class="profile-avatar" src="${home.u('assets/avatar.jpg')}" width="42" height="42" alt="我的黑白线条头像"><p class="hello">${h(profile.greeting)}</p></div><h1>持续学习。<br><span>认真创造。</span></h1><p class="hero-description">${h(profile.description)}</p><div class="hero-actions"><a class="button glass-control" href="${home.u('library/')}">浏览笔记与项目 ${arrow}</a><a class="text-link" href="${home.u('about/')}">关于我 <span aria-hidden="true">→</span></a></div><p class="hero-footnote">一个持续更新的个人空间${profile.demo ? '<span class="demo-indicator">预览版 · 内容示例</span>' : ''}</p></div>${art.replaceAll('./assets/', home.u('assets/'))}</section><section class="shell category-section" aria-labelledby="explore-heading"><div class="section-heading compact"><div><p class="section-kicker">EXPLORE</p><h2 id="explore-heading">从这里开始</h2></div><span class="section-aside">学习与实践，各有归处。</span></div><div class="category-grid">${sections.map((s,i) => `<a class="category-card" href="${home.u(s.id+'/')}"><div class="category-top"><span>${pad(i+1)} / ${h(s.eyebrow || s.id.toUpperCase())}</span>${arrow}</div><h3>${h(s.label)}</h3><p>${h(s.description)}</p><span class="category-count">${pad(entries.filter(e=>e.type===s.type).length)} 篇内容</span></a>`).join('')}</div></section><section class="shell recent-section" aria-labelledby="recent-heading"><div class="section-heading"><div><p class="section-kicker">RECENT</p><h2 id="recent-heading">最近记录</h2></div><a class="text-link" href="${home.u('library/')}">查看全部 ${arrow}</a></div><div class="content-grid">${entries.slice(0,3).map(e=>card(e,home.u)).join('')}</div></section>`;
  pages.set('index.html', frame('', '', profile.description, 'home', homeBody, { legacy: true }));

  for (const section of [null, ...sections]) {
    const id = section?.id || 'library';
    const route = id + '/';
    const { u } = context(route);
    const title = section?.title || '笔记与项目';
    const description = section?.description || 'AI 学习笔记、阶段报告与项目实践。按主题浏览，或搜索感兴趣的内容。';
    const items = entries.filter(e => !section || e.type === section.type);
    const body = `<section class="shell archive-page">${breadcrumbs(u,[{label:title}])}<div class="page-intro"><p class="eyebrow">${h(section?.eyebrow || 'COLLECTION')}</p><h1>${h(title)}</h1><p>${h(description)}</p></div><div class="library-toolbar">${sectionTabs(u,id)}<label class="search-box glass-control"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input id="search" type="search" placeholder="搜索${section ? h(section.label) : '内容'}" aria-label="搜索${h(title)}" autocomplete="off"><kbd>/</kbd></label></div><div class="results-meta"><span id="result-status" role="status" aria-live="polite">${items.length} 篇内容</span>${items.some(e=>e.demo) ? '<span>含内容示例</span>' : ''}</div><div class="content-grid" id="content-grid">${items.map(e=>card(e,u)).join('')}</div><div class="empty-state" id="empty-state"${items.length ? ' hidden' : ''}><h2>${items.length ? '没有找到相关内容' : '内容正在整理中'}</h2><p>${items.length ? '换个关键词，继续探索。' : '新的记录会在这里陆续更新。'}</p>${items.length ? '<button class="button glass-control" id="reset-search">清除搜索 →</button>' : ''}</div></section>`;
    pages.set(`${route}index.html`,frame(route,title,description,id,body));
  }

  for (const entry of entries) {
    const s = sectionOf(entry);
    const route = routeOf(entry);
    const { u } = context(route);
    const related = entries.filter(e=>e.type===entry.type && e.id!==entry.id).slice(0,2);
    const resources = [[entry.url,'查看项目'],[entry.repository,'查看源码']].filter(([url])=>safeURL(url));
    const body = `<article class="article-page shell">${breadcrumbs(u,[{label:s.label,href:s.id+'/'},{label:'正文'}])}<header class="article-header"><div class="article-meta"><a href="${u(s.id+'/')}">${h(s.label)}</a>${entry.date ? `<span>${h(entry.date)}</span>` : ''}${entry.demo ? '<span>内容示例</span>' : ''}</div><h1>${h(entry.title)}</h1><p class="article-lead">${h(entry.description)}</p><div class="article-actions"><div class="article-tags">${entry.tags.map(t=>`<span>${h(t)}</span>`).join('')}</div><button class="button glass-control small-button" data-copy-link>复制链接 ${arrow}</button></div></header><div class="article-layout"><div class="article-main"><div class="article-visual">${cover(entry,entries.indexOf(entry))}</div>${entry.demo ? '<aside class="entry-demo">内容模板示例。以下是写作结构，等待替换为你的真实记录与项目成果。</aside>' : ''}${entry.sections.map((part,i)=>`<section class="article-section" id="section-${i+1}"><h2>${h(part.heading)}</h2>${part.paragraphs.map(p=>`<p>${h(p)}</p>`).join('')}</section>`).join('')}${resources.length ? `<div class="resource-links">${resources.map(([url,label])=>`<a class="button glass-control" href="${h(safeURL(url))}" target="_blank" rel="noopener noreferrer">${label} ${arrow}</a>`).join('')}</div>` : ''}<a class="text-link article-back" href="${u(s.id+'/')}">← 返回${h(s.label)}</a></div><aside class="article-toc"><p>本页目录</p><nav aria-label="文章目录">${entry.sections.map((part,i)=>`<a href="#section-${i+1}">${h(part.heading)}</a>`).join('')}</nav><a class="toc-category" href="${u(s.id+'/')}">浏览${h(s.label)} ${arrow}</a></aside></div>${related.length ? `<section class="related-section" aria-labelledby="related-heading"><div class="section-heading"><h2 id="related-heading">继续阅读</h2><a class="text-link" href="${u(s.id+'/')}">全部${h(s.label)} ${arrow}</a></div><div class="related-links">${related.map(e=>`<a href="${u(routeOf(e))}"><span>${h(e.title)}</span>${arrow}</a>`).join('')}</div></section>` : ''}</article>`;
    pages.set(`${route}index.html`,frame(route,entry.title,entry.description,s.id,body,{article:true}));
  }

  const about = context('about/');
  const aboutBody = `<section class="shell standalone-page">${breadcrumbs(about.u,[{label:'关于我'}])}<div class="page-intro"><p class="eyebrow">ABOUT</p><h1>关于我</h1><p>学习，思考，然后付诸实践。</p></div><div class="about-layout"><div class="about-profile"><img class="about-avatar" src="${about.u('assets/avatar.jpg')}" width="76" height="76" alt="我的黑白线条头像"><p>${h(profile.name)}</p>${profile.demo ? '<span>个人资料待完善</span>' : ''}</div><div class="about-body"><h2>${h(profile.aboutLead)}</h2>${profile.about.map(p=>`<p>${h(p)}</p>`).join('')}<div class="interest-tags">${profile.interests.map(t=>`<span>${h(t)}</span>`).join('')}</div><a class="button glass-control" href="${about.u('contact/')}">保持联系 ${arrow}</a></div></div><div class="about-explore"><h2>我在这里记录</h2><div class="category-grid">${sections.map(s=>`<a class="category-card" href="${about.u(s.id+'/')}"><div class="category-top"><span>${h(s.eyebrow || s.id)}</span>${arrow}</div><h3>${h(s.label)}</h3><p>${h(s.description)}</p></a>`).join('')}</div></div></section>`;
  pages.set('about/index.html',frame('about/','关于我','关于我的学习、记录与实践。','about',aboutBody));

  const contact = context('contact/');
  const email = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(profile.email || '') ? profile.email : null;
  const links = (profile.links || []).filter(l=>safeURL(l.url));
  const contactBody = `<section class="shell standalone-page contact-page">${breadcrumbs(contact.u,[{label:'联系'}])}<div class="page-intro"><p class="eyebrow">CONTACT</p><h1>保持联系。</h1><p>关于学习、AI，或一个值得尝试的想法。</p></div><div class="contact-panel"><h2>从一次交流开始。</h2><p>欢迎交流学习心得、项目经验与新的想法。</p><div class="contact-methods">${email ? `<a class="button glass-control" href="mailto:${h(email)}">写封邮件给我 ${arrow}</a>` : ''}${links.map(l=>`<a class="button glass-control" href="${h(safeURL(l.url))}" target="_blank" rel="noopener noreferrer">${h(l.label)} ${arrow}</a>`).join('')}${!email && !links.length ? '<p class="contact-placeholder">联系方式待补充。</p>' : ''}</div><button class="button glass-control" data-copy-link>分享这个空间 ${arrow}</button></div></section>`;
  pages.set('contact/index.html',frame('contact/','联系','关于学习、AI 或一个值得尝试的想法。','contact',contactBody));

  rmSync(out,{recursive:true,force:true}); mkdirSync(out,{recursive:true});
  cpSync(path.join(root,'public'),out,{recursive:true});
  writeFileSync(path.join(out,'styles.css'),css);
  writeFileSync(path.join(out,'app.js'),client);
  writeFileSync(path.join(out,'.nojekyll'),'');
  for (const [file,html] of pages) { mkdirSync(path.dirname(path.join(out,file)),{recursive:true}); writeFileSync(path.join(out,file),html); }
  return { pages: [...pages.keys()], outputDirectory:out };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result=buildSite(); console.log(`已生成 ${result.pages.length} 个独立页面。`);
}
