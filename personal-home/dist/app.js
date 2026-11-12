(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const main = $('#main');
  const revision = $('meta[name="site-revision"]')?.content;
  const siteRoot = new URL($('meta[name="site-root"]')?.content || './', location.href);
  const htmlCache = new Map();
  const prefetching = new Set();
  const scrollPositions = new Map();
  const lenses = new WeakMap();
  let renderedURL = new URL(location.href);
  let currentKey = history.state?.siteKey || makeKey();
  let historyIndex = history.state?.siteIndex || 0;
  let navigationId = 0;
  let requestController;
  let cleanupPage = () => {};
  let enteringAnimation;
  let leavingAnimation;

  function makeKey() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
  function absoluteURLs(root, base) {
    $$('[href], [src], [data-nav-paths]', root).forEach(element => {
      if(element.dataset.navPaths)element.dataset.navPaths=element.dataset.navPaths.split(' ').map(value=>new URL(value,base).pathname).join(' ');
      for (const attr of ['href', 'src']) {
        const value = element.getAttribute(attr);
        if(attr==='href'&&value?.startsWith('#'))element.dataset.localFragment=value;
        if (value) { try { element.setAttribute(attr, new URL(value, base).href); } catch { /* Leave invalid optional links alone. */ } }
      }
    });
  }
  absoluteURLs(document, location.href);
  history.replaceState({ ...history.state, siteKey: currentKey, siteIndex: historyIndex }, '', location.href);
  history.scrollRestoration = 'manual';

  const legacy = $('#legacy-routes');
  if (legacy && location.hash) {
    try {
      const key = decodeURIComponent(location.hash.slice(1));
      const route = key.startsWith('entry=') ? JSON.parse(legacy.textContent)[key.slice(6)] : { about:'about/', contact:'contact/', library:'library/' }[key];
      if (route) { location.replace(new URL(route, siteRoot)); return; }
    } catch { /* Invalid legacy fragments leave the homepage readable. */ }
  }

  function updateTheme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    $('.theme-toggle')?.setAttribute('aria-label', `切换到${dark ? '浅色' : '深色'}模式`);
    $('.theme-toggle')?.setAttribute('aria-pressed', String(dark));
    $('meta[name="theme-color"]').content = dark ? '#101113' : '#f8f9fb';
  }
  $('.theme-toggle')?.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('personal-site-theme', theme); } catch { /* Storage is optional. */ }
    updateTheme();
  });
  updateTheme();

  function positionLens(nav, animate = false) {
    let state = lenses.get(nav);
    if (!state) {
      const lens = document.createElement('span'); lens.className = 'nav-lens'; lens.setAttribute('aria-hidden', 'true');
      nav.prepend(lens); nav.dataset.glassNav = ''; state = { lens, ready:false }; lenses.set(nav, state);
    }
    const active = $('a.current', nav);
    const { lens } = state;
    if (!active) { lens.style.opacity = '0'; state.ready = false; return; }
    const navBox = nav.getBoundingClientRect();
    const old = lens.getBoundingClientRect();
    const from = { x:old.left-navBox.left+nav.scrollLeft-nav.clientLeft, y:old.top-navBox.top+nav.scrollTop-nav.clientTop, width:old.width, height:old.height };
    const target = { x:active.offsetLeft, y:active.offsetTop, width:active.offsetWidth, height:active.offsetHeight };
    state.animation?.cancel();
    Object.assign(lens.style, { opacity:'1', width:`${target.width}px`, height:`${target.height}px`, transform:`translate3d(${target.x}px,${target.y}px,0)` });
    if (animate && state.ready && !reducedMotion.matches && typeof lens.animate === 'function' && Math.abs(from.x-target.x)+Math.abs(from.width-target.width)>1) {
      nav.classList.remove('is-travelling'); void nav.offsetWidth; nav.classList.add('is-travelling');
      const middle = (from.x+target.x)/2;
      const stretch = Math.min(16,Math.abs(from.x-target.x)*.08);
      state.animation = lens.animate([
        { transform:`translate3d(${from.x}px,${from.y}px,0)`, width:`${from.width}px`, height:`${from.height}px`, borderRadius:'24px' },
        { transform:`translate3d(${middle-stretch/2}px,${target.y}px,0)`, width:`${(from.width+target.width)/2+stretch}px`, height:`${target.height*.94}px`, borderRadius:'20px', offset:.45 },
        { transform:`translate3d(${target.x}px,${target.y}px,0)`, width:`${target.width}px`, height:`${target.height}px`, borderRadius:'24px' }
      ], { duration:460, easing:'cubic-bezier(.18,.82,.22,1)' });
      const animation = state.animation;
      animation.finished.catch(() => {}).finally(() => { if (state.animation === animation) nav.classList.remove('is-travelling'); });
    }
    state.ready = true;
  }
  function syncNav(current, incoming, animate = true) {
    if (!current || !incoming) return;
    const previous = $('a[aria-current="page"]', current)?.href;
    const selected = $('a[aria-current="page"]', incoming)?.href;
    $$('a',current).forEach(link => { const active = link.href===selected; link.classList.toggle('current',active); if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current'); });
    if(previous!==selected || !lenses.has(current))positionLens(current,animate);
  }
  function anticipateNav(url) {
    const nav=$('.main-nav');
    const links=$$('a',nav);
    const ranked=links.map(link=>({link,rank:Math.max(-1,...[link.pathname,...(link.dataset.navPaths?.split(' ')||[])].map(route=>route===siteRoot.pathname?(route===url.pathname?route.length:-1):(url.pathname.startsWith(route)?route.length:-1)))}));
    const active=ranked.filter(item=>item.rank>=0).sort((a,b)=>b.rank-a.rank)[0]?.link;
    links.forEach(link => { const selected=link===active; link.classList.toggle('current',selected); if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current'); });
    positionLens(nav,true);
  }
  function refreshLenses() { $$('.main-nav, .collection-tabs').forEach(nav=>positionLens(nav)); }
  refreshLenses();
  window.addEventListener('resize',refreshLenses,{passive:true});
  document.fonts?.ready.then(refreshLenses);

  function mountPage(url) {
    cleanupPage();
    const controller=new AbortController(); cleanupPage=()=>controller.abort();
    const search=$('#search');
    const cards=$$('#content-grid .content-card');
    if (search) {
      const applySearch=(updateURL=true)=>{
        const query=search.value.trim().toLocaleLowerCase(); let count=0;
        cards.forEach(card=>{card.hidden=!card.dataset.search.includes(query);if(!card.hidden)count++;});
        $('#empty-state').hidden=count>0;
        $('#result-status').textContent=`${count} 篇内容${query?` · 搜索“${search.value.trim()}”`:''}`;
        if(updateURL){ const next=new URL(location.href);if(query)next.searchParams.set('q',search.value.trim());else next.searchParams.delete('q');history.replaceState({...history.state},'',next);renderedURL=next; }
      };
      search.value=url.searchParams.get('q')||''; applySearch(false);
      search.addEventListener('input',()=>applySearch(),{signal:controller.signal});
      $('#reset-search')?.addEventListener('click',()=>{search.value='';applySearch();search.focus();},{signal:controller.signal});
    }
    $$('.collection-tabs').forEach(nav=>{if(!lenses.has(nav))positionLens(nav);});
  }
  mountPage(renderedURL);

  function rememberScroll(persist=false) {
    const position={x:scrollX,y:scrollY}; scrollPositions.set(currentKey,position);
    if(persist)history.replaceState({...history.state,sitePosition:position},'',location.href);
  }
  window.addEventListener('scroll',()=>rememberScroll(),{passive:true});
  window.addEventListener('pagehide',()=>rememberScroll(true));
  function scrollToTarget(url,position) {
    if(position){window.scrollTo({left:position.x,top:position.y,behavior:'instant'});return;}
    let anchor;try{anchor=url.hash&&document.getElementById(decodeURIComponent(url.hash.slice(1)));}catch{}
    if(anchor){anchor.setAttribute('tabindex','-1');anchor.focus({preventScroll:true});anchor.scrollIntoView({behavior:'instant',block:'start'});}else window.scrollTo({left:0,top:0,behavior:'instant'});
  }
  function samePage(a,b) { return a.pathname===b.pathname&&a.search===b.search; }
  function cancelNavigation() {
    navigationId++;requestController?.abort();leavingAnimation?.cancel();enteringAnimation?.cancel();
    main.removeAttribute('aria-busy');document.documentElement.classList.remove('is-navigating');anticipateNav(renderedURL);
  }
  function eligible(link) {
    if(!link || link.hasAttribute('download') || (link.target&&link.target!=='_self') || link.relList.contains('external') || link.dataset.noRouter!==undefined)return null;
    const url=new URL(link.href);
    if(url.origin!==siteRoot.origin || !url.pathname.startsWith(siteRoot.pathname) || !/\/$|\/index\.html$/.test(url.pathname))return null;
    return url;
  }
  const pageKey=url=>url.origin+url.pathname;
  async function loadHTML(url,signal) {
    const key=pageKey(url);
    if(htmlCache.has(key))return htmlCache.get(key);
    const response=await fetch(key,{credentials:'same-origin',signal,headers:{Accept:'text/html'}});
    if(!response.ok || !response.headers.get('content-type')?.includes('text/html') || new URL(response.url).origin!==siteRoot.origin)throw new Error('Page unavailable');
    const html=await response.text();
    const parsed=new DOMParser().parseFromString(html,'text/html');
    if(!$('#main',parsed)||$('meta[name="site-revision"]',parsed)?.content!==revision)throw new Error('Page version changed');
    htmlCache.set(key,html);if(htmlCache.size>24)htmlCache.delete(htmlCache.keys().next().value);
    return html;
  }
  function updateMetadata(next) {
    document.title=next.title;
    for(const selector of ['meta[name="description"]','meta[property="og:type"]','meta[property="og:title"]','meta[property="og:description"]']) {
      const current=$(selector);const incoming=$(selector,next);if(current&&incoming)current.content=incoming.content;
    }
    if(next.body.dataset.page)document.body.dataset.page=next.body.dataset.page;else delete document.body.dataset.page;
  }
  async function navigate(url,{popState=null,pop=false}={}) {
    const id=++navigationId;
    requestController?.abort(); requestController=new AbortController();
    const controller=requestController;
    const timeout=setTimeout(()=>controller.abort(),12000);
    rememberScroll(!pop);
    anticipateNav(url);
    document.documentElement.classList.add('is-navigating');
    main.setAttribute('aria-busy','true');
    try {
      const html=await loadHTML(url,controller.signal);
      if(id!==navigationId)return;
      const next=new DOMParser().parseFromString(html,'text/html');
      absoluteURLs(next,url);
      const nextMain=$('#main',next);
      enteringAnimation?.cancel();leavingAnimation?.cancel();
      if(!reducedMotion.matches&&typeof main.animate==='function') {
        leavingAnimation=main.animate([{opacity:getComputedStyle(main).opacity,transform:'translateY(0)'},{opacity:0,transform:'translateY(-5px)'}],{duration:100,easing:'ease-out',fill:'forwards'});
        await leavingAnimation.finished.catch(()=>{});
      }
      if(id!==navigationId){leavingAnimation?.cancel();return;}
      const oldTabs=$('.collection-tabs');const newTabs=$('.collection-tabs',nextMain);
      if(oldTabs&&newTabs){syncNav(oldTabs,newTabs,true);newTabs.replaceWith(oldTabs);}
      if(pop){currentKey=popState?.siteKey||makeKey();historyIndex=popState?.siteIndex||0;}
      else {currentKey=makeKey();historyIndex++;history.pushState({siteKey:currentKey,siteIndex:historyIndex},'',url);}
      main.replaceChildren(...nextMain.childNodes);
      $$('[data-local-fragment]').forEach(link=>{link.href=new URL(link.dataset.localFragment,url).href;});
      renderedURL=new URL(url);
      updateMetadata(next);
      syncNav($('.main-nav'),$('.main-nav',next),true);
      const contact=$('.header-contact');const nextContact=$('.header-contact',next);
      if(nextContact?.hasAttribute('aria-current'))contact?.setAttribute('aria-current','page');else contact?.removeAttribute('aria-current');
      mountPage(url);
      leavingAnimation?.cancel();
      const heading=$('h1',main);heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});
      scrollToTarget(url,pop?(scrollPositions.get(currentKey)||popState?.sitePosition):null);
      if(!reducedMotion.matches&&typeof main.animate==='function')enteringAnimation=main.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:240,easing:'cubic-bezier(.2,.7,.2,1)'});
    } catch(error) {
      if(id!==navigationId)return;
      // A network, authentication, or deployment change uses the original working HTML URL.
      location.assign(url.href);
    } finally {
      clearTimeout(timeout);
      if(id===navigationId){main.removeAttribute('aria-busy');document.documentElement.classList.remove('is-navigating');}
    }
  }

  document.addEventListener('click',event=>{
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const link=event.target.closest('a[href]');
    const url=eligible(link);if(!url)return;
    if(samePage(url,renderedURL)) {
      event.preventDefault();cancelNavigation();rememberScroll(true);
      if(url.href!==location.href){currentKey=makeKey();historyIndex++;history.pushState({siteKey:currentKey,siteIndex:historyIndex},'',url);renderedURL=url;}
      scrollToTarget(url);return;
    }
    event.preventDefault();navigate(url);
  });
  window.addEventListener('popstate',event=>{
    const url=new URL(location.href);
    if(samePage(url,renderedURL)){
      cancelNavigation();rememberScroll();currentKey=event.state?.siteKey||makeKey();historyIndex=event.state?.siteIndex||0;renderedURL=url;
      scrollToTarget(url,scrollPositions.get(currentKey)||event.state?.sitePosition);return;
    }
    navigate(url,{pop:true,popState:event.state});
  });
  function prefetch(event) {
    if(navigator.connection?.saveData)return;
    const url=eligible(event.target.closest('a[href]'));
    if(!url||samePage(url,renderedURL)||htmlCache.has(pageKey(url))||prefetching.has(pageKey(url)))return;
    prefetching.add(pageKey(url));
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5000);
    loadHTML(url,controller.signal).catch(()=>{}).finally(()=>{clearTimeout(timer);prefetching.delete(pageKey(url));});
  }
  document.addEventListener('pointerover',prefetch,{passive:true});
  document.addEventListener('focusin',prefetch);
  document.addEventListener('keydown',event=>{
    if(event.key==='/'&&$('#search')&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!document.activeElement.isContentEditable&&!event.ctrlKey&&!event.metaKey){event.preventDefault();$('#search').focus();}
  });
  function toast(message){const box=$('#toast');box.textContent=message;box.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>box.classList.remove('visible'),2500);}
  async function copyLink(){const url=new URL(location.href);url.hash='';try{await navigator.clipboard.writeText(url.href);toast('链接已复制');}catch{const field=document.createElement('textarea');field.value=url.href;field.style.cssText='position:fixed;opacity:0;pointer-events:none';document.body.append(field);field.select();let success=false;try{success=document.execCommand('copy');}catch{}field.remove();if(success)toast('链接已复制');else window.prompt('复制以下链接来分享',url.href);}}
  document.addEventListener('click',event=>{if(event.target.closest('[data-copy-link]'))copyLink();});
  document.documentElement.dataset.navigation='instant';
  document.documentElement.dataset.navigationSession=makeKey();
})();
