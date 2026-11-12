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
  let fallbackTransition;

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
    updateTheme();glassEffects.refresh();
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
  function refreshLenses() { $$('.main-nav, #main .collection-tabs').forEach(nav=>positionLens(nav)); }
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
    $$('.collection-tabs',main).forEach(nav=>{if(!lenses.has(nav))positionLens(nav);});
    // Prepare the optical filters before the new page is painted or captured.
    glassEffects.refresh({ immediate:true });
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
  function stopPageTransition(){
    enteringAnimation?.cancel();
    if(fallbackTransition){fallbackTransition.animation?.cancel();fallbackTransition.layer.remove();fallbackTransition=null;}
  }
  function cancelNavigation() {
    navigationId++;requestController?.abort();stopPageTransition();
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
    stopPageTransition();
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
      // The old page stays fully visible while HTML and its images are prepared.
      await prepareImages(nextMain,controller.signal);
      if(id!==navigationId)return;
      let committed=false;
      const commitPage=()=>{
        if(id!==navigationId||committed)return;
        committed=true;
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
        const heading=$('h1',main);heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});
        scrollToTarget(url,pop?(scrollPositions.get(currentKey)||popState?.sitePosition):null);
      };
      // Keep the real header live: a named View Transition header isolates its
      // backdrop and prevents the glass from sampling the scrolling page below.
      {
        document.documentElement.dataset.pageTransition=reducedMotion.matches?'reduced':'snapshot';
        const snapshot=!reducedMotion.matches&&typeof main.animate==='function'?capturePage():null;
        commitPage();
        // The previous content fades over the painted next page below the live
        // header. The viewport stays covered throughout the handoff.
        if(snapshot){
          const style=getComputedStyle(document.documentElement);
          const options={
            duration:parseFloat(style.getPropertyValue('--page-duration'))||280,
            easing:style.getPropertyValue('--page-ease').trim()||'ease-out'
          };
          const animation=snapshot.animate([{opacity:1},{opacity:0}],options);
          const transition={layer:snapshot,animation};fallbackTransition=transition;
          enteringAnimation=main.animate([{transform:`translateY(${style.getPropertyValue('--page-shift').trim()||'5px'})`},{transform:'translateY(0)'}],options);
          animation.finished.catch(()=>{}).finally(()=>{snapshot.remove();if(fallbackTransition===transition)fallbackTransition=null;});
        }
      }
    } catch(error) {
      if(id!==navigationId)return;
      // A network, authentication, or deployment change uses the original working HTML URL.
      location.assign(url.href);
    } finally {
      clearTimeout(timeout);
      if(id===navigationId){main.removeAttribute('aria-busy');document.documentElement.classList.remove('is-navigating');}
    }
  }

  function capturePage(){
    const layer=document.createElement('div');layer.className='page-snapshot';layer.inert=true;layer.setAttribute('aria-hidden','true');
    const background=document.createElement('div');const bodyStyle=getComputedStyle(document.body);
    background.style.cssText=`position:absolute;left:0;top:${-scrollY}px;width:100%;height:${document.body.scrollHeight}px;background-color:${bodyStyle.backgroundColor};background-image:${bodyStyle.backgroundImage}`;
    layer.append(background);
    for(const element of[main,$('.site-footer')].filter(Boolean)){
      const rect=element.getBoundingClientRect();const copy=element.cloneNode(true);
      copy.removeAttribute('id');$$('[id]',copy).forEach(node=>node.removeAttribute('id'));
      Object.assign(copy.style,{position:'absolute',margin:'0',top:`${rect.top}px`,left:`${rect.left}px`,width:`${rect.width}px`,maxWidth:'none',transform:'none'});
      layer.append(copy);
    }
    // Keep independent copies of the old material maps; mounting the next page
    // can release its previous filters without changing the outgoing picture.
    const ns='http://www.w3.org/2000/svg';const svg=document.createElementNS(ns,'svg');
    svg.setAttribute('width','0');svg.setAttribute('height','0');const defs=document.createElementNS(ns,'defs');svg.append(defs);
    const replacements=new Map();
    for(const filter of $$('filter[id^="clear-glass-"]')){
      const copy=filter.cloneNode(true);const id=`${filter.id}-snapshot-${navigationId}`;copy.id=id;replacements.set(filter.id,id);defs.append(copy);
    }
    for(const element of $$('[style]',layer)){
      const value=element.style.getPropertyValue('--glass-refraction');
      if(value)element.style.setProperty('--glass-refraction',value.replace(/#(clear-glass-\d+)/g,(_,id)=>`#${replacements.get(id)||id}`));
    }
    layer.append(svg);document.body.append(layer);return layer;
  }

  async function prepareImages(root,signal){
    const sources=[...new Set($$('img',root).map(img=>img.currentSrc||img.src).filter(Boolean))];
    if(!sources.length||signal.aborted)return;
    const images=sources.map(src=>{const image=new Image();image.src=src;return image.decode?.().catch(()=>{});});
    // A slow or unavailable optional image must never block navigation indefinitely.
    let timer;let onAbort;
    try{
      await Promise.race([
        Promise.all(images),
        new Promise(resolve=>{timer=setTimeout(resolve,700);onAbort=resolve;signal.addEventListener('abort',onAbort,{once:true});})
      ]);
    }finally{clearTimeout(timer);if(onAbort)signal.removeEventListener('abort',onAbort);}
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
    const selector='.header-inner.glass, .collection-tabs.glass, .nav-lens, .button.glass-control, .theme-toggle.glass-control, .search-box.glass-control';
    const transparency=matchMedia('(prefers-reduced-transparency: reduce)');
    const contrast=matchMedia('(prefers-contrast: more)');
    const finePointer=matchMedia('(hover: hover) and (pointer: fine)');
    const ns='http://www.w3.org/2000/svg';
    const opticalSupport=/(?:Chrome|Chromium|Edg)\/[0-9]/.test(navigator.userAgent)&&CSS.supports('backdrop-filter','url("#clear-glass")');
    const svg=document.createElementNS(ns,'svg');
    svg.setAttribute('aria-hidden','true');svg.setAttribute('width','0');svg.setAttribute('height','0');
    svg.style.cssText='position:fixed;inset:0;pointer-events:none;overflow:hidden';
    const defs=document.createElementNS(ns,'defs');svg.append(defs);document.body.append(svg);
    const tracked=new Map();const maps=new Map();
    let counter=0;let refreshFrame=0;let pointerFrame=0;let hovered;

    function svgNode(name,attributes) {
      const node=document.createElementNS(ns,name);
      for(const [key,value]of Object.entries(attributes))node.setAttribute(key,String(value));
      return node;
    }
    function setting(style,name,fallback) {
      const value=parseFloat(style.getPropertyValue(name));
      return Number.isFinite(value)?value:fallback;
    }
    function displacement(width,height,radius,bevel,strength,scale) {
      const key=[width,height,radius,bevel,strength,scale].join(':');
      if(maps.has(key))return maps.get(key);
      const canvas=document.createElement('canvas');
      const ratio=Math.min(1,Math.sqrt(100000/(width*height)));
      canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
      const ctx=canvas.getContext('2d');if(!ctx)return null;
      const image=ctx.createImageData(canvas.width,canvas.height);const pixels=image.data;
      for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
        const px=(x+.5)/canvas.width*width-width/2,py=(y+.5)/canvas.height*height-height/2;
        const qx=Math.abs(px)-(width/2-radius),qy=Math.abs(py)-(height/2-radius);
        const ox=Math.max(qx,0),oy=Math.max(qy,0),length=Math.hypot(ox,oy);
        const inside=-(length+Math.min(Math.max(qx,qy),0)-radius);
        let dx=0,dy=0,edge=0;
        if(inside>0&&inside<bevel){
          const t=inside/bevel;
          // A smooth convex bevel: the center has no warp, the rounded rim lenses the backdrop.
          const bend=Math.sin(Math.PI*Math.pow(t,.7))*strength;
          const nx=length>0?ox/length:(qx>qy?1:0),ny=length>0?oy/length:(qx>qy?0:1);
          dx=-Math.sign(px)*nx*bend;dy=-Math.sign(py)*ny*bend;
          edge=Math.pow(Math.sin(Math.PI*t),.65);
        }
        const i=(y*canvas.width+x)*4;
        pixels[i]=Math.round(127.5+dx/scale*255);
        pixels[i+1]=Math.round(127.5+dy/scale*255);
        // Blue stores the scattering mask; alpha stays opaque for stable displacement sampling.
        pixels[i+2]=Math.round(edge*255);pixels[i+3]=255;
      }
      ctx.putImageData(image,0,0);
      const data=canvas.toDataURL();maps.set(key,data);
      if(maps.size>48)maps.delete(maps.keys().next().value);
      return data;
    }
    function update(element) {
      const state=tracked.get(element);if(!state||!element.isConnected)return;
      const enabled=opticalSupport&&!transparency.matches&&!contrast.matches;
      element.dataset.glassOptics=enabled?'refraction':'css';
      if(!enabled){element.style.removeProperty('--glass-refraction');state.key=null;return;}
      const width=element.offsetWidth,height=element.offsetHeight;
      if(width<2||height<2)return;
      const style=getComputedStyle(element);
      const radius=Math.max(0,Math.min(parseFloat(style.borderTopLeftRadius)||0,width/2,height/2));
      const bevel=Math.max(1,Math.min(setting(style,'--glass-rim',14),height*.24,width*.24));
      const strength=Math.max(0,Math.min(setting(style,'--glass-warp',8),height*.12,width*.12));
      const scatter=Math.max(0,Math.min(setting(style,'--glass-scatter',.65),2));
      const scale=Math.max(18,strength*2.2);
      const key=[width,height,radius,bevel,strength,scatter,scale].join(':');
      if(state.key===key)return;
      const map=displacement(width,height,radius,bevel,strength,scale);if(!map)return;
      if(!state.filter){
        state.filter=svgNode('filter',{id:'clear-glass-'+(++counter),filterUnits:'userSpaceOnUse',primitiveUnits:'userSpaceOnUse','color-interpolation-filters':'sRGB'});
        state.image=svgNode('feImage',{result:'rim-map',preserveAspectRatio:'none'});
        state.warp=svgNode('feDisplacementMap',{in:'SourceGraphic',in2:'rim-map',xChannelSelector:'R',yChannelSelector:'G',result:'refracted'});
        const mask=svgNode('feColorMatrix',{in:'rim-map',type:'matrix',values:'0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 1 0 0',result:'edge-mask'});
        state.soften=svgNode('feGaussianBlur',{in:'refracted',result:'scattered'});
        const rim=svgNode('feComposite',{in:'scattered',in2:'edge-mask',operator:'in',result:'soft-rim'});
        const center=svgNode('feComposite',{in:'refracted',in2:'edge-mask',operator:'out',result:'clear-center'});
        // Add premultiplied masked layers so their alpha sums to one, avoiding a milky seam.
        const combine=svgNode('feComposite',{in:'soft-rim',in2:'clear-center',operator:'arithmetic',k1:0,k2:1,k3:1,k4:0});
        state.filter.append(state.image,state.warp,mask,state.soften,rim,center,combine);defs.append(state.filter);
      }
      state.key=key;
      for(const [name,value]of Object.entries({x:0,y:0,width,height}))state.filter.setAttribute(name,String(value));
      state.image.setAttribute('width',String(width));state.image.setAttribute('height',String(height));state.image.setAttribute('href',map);
      state.warp.setAttribute('scale',String(scale));state.soften.setAttribute('stdDeviation',String(scatter));
      element.style.setProperty('--glass-refraction','url("#'+state.filter.id+'")');
    }
    // Coalesce resize callbacks; moving a lens only needs a new map when its layout size changes.
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>refresh()):null;
    function refresh({immediate=false}={}) {
      cancelAnimationFrame(refreshFrame);
      const apply=()=>{
        for(const [element,state]of tracked)if(!element.isConnected){
          observer?.unobserve(element);state.filter?.remove();tracked.delete(element);
        }
        $$(selector).filter(element=>!element.closest('.page-snapshot')).forEach(element=>{
          if(!tracked.has(element)){tracked.set(element,{});element.classList.add('clear-glass');observer?.observe(element);}
          update(element);
        });
      };
      if(immediate)apply();else refreshFrame=requestAnimationFrame(apply);
    }
    function resetLight(surface){
      for(const element of[surface,...$$('.nav-lens',surface)]){
        element.style.removeProperty('--glint-x');element.style.removeProperty('--glint-y');element.style.removeProperty('--glint-angle');
      }
    }
    function lightAt(surface,x,y){
      for(const element of[surface,...$$('.nav-lens',surface)]){
        if(!element.isConnected)continue;
        const rect=element.getBoundingClientRect();
        element.style.setProperty('--glint-x',Math.max(0,Math.min(100,(x-rect.left)/Math.max(1,rect.width)*100))+'%');
        element.style.setProperty('--glint-y',Math.max(0,Math.min(100,(y-rect.top)/Math.max(1,rect.height)*100))+'%');
        element.style.setProperty('--glint-angle',(Math.atan2(y-rect.top-rect.height/2,x-rect.left-rect.width/2)*180/Math.PI+90)+'deg');
      }
    }
    document.addEventListener('pointermove',event=>{
      if(!finePointer.matches||reducedMotion.matches||transparency.matches||contrast.matches)return;
      const surface=event.target.closest?.('.clear-glass');
      if(hovered&&hovered!==surface)resetLight(hovered);
      hovered=surface;if(!surface)return;
      const x=event.clientX,y=event.clientY;
      cancelAnimationFrame(pointerFrame);
      pointerFrame=requestAnimationFrame(()=>lightAt(surface,x,y));
    },{passive:true});
    document.addEventListener('pointerleave',()=>{if(hovered){resetLight(hovered);hovered=null;}});
    for(const media of[transparency,contrast])media.addEventListener('change',()=>refresh());
    return{refresh};
  }
})();
