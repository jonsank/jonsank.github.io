(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const glassEffects = createClearGlass();
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
    glassEffects.refresh();
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

  function createClearGlass() {
    const selector='.header-inner.glass, .collection-tabs.glass, .button.glass-control, .theme-toggle.glass-control, .search-box.glass-control';
    const transparency=matchMedia('(prefers-reduced-transparency: reduce)');
    const contrast=matchMedia('(prefers-contrast: more)');
    const finePointer=matchMedia('(hover: hover) and (pointer: fine)');
    const ns='http://www.w3.org/2000/svg';
    // WebKit keeps the sharp CSS material; Chromium additionally bends the backdrop at the rim.
    const opticalSupport=/(?:Chrome|Chromium|Edg)\/[0-9]/.test(navigator.userAgent)&&CSS.supports('backdrop-filter','url("#clear-glass")');
    const svg=document.createElementNS(ns,'svg');
    svg.setAttribute('aria-hidden','true');svg.setAttribute('width','0');svg.setAttribute('height','0');
    svg.style.cssText='position:fixed;inset:0;pointer-events:none;overflow:hidden';
    const defs=document.createElementNS(ns,'defs');svg.append(defs);document.body.append(svg);
    const tracked=new Map();const maps=new Map();
    let counter=0;let refreshFrame=0;let pointerFrame=0;let hovered;
    function displacement(width,height,radius) {
      const key=[width,height,radius].join(':');if(maps.has(key))return maps.get(key);
      const canvas=document.createElement('canvas');const ratio=Math.min(1,Math.sqrt(160000/(width*height)));
      canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
      const ctx=canvas.getContext('2d');if(!ctx)return null;
      const image=ctx.createImageData(canvas.width,canvas.height);const pixels=image.data;
      const bevel=Math.min(10,height*.18);const strength=Math.min(5.5,height*.07);const scale=18;
      for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
        const px=(x+.5)/canvas.width*width-width/2;const py=(y+.5)/canvas.height*height-height/2;
        const qx=Math.abs(px)-(width/2-radius);const qy=Math.abs(py)-(height/2-radius);
        const ox=Math.max(qx,0),oy=Math.max(qy,0);const length=Math.hypot(ox,oy);
        const inside=-(length+Math.min(Math.max(qx,qy),0)-radius);
        let dx=0,dy=0;
        if(inside>0&&inside<bevel){
          const bend=Math.sin(inside/bevel*Math.PI)*strength;
          const nx=length>0?ox/length:(qx>qy?1:0);const ny=length>0?oy/length:(qx>qy?0:1);
          dx=-Math.sign(px)*nx*bend;dy=-Math.sign(py)*ny*bend;
        }
        const i=(y*canvas.width+x)*4;
        pixels[i]=Math.round(127.5+dx/scale*255);pixels[i+1]=Math.round(127.5+dy/scale*255);pixels[i+2]=128;pixels[i+3]=255;
      }
      ctx.putImageData(image,0,0);const data=canvas.toDataURL();maps.set(key,data);if(maps.size>32)maps.delete(maps.keys().next().value);return data;
    }
    function update(element) {
      const state=tracked.get(element);if(!state||!element.isConnected)return;
      if(!opticalSupport||transparency.matches||contrast.matches){element.style.removeProperty('--glass-refraction');return;}
      const rect=element.getBoundingClientRect();const width=Math.round(rect.width),height=Math.round(rect.height);
      if(width<2||height<2)return;
      const radius=Math.min(parseFloat(getComputedStyle(element).borderTopLeftRadius)||24,width/2,height/2);
      const size=[width,height,radius].join(':');if(state.size===size)return;
      const map=displacement(width,height,radius);if(!map)return;
      if(!state.filter){
        state.filter=document.createElementNS(ns,'filter');state.filter.id=`clear-glass-${++counter}`;
        state.filter.setAttribute('filterUnits','userSpaceOnUse');state.filter.setAttribute('primitiveUnits','userSpaceOnUse');state.filter.setAttribute('color-interpolation-filters','sRGB');
        const image=document.createElementNS(ns,'feImage');image.setAttribute('result','rim-map');image.setAttribute('preserveAspectRatio','none');
        const warp=document.createElementNS(ns,'feDisplacementMap');warp.setAttribute('in','SourceGraphic');warp.setAttribute('in2','rim-map');warp.setAttribute('scale','18');warp.setAttribute('xChannelSelector','R');warp.setAttribute('yChannelSelector','G');warp.setAttribute('result','refracted');
        const soften=document.createElementNS(ns,'feGaussianBlur');soften.setAttribute('in','refracted');soften.setAttribute('stdDeviation','.3');
        state.filter.append(image,warp,soften);defs.append(state.filter);state.image=image;
      }
      state.size=size;state.filter.setAttribute('x','0');state.filter.setAttribute('y','0');state.filter.setAttribute('width',width);state.filter.setAttribute('height',height);
      state.image.setAttribute('width',width);state.image.setAttribute('height',height);state.image.setAttribute('href',map);
      element.style.setProperty('--glass-refraction',`url("#${state.filter.id}")`);
    }
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(items=>{items.forEach(item=>update(item.target));}):null;
    function refresh() {
      cancelAnimationFrame(refreshFrame);refreshFrame=requestAnimationFrame(()=>{
        for(const [element,state]of tracked)if(!element.isConnected){observer?.unobserve(element);state.filter?.remove();tracked.delete(element);}
        $$(selector).forEach(element=>{
          if(!tracked.has(element)){tracked.set(element,{});element.classList.add('clear-glass');observer?.observe(element);}
          update(element);
        });
      });
    }
    document.addEventListener('pointermove',event=>{
      if(!finePointer.matches||reducedMotion.matches||transparency.matches||contrast.matches)return;
      const surface=event.target.closest?.('.clear-glass');
      if(hovered&&hovered!==surface){hovered.style.removeProperty('--glint-x');hovered.style.removeProperty('--glint-y');hovered.style.removeProperty('--glint-angle');}
      hovered=surface;if(!surface)return;
      const x=event.clientX,y=event.clientY;
      cancelAnimationFrame(pointerFrame);pointerFrame=requestAnimationFrame(()=>{
        if(!surface.isConnected)return;const rect=surface.getBoundingClientRect();
        surface.style.setProperty('--glint-x',`${Math.max(0,Math.min(100,(x-rect.left)/rect.width*100))}%`);
        surface.style.setProperty('--glint-y',`${Math.max(0,Math.min(100,(y-rect.top)/rect.height*100))}%`);
        surface.style.setProperty('--glint-angle',`${Math.atan2(y-rect.top-rect.height/2,x-rect.left-rect.width/2)*180/Math.PI+90}deg`);
      });
    },{passive:true});
    document.addEventListener('pointerleave',()=>{if(hovered){hovered.style.removeProperty('--glint-x');hovered.style.removeProperty('--glint-y');hovered.style.removeProperty('--glint-angle');hovered=null;}});
    for(const media of[transparency,contrast])media.addEventListener('change',()=>{for(const state of tracked.values())state.size=null;refresh();});
    return{refresh};
  }
})();
