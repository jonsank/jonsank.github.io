import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildSite, readContent, validateContent } from './build.mjs';

const data=readContent();
const result=buildSite();
for (const file of ['src/client.js','src/covers.mjs','scripts/build.mjs']) execFileSync(process.execPath,['--check',file]);
let links=0;
for (const file of result.pages) {
  const html=readFileSync(path.join(result.outputDirectory,file),'utf8');
  assert.equal([...html.matchAll(/<h1(?:\s[^>]*)?>/g)].length,1,`${file} 必须有一个主标题`);
  assert(!html.includes('<dialog'),`${file} 应使用独立正文页`);
  assert(/<meta name="site-revision" content="[a-f0-9]{10}">/.test(html),`${file} 缺少页面版本标记`);
  assert(html.includes('<meta name="site-root"'),`${file} 缺少无刷新导航范围`);
  const mainNav=html.match(/<nav class="main-nav"[^>]*>(.*?)<\/nav>/s)?.[1]||'';
  assert(mainNav.includes('笔记与项目')&&!mainNav.includes('>AI 笔记<')&&!mainNav.includes('>学习报告<')&&!mainNav.includes('>项目实践<'),`${file} 的主导航应只包含父栏目`);
  for (const [,raw] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url=new URL(raw.replaceAll('&amp;','&'),'https://site.test/project/'+file);
    if (url.origin!=='https://site.test') continue;
    assert(url.pathname.startsWith('/project/'),`${file} 的资源链接逃出了项目路径：${raw}`);
    let target=decodeURIComponent(url.pathname.slice('/project/'.length));
    if (target.endsWith('/')) target+='index.html';
    assert(existsSync(path.join(result.outputDirectory,target)),`${file} 有断链：${raw}`);
    if (url.hash) {
      const targetHTML=readFileSync(path.join(result.outputDirectory,target),'utf8');
      assert(targetHTML.includes(`id="${url.hash.slice(1)}"`),`${file} 的页内锚点不存在：${raw}`);
    }
    links++;
  }
}
const extended=structuredClone(data);
extended.sections.push({id:'reading',type:'reading',label:'阅读',title:'阅读记录',description:'测试新增栏目',eyebrow:'READING'});
extended.entries.push({...structuredClone(data.entries[0]),id:'new-reading-note',type:'reading',title:'新增栏目验证'});
const temporary=mkdtempSync(path.join(tmpdir(),'personal-pages-'));
try {
  const output=buildSite({outputDirectory:temporary,data:extended});
  assert(output.pages.includes('reading/index.html'));
  assert(output.pages.includes('reading/new-reading-note/index.html'));
  assert(readFileSync(path.join(temporary,'index.html'),'utf8').includes('阅读'));
  assert(readFileSync(path.join(temporary,'reading/new-reading-note/index.html'),'utf8').includes('新增栏目验证'));
} finally { rmSync(temporary,{recursive:true,force:true}); }
const invalid=structuredClone(data); invalid.sections.push({...data.sections[0]});
assert.throws(()=>validateContent(invalid),/重复/);
assert(!existsSync(path.join(result.outputDirectory,'.openai')));
assert(existsSync(path.join(result.outputDirectory,'.nojekyll')));
console.log(`已验证 ${result.pages.length} 个页面、${links} 处内部链接、GitHub 项目子路径，以及新增栏目与文章自动生成。`);
