/* Bundled offline UI. All photo text is inserted with textContent, never interpreted as HTML. */
(() => {
  "use strict";
  // Android 11 emulator/older system WebViews may predate replaceChildren.
  if (!Element.prototype.replaceChildren) Element.prototype.replaceChildren=function(...items) { while (this.firstChild) this.removeChild(this.firstChild); this.append(...items); };
  const $ = (id) => document.getElementById(id);
  const colors = [
    ["red","红","#E53E3E"],["orange","橙","#ED8936"],["yellow","黄","#ECC94B"],
    ["green","绿","#48BB78"],["cyan","青","#0BC5EA"],["blue","蓝","#4299E1"],
    ["purple","紫","#9F7AEA"],["pink","粉","#ED64A6"],["brown","棕","#A0522D"],
    ["gray","灰","#A0AEC0"],["black","黑","#1A202C"],["white","白","#F7FAFC"]
  ];
  const colorMap = new Map(colors.map(([id,name,hex]) => [id,{name,hex}]));
  const state = {photos:[],trash:[],bytes:0,page:"home",color:"",query:"",location:"",camera:"",sort:"newest",filtered:[],detail:null,sequence:[],busy:false,ready:false,motion:true,version:0,range:""};
  let channel,connect,requestNo=0,toastTimer,searchTimer,gridFrame,returnFocus,viewerEpoch=0,viewerAnimation,previewJob,previewRunning=false;
  const pageAnimations=new Map(),gridCards=new Map();
  const pending = new Map();
  const connected = new Promise((resolve) => { connect=resolve; });
  function node(tag,cls,text) { const value=document.createElement(tag); if (cls) value.className=cls; if (text !== undefined) value.textContent=String(text); return value; }
  function icon(name) { const svg=document.createElementNS("http://www.w3.org/2000/svg","svg"),use=document.createElementNS(svg.namespaceURI,"use"); use.setAttribute("href","#i-"+name); svg.append(use); svg.setAttribute("aria-hidden","true"); return svg; }
  function button(label,action,cls="button secondary") { const value=node("button",cls,label); value.type="button"; value.addEventListener("click",action); return value; }
  function image(url,alt,cls="") { const img=node("img",cls); img.alt=alt || ""; img.decoding="async"; img.src=url; img.addEventListener("load",() => img.classList.add("loaded"),{once:true}); return img; }
  function description(photo) { return photo.date+" · "+photo.location.name; }
  function transition(element,frames,options) {
    if (!state.motion || typeof element.animate !== "function") return null;
    try { return element.animate(frames,options); } catch { return null; } // Older WebViews must still be navigable.
  }
  function decodedImage(url) {
    return new Promise((resolve,reject) => {
      const img=new Image(); img.decoding="async";
      const timer=setTimeout(() => { img.src=""; reject(new Error("图片读取超时")); },15000);
      img.onload=async () => { clearTimeout(timer); if (img.decode) { try { await img.decode(); } catch { /* Old WebView: onload is sufficient. */ } } resolve(img); };
      img.onerror=() => { clearTimeout(timer); reject(new Error("图片读取失败")); }; img.src=url;
    });
  }
  function hex(value) { return /^#[a-f0-9]{6}$/i.test(value || "") ? value : "#9F7AEA"; }
  function safeMedia(value) { return typeof value === "string" && /^\/media\/(thumb|image|preview)\/[A-Za-z0-9_-]+\.jpg(?:\?t=\d+)?$/.test(value) ? value : ""; }
  function request(action,data={}) {
    const id="r"+(++requestNo);
    return new Promise((resolve,reject) => {
      const timer=setTimeout(() => { pending.delete(id); reject(new Error("操作等待超时，请保持应用打开并重试。已保存照片不会丢失。")); },30000);
      pending.set(id,{resolve,reject,timer});
      connected.then(() => { if (pending.has(id)) channel.postMessage(JSON.stringify({id,action,data})); }).catch(reject);
    });
  }
  function receive(input) {
    let message; try { message=JSON.parse(input); } catch { return; }
    if (message.id) {
      const operation=pending.get(message.id); if (!operation) return;
      clearTimeout(operation.timer); pending.delete(message.id);
      if (message.ok) operation.resolve(message.data); else operation.reject(new Error(message.error || "操作失败")); return;
    }
    const data=message.data || {};
    if (message.event === "changed") {
      snapshot(data);
      if (state.detail) { const photo=state.photos.find((p) => p.id===state.detail); if (photo) { const status=$("source-state").textContent,warning=$("source-state").classList.contains("warning"); fillDetail(photo); $("source-state").textContent=status; $("source-state").classList.toggle("warning",warning); } else closeViewer(false); }
    }
    if (message.event === "progress") {
      setBusy(!!data.busy); $("progress-banner").hidden=!data.busy;
      $("progress-message").textContent=data.message || "正在处理…";
      $("progress-fill").style.width=(data.total ? Math.min(100,data.done/data.total*100) : 10)+"%";
      if (!data.busy && data.message) toast(data.message);
    }
    if (message.event === "errors") showText("部分照片未导入",(data.message || "")+"\n\n成功项已保存。可重新选择失败照片，已导入照片不会重复入库。");
    if (message.event === "uiUpdate") renderUpdate(data);
  }
  window.addEventListener("message",(event) => {
    // Native postWebMessage targets our exact HTTPS origin; CSP disallows every iframe.
    if (event.data !== "hhs-album-connect" || !event.ports[0] || channel) return;
    channel=event.ports[0]; channel.onmessage=(msg) => receive(msg.data); channel.start(); connect();
  });
  function toast(message) { clearTimeout(toastTimer); $("toast").textContent=String(message); $("toast").hidden=false; toastTimer=setTimeout(() => { $("toast").hidden=true; },4500); }
  async function run(action,data={}) { try { return await request(action,data); } catch (error) { toast(error.message); return null; } }
  function haptic() { if (channel && !state.busy) run("haptic"); }
  function setBusy(value) { state.busy=value; document.querySelectorAll("[data-native-action]").forEach((item) => { item.disabled=value; }); }
  function snapshot(data) {
    state.photos=(data.photos || []).sort((a,b) => b.date.localeCompare(a.date)); state.trash=data.trash || []; state.bytes=data.bytes || 0; state.version++; state.range="";
    resolveCityNames();
    setBusy(!!data.busy); renderHome(); renderStudio(); updateFilterOptions(); filter();
    if (state.page === "analytics") renderAnalytics(); if (state.page === "map") renderLocations();
  }
  const pages=["home","gallery","map","analytics","studio"];
  function navigate(page) {
    if (!pages.includes(page) || page === state.page) return;
    if (state.detail) closeViewer(false);
    const previous=$("page-"+state.page); pageAnimations.get(previous)?.cancel(); previous.hidden=true; previous.classList.remove("active","entering");
    state.page=page; const next=$("page-"+page); pageAnimations.get(next)?.cancel(); next.hidden=false; next.classList.add("active");
    pageAnimations.set(next,transition(next,[{opacity:.92,transform:"translateY(8px)"},{opacity:1,transform:"none"}],{duration:240,easing:"ease-out"}));
    document.querySelectorAll(".bottom-nav button").forEach((item) => { item.classList.toggle("selected",item.dataset.page === page); item.setAttribute("aria-current",item.dataset.page === page ? "page" : "false"); });
    $("nav-indicator").style.transform="translateX("+(pages.indexOf(page)*100)+"%)";
    if (page === "gallery") { state.range=""; requestAnimationFrame(renderGrid); }
    if (page === "map") { renderLocations(); requestAnimationFrame(() => { mapResize(); loadWorld(); }); }
    if (page === "analytics") renderAnalytics();
    haptic();
  }
  function colorSelect(id) { state.color=id; filter(); if (state.page !== "gallery") navigate("gallery"); }
  function pick(files=false,relink="") { if (!state.busy) run("pick",{files,relink}); }
  function nativeButton(id,action,data={}) { $(id).dataset.nativeAction=action; $(id).addEventListener("click",() => { if (!state.busy) { haptic(); run(action,data); } }); }
  nativeButton("top-import","pick"); nativeButton("home-import","pick"); nativeButton("empty-import","pick"); nativeButton("studio-import","pick");
  nativeButton("studio-files","pick",{files:true}); nativeButton("studio-backup","backup"); nativeButton("studio-restore","restoreBackup"); nativeButton("studio-git","git"); nativeButton("studio-website","website");
  nativeButton("studio-check-update","checkUi"); nativeButton("studio-apply-update","applyUi"); nativeButton("studio-rollback-update","rollbackUi");
  function renderUpdate(data) {
    $("update-source").textContent=data.source==="hot" ? "已热更新" : "内置界面";
    $("update-release").textContent="当前界面 · "+(data.currentRelease || "随 APK 安装");
    $("update-message").textContent=data.message || "只更新界面，不上传照片。";
    $("update-notes").hidden=!data.pendingVersion;
    $("update-notes").textContent=data.pendingVersion ? "待应用 · "+data.pendingRelease+"\n"+(data.notes || "界面优化与修复") : "";
    $("studio-apply-update").hidden=!data.pendingVersion; $("studio-rollback-update").hidden=!data.canRollback;
  }
  $("brand-home").addEventListener("click",() => navigate("home")); $("home-gallery").addEventListener("click",() => navigate("gallery")); $("home-all-colors").addEventListener("click",() => colorSelect(""));
  document.querySelectorAll(".bottom-nav button").forEach((item) => item.addEventListener("click",() => navigate(item.dataset.page)));
  function renderHome() {
    const photo=state.photos[0],hero=$("hero"),heroImg=$("hero-image"); hero.classList.toggle("empty",!photo);
    if (photo) {
      if (heroImg.getAttribute("src") !== safeMedia(photo.image)) heroImg.src=safeMedia(photo.image); heroImg.alt=description(photo); $("hero-title").hidden=true; $("hero-meta").textContent=description(photo);
      $("hero-index").textContent="FRAME 01 / "+String(state.photos.length).padStart(2,"0"); hero.onclick=() => openPhoto(photo.id,heroImg,state.photos.map((p) => p.id));
    } else {
      heroImg.removeAttribute("src"); $("hero-title").hidden=false; $("hero-title").textContent="从你的相册开始"; $("hero-meta").textContent="原图留在相册，美好留在这里。"; $("hero-index").textContent="YOUR FIRST FRAME"; hero.onclick=() => pick();
    }
    const counts=countBy(state.photos,(p) => p.colorCategory),overview=$("home-colors"); overview.replaceChildren();
    const available=colors.filter(([id]) => counts[id]);
    (available.length ? available : colors.slice(0,6)).forEach(([id,name,c]) => {
      const chip=node("button","color-summary"),dot=node("span","dot"),label=node("span",null,name),number=node("small",null,counts[id] || "—"); dot.style.background=c; chip.append(dot,label,number); chip.addEventListener("click",() => colorSelect(id)); overview.append(chip);
    });
    const recent=$("recent-photos"); recent.replaceChildren();
    state.photos.slice(0,5).forEach((p) => { const tile=node("button","recent-card"),img=image(safeMedia(p.thumb),description(p)); tile.append(img,node("span",null,p.date)); tile.onclick=() => openPhoto(p.id,img,state.photos.map((photo) => photo.id)); recent.append(tile); });
    if (!state.photos.length) recent.append(node("div","recent-empty","没有预装的示例照片。你的光影，由你选择。"));
    $("home-total").textContent=state.photos.length+" 张作品";
  }
  function countBy(photos,read) { const counts=Object.create(null); photos.forEach((p) => { const key=read(p); if (key && key !== "未知") counts[key]=(counts[key] || 0)+1; }); return counts; }
  function renderStudio() {
    $("stored-count").textContent=state.photos.length; $("referenced-count").textContent=state.photos.filter((p) => p.referenced).length;
    $("storage-bytes").textContent=(state.bytes/1048576).toFixed(1)+" MB"; $("trash-count").textContent=state.trash.length+" 张 · 可恢复，不删除系统原片";
  }
  function updateFilterOptions() {
    const locations=[...new Set(state.photos.map((p) => p.location.name))].sort((a,b) => a.localeCompare(b,"zh-CN")),cameras=[...new Set(state.photos.map((p) => p.camera))].sort((a,b) => a.localeCompare(b,"zh-CN"));
    [["location-filter",locations,"全部地点","location"],["camera-filter",cameras,"全部设备","camera"]].forEach(([id,values,all,key]) => {
      const select=$(id); select.replaceChildren(node("option",null,all)); select.firstChild.value="";
      values.forEach((value) => { const option=node("option",null,value); option.value=value; select.append(option); });
      if (!values.includes(state[key])) state[key]=""; select.value=state[key];
    });
  }
  $("gallery-search").addEventListener("input",() => { clearTimeout(searchTimer); searchTimer=setTimeout(() => { state.query=$("gallery-search").value; filter(); },100); });
  $("clear-search").onclick=() => { clearTimeout(searchTimer); $("gallery-search").value=""; state.query=""; filter(); };
  $("location-filter").onchange=() => { state.location=$("location-filter").value; filter(); };
  $("camera-filter").onchange=() => { state.camera=$("camera-filter").value; filter(); };
  $("sort-filter").onchange=() => { state.sort=$("sort-filter").value; filter(); };
  $("reset-filters").onclick=() => { clearTimeout(searchTimer); state.color=""; state.query=""; state.location=""; state.camera=""; state.sort="newest"; $("gallery-search").value=""; $("location-filter").value=""; $("camera-filter").value=""; $("sort-filter").value="newest"; filter(); };
  function filter() {
    const query=state.query.trim().toLocaleLowerCase("zh-CN");
    state.filtered=state.photos.filter((p) => (!state.color || state.color === p.colorCategory) && (!state.location || state.location === p.location.name) && (!state.camera || state.camera === p.camera)
      && (!query || [p.date,p.camera,p.lens,p.location.name,...(p.tags || [])].join(" ").toLocaleLowerCase("zh-CN").includes(query)));
    state.filtered.sort((a,b) => state.sort === "oldest" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
    $("gallery-count").textContent=state.filtered.length+" / "+state.photos.length+" 张作品";
    $("reset-filters").hidden=!(state.color || state.query || state.location || state.camera || state.sort !== "newest");
    const container=$("color-filters"); container.replaceChildren();
    [["","全部",""],...colors].forEach(([id,name,c]) => {
      const chip=node("button","color-chip"+(!id ? " all" : "")+(state.color === id ? " selected" : "")),circle=node("span","color-circle");
      if (c) circle.style.background=c; chip.append(circle,node("span",null,name)); chip.setAttribute("aria-label",name+"色彩筛选"); chip.setAttribute("aria-pressed",state.color === id ? "true" : "false"); chip.onclick=() => { haptic(); colorSelect(id); }; container.append(chip);
    });
    state.version++; state.range=""; $("gallery-empty").hidden=state.filtered.length > 0;
    $("gallery-empty-copy").textContent=state.photos.length ? "没有匹配的照片。试试其他色彩，或重置筛选。" : "选择手机相册里的照片，开始你的私人光影集。";
    $("empty-import").hidden=state.photos.length > 0; if (state.page === "gallery") requestAnimationFrame(renderGrid);
  }
  function photoCard(p,index,rowHeight,animate) {
    const card=node("button","photo-card"); card.style.height=(rowHeight-13)+"px"; card.dataset.photo=p.id; card.setAttribute("aria-label","查看照片："+description(p));
    if (animate) card.style.animationDelay=(Math.min(index,7)*35)+"ms";
    const picture=node("div","photo-image"),img=image(safeMedia(p.thumb),description(p)),dot=node("span","photo-color-dot"); picture.style.height=(rowHeight-69)+"px"; dot.style.background=hex(p.dominantColor); picture.append(img,dot);
    const caption=node("div","photo-caption"),meta=node("div"),label=node("span","color-label",colorMap.get(p.colorCategory)?.name || "色彩"); label.style.color=colorMap.get(p.colorCategory)?.hex || "#9F7AEA"; meta.append(node("span",null,p.date),label); caption.append(node("strong",null,p.location.name),meta); card.append(picture,caption);
    card.onclick=() => openPhoto(p.id,img,state.filtered.map((photo) => photo.id)); return card;
  }
  function renderGrid() {
    gridFrame=0; if (state.page !== "gallery") return; const grid=$("gallery-grid"),page=$("page-gallery");
    const columns=window.innerWidth >= 600 ? 3 : 2,width=(grid.clientWidth-12*(columns-1))/columns,rowHeight=Math.ceil((width-2)*1.25+69);
    const top=Math.max(0,page.scrollTop-grid.offsetTop),totalRows=Math.ceil(state.filtered.length/columns),startRow=Math.min(Math.max(0,totalRows-1),Math.max(0,Math.floor(top/rowHeight)-2)),endRow=Math.min(totalRows,Math.max(startRow+1,Math.ceil((top+page.clientHeight)/rowHeight)+2));
    const range=state.version+":"+startRow+":"+endRow+":"+rowHeight; if (range === state.range) return;
    state.range=range; const wanted=[],ids=new Set();
    if (startRow>0) { const spacer=node("div","grid-spacer"); spacer.style.height=(startRow*rowHeight-13)+"px"; wanted.push(spacer); }
    for (let index=startRow*columns;index<Math.min(state.filtered.length,endRow*columns);index++) {
      const p=state.filtered[index],key=JSON.stringify([p.thumb,p.date,p.location,p.dominantColor,p.colorCategory,rowHeight]); ids.add(p.id);
      let entry=gridCards.get(p.id); if (!entry || entry.key !== key) { entry={key,card:photoCard(p,index,rowHeight,false)}; gridCards.set(p.id,entry); } wanted.push(entry.card);
    }
    if (endRow<totalRows) { const spacer=node("div","grid-spacer"); spacer.style.height=((totalRows-endRow)*rowHeight-13)+"px"; wanted.push(spacer); }
    // Keep overlapping image nodes attached and decoded; retain only the visible buffer.
    const keep=new Set(wanted); for (const child of [...grid.children]) if (!keep.has(child)) child.remove();
    let cursor=grid.firstChild; for (const child of wanted) { if (child === cursor) cursor=cursor.nextSibling; else grid.insertBefore(child,cursor); }
    for (const id of gridCards.keys()) if (!ids.has(id)) gridCards.delete(id);
  }
  $("page-gallery").addEventListener("scroll",() => { if (!gridFrame) gridFrame=requestAnimationFrame(renderGrid); },{passive:true});
  let gridWidth=0;
  new ResizeObserver(([entry]) => { if (entry.contentRect.width === gridWidth) return; gridWidth=entry.contentRect.width; state.range=""; if (state.page === "gallery") renderGrid(); }).observe($("gallery-grid"));

  function openPhoto(id,source,sequence) {
    const photo=state.photos.find((p) => p.id === id); if (!photo) return;
    const opening=!state.detail; if (opening) returnFocus=document.activeElement;
    state.detail=id; state.sequence=sequence || state.photos.map((p) => p.id); haptic();
    const viewer=$("viewer"),epoch=++viewerEpoch; viewerAnimation?.cancel(); viewer.hidden=false; viewer.classList.remove("opening");
    if (opening) viewerAnimation=transition(viewer,[{opacity:.92,transform:"translateY(12px)"},{opacity:1,transform:"none"}],{duration:240,easing:"ease-out"});
    $("pages").setAttribute("aria-hidden","true"); document.querySelector(".bottom-nav").setAttribute("aria-hidden","true");
    $("viewer-stage").style.touchAction="none"; resetZoom(); $("viewer-scroll").scrollTop=0; fillDetail(photo);
    const job={id,photo,epoch};
    // Hold the previous decoded frame until the new one is ready. Never clear src mid-swipe.
    document.querySelector(".viewer-loading").hidden=false; previewJob=job; pumpPreview();
    if (opening) $("viewer-back").focus({preventScroll:true});
  }
  function showFrame(img,photo,epoch) {
    if (epoch !== viewerEpoch || state.detail !== photo.id) return;
    img.id="viewer-image"; img.alt=description(photo); img.dataset.photo=photo.id; $("viewer-image").replaceWith(img);
    transition(img,[{opacity:.94,transform:"translateX(5px)"},{opacity:1,transform:"none"}],{duration:180,easing:"ease-out"});
  }
  async function pumpPreview() {
    if (previewRunning) return; previewRunning=true;
    try {
      while (previewJob) {
        const job=previewJob; previewJob=null;
        try {
          // Coalesce rapid swipes: at most one cache/original decode job, not one per tap.
          try { const cached=await decodedImage(safeMedia(job.photo.image)); if (job.epoch === viewerEpoch) showFrame(cached,job.photo,job.epoch); } catch { /* Native original may still be available. */ }
          if (job.epoch !== viewerEpoch) continue;
          const preview=await request("preview",{id:job.id});
          if (job.epoch !== viewerEpoch) continue;
          const next=safeMedia(preview.url); if (!next) throw new Error("原图预览地址无效");
          // Native keeps one preview buffer: finish loading it before requesting the next.
          const img=await decodedImage(next); if (job.epoch !== viewerEpoch) continue;
          showFrame(img,job.photo,job.epoch); $("source-state").classList.toggle("warning",!preview.available);
          $("source-state").textContent=preview.available ? job.photo.referenced ? "正在显示系统原图。原片仍在手机相册，应用仅保留展示缓存和图片信息。" : "正在显示旧版 / 备份恢复的应用原片副本。升级没有自动删除它。" : preview.warning;
        } catch (error) { if (job.epoch === viewerEpoch) { $("source-state").textContent=error.message+" 当前显示已保存的展示缓存。"; $("source-state").classList.add("warning"); } }
        finally { if (job.epoch === viewerEpoch) document.querySelector(".viewer-loading").hidden=true; }
      }
    } finally { previewRunning=false; if (!state.detail) run("closePreview"); }
  }
  function fillDetail(photo) {
    const index=state.sequence.indexOf(photo.id); $("viewer-position").textContent=String(index+1).padStart(2,"0")+" / "+String(state.sequence.length).padStart(2,"0");
    $("viewer-title").textContent=""; $("viewer-title").hidden=true; $("viewer-date").textContent=photo.date.replace(/-/g," . "); $("viewer-location").textContent=photo.location.name;
    const diagnostics={"source-unavailable":"原图失联或授权失效，请重新关联原片后读取位置。","permission-required":"尚未授权读取照片位置，可重新授权或从文件选择器选原片。","picker-redacted":"相册选择器未提供 GPS，请从管理 → 文件选择器选择原片。","not-provided":"该文件未提供可读 GPS，可能未记录或转发时被移除；无法恢复缺失信息。"};
    $("location-state").textContent=hasCoordinates(photo.location) ? (photo.locationOrigin==="manual" ? "手动补录的地点" : photo.locationOrigin==="exif" ? "原片 EXIF 拍摄坐标" : "已保存的拍摄地点")+" · 约 1 公里精度；城市为离线近似行政区识别，边界附近可能有误差。" : diagnostics[photo.gpsStatus] || "未获得照片 GPS：可能未记录，或选择器隐藏了位置。可授权重新读取，也可从文件选择器选原片；不会使用手机当前位置冒充拍摄地点。";
    const palette=$("viewer-palette"); palette.replaceChildren(); (photo.palette || []).forEach((c) => { const swatch=node("div","detail-swatch"); swatch.style.background=hex(c); swatch.setAttribute("aria-label","色彩 "+hex(c)); palette.append(swatch); });
    const metadata=$("viewer-metadata"); metadata.replaceChildren(); [["拍摄设备",photo.camera],["镜头",photo.lens || "未知"],["感光度",photo.iso ? "ISO "+photo.iso : "未知"],["光圈",photo.aperture || "未知"],["快门",photo.shutter || "未知"],["展示尺寸",photo.width+" × "+photo.height],["拍摄纬度 · 约 1 公里",hasCoordinates(photo.location) ? photo.location.lat.toFixed(2)+"°" : "未提供"],["拍摄经度 · 约 1 公里",hasCoordinates(photo.location) ? photo.location.lng.toFixed(2)+"°" : "未提供"]].forEach(([label,value]) => { const cell=node("div","metadata-cell"); cell.append(node("small",null,label),node("strong",null,value)); metadata.append(cell); });
    const tags=$("viewer-tags"); tags.replaceChildren(); (photo.tags || []).forEach((tag) => tags.append(node("span",null,tag)));
    $("viewer-prev").hidden=index<=0; $("viewer-next").hidden=index<0 || index>=state.sequence.length-1;
    $("viewer-relink").hidden=!photo.referenced; $("viewer-map").hidden=!(photo.location.lat || photo.location.lng);
    $("source-state").classList.remove("warning"); $("source-state").textContent="正在读取原图…";
  }
  function closeViewer(animate=true) {
    if (!state.detail) return; const epoch=++viewerEpoch,viewer=$("viewer"); viewerAnimation?.cancel(); previewJob=null;
    state.detail=null; $("pages").removeAttribute("aria-hidden"); document.querySelector(".bottom-nav").removeAttribute("aria-hidden");
    const finish=() => { if (epoch === viewerEpoch && !state.detail) { viewer.hidden=true; $("viewer-image").removeAttribute("src"); if (!previewRunning) run("closePreview"); } };
    viewerAnimation=animate ? transition(viewer,[{opacity:1,transform:"none"},{opacity:0,transform:"translateY(12px)"}],{duration:180,easing:"ease-out"}) : null;
    if (viewerAnimation) viewerAnimation.onfinish=finish; else finish();
    if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true}); resetZoom();
  }
  function adjacent(direction) { const index=state.sequence.indexOf(state.detail)+direction,id=state.sequence[index]; if (!id) return; const sequence=state.sequence; openPhoto(id,null,sequence); }
  $("viewer-back").onclick=() => closeViewer(); $("viewer-prev").onclick=() => adjacent(-1); $("viewer-next").onclick=() => adjacent(1);
  $("viewer-share").onclick=() => { if (state.detail) confirmSheet("分享展示图","将分享去除 EXIF 的展示图片，而非含 GPS 的原片。选择分享对象后，图片会交给对方应用；不会自动发布到网站。","选择分享对象",() => run("share",{id:state.detail})); };
  $("viewer-map").onclick=() => { if (state.detail) confirmSheet("打开系统地图","这会把该照片约 1 公里精度的坐标交给你手机的地图应用。不会发送照片。","继续",() => run("map",{id:state.detail})); };
  $("viewer-relink").onclick=() => { if (state.detail) pick(false,state.detail); };
  $("viewer-gps").onclick=() => { const id=state.detail; if (id) confirmSheet("重新读取拍摄位置","仅读取原片 EXIF 中的拍摄坐标，可能需要照片位置信息授权；不会获取你的实时位置或联网查询地址。成功时替换本片地点，失败则保留已有编辑。","读取原片位置",() => run("location",{id})); };
  $("viewer-trash").onclick=() => { const id=state.detail; if (id) confirmSheet("移入回收站？","仅移入应用回收站，可以恢复；不会删除或修改手机系统相册中的原片。","移入回收站",async () => { const data=await run("trash",{id}); if (data) { closeViewer(false); snapshot(data); toast("已移入回收站，系统原片未改动。"); } },true); };
  const pointers=new Map(); let zoom=1,panX=0,panY=0,startZoom=1,startDistance=0,gestureStart=null,lastTap=0;
  function resetZoom() { zoom=1;panX=0;panY=0;pointers.clear(); $("viewer-image").style.transform=""; }
  function zoomTransform() { $("viewer-image").style.transform="translate("+panX+"px,"+panY+"px) scale("+zoom+")"; }
  const viewerStage=$("viewer-stage");
  viewerStage.addEventListener("pointerdown",(event) => { if (event.target.closest("button")) return; viewerStage.setPointerCapture(event.pointerId); pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if (pointers.size===1) gestureStart={x:event.clientX,y:event.clientY,panX,panY,scroll:document.querySelector(".viewer-scroll").scrollTop};
    if (pointers.size===2) { const [a,b]=[...pointers.values()]; startDistance=Math.hypot(a.x-b.x,a.y-b.y); startZoom=zoom; gestureStart=null; } });
  viewerStage.addEventListener("pointermove",(event) => {
    if (!pointers.has(event.pointerId)) return; pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if (pointers.size===2) { const [a,b]=[...pointers.values()]; zoom=Math.max(1,Math.min(4,startZoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,startDistance))); if (zoom===1) panX=panY=0; zoomTransform(); }
    else if (gestureStart) { if (zoom>1) { panX=Math.max(-viewerStage.clientWidth*(zoom-1)/2,Math.min(viewerStage.clientWidth*(zoom-1)/2,gestureStart.panX+event.clientX-gestureStart.x)); panY=Math.max(-viewerStage.clientHeight*(zoom-1)/2,Math.min(viewerStage.clientHeight*(zoom-1)/2,gestureStart.panY+event.clientY-gestureStart.y)); zoomTransform(); }
      else if (Math.abs(event.clientY-gestureStart.y)>Math.abs(event.clientX-gestureStart.x)) document.querySelector(".viewer-scroll").scrollTop=gestureStart.scroll+gestureStart.y-event.clientY; }
  });
  function endPointer(event) { if (!pointers.has(event.pointerId)) return; const single=pointers.size===1; pointers.delete(event.pointerId);
    if (single && gestureStart && zoom===1) { const dx=event.clientX-gestureStart.x,dy=event.clientY-gestureStart.y; if (Math.abs(dx)>65 && Math.abs(dy)<45) adjacent(dx<0 ? 1 : -1); }
    if (!pointers.size) gestureStart=null;
  }
  viewerStage.addEventListener("pointerup",endPointer); viewerStage.addEventListener("pointercancel",() => { pointers.clear();gestureStart=null; });
  viewerStage.addEventListener("click",(event) => { if (event.target.closest("button")) return; const now=Date.now(); if (now-lastTap<280) { zoom=zoom>1 ? 1 : 2; panX=panY=0; zoomTransform(); lastTap=0; } else lastTap=now; });

  let sheetReturn,escapeSheet=null;
  function openSheet(title,content,eyebrow="PRIVATE COLLECTION") {
    sheetReturn=document.activeElement; $("sheet-title").textContent=title; $("sheet-eyebrow").textContent=eyebrow; $("sheet-content").replaceChildren(content); $("sheet-overlay").hidden=false;
    $("sheet").scrollTop=0; $("sheet-close").focus({preventScroll:true});
  }
  function closeSheet() { $("sheet-overlay").hidden=true; escapeSheet=null; $("sheet-content").replaceChildren(); if (sheetReturn?.isConnected) sheetReturn.focus({preventScroll:true}); }
  $("sheet-close").onclick=closeSheet; $("sheet-overlay").addEventListener("click",(event) => { if (event.target===$("sheet-overlay")) closeSheet(); });
  function showText(title,message) { const content=node("div"); content.append(node("p","sheet-copy",message),button("知道了",closeSheet,"button primary")); openSheet(title,content); }
  function confirmSheet(title,message,label,action,danger=false) {
    const content=node("div"),actions=node("div","sheet-buttons"); content.append(node("p","sheet-copy",message));
    actions.append(button("取消",closeSheet),button(label,() => { closeSheet(); action(); },danger ? "button danger" : "button primary")); content.append(actions); openSheet(title,content);
  }
  $("viewer-edit").onclick=() => {
    const photo=state.photos.find((p) => p.id===state.detail); if (!photo) return; const form=node("form"),inputs={};
    [["date","拍摄日期 YYYY-MM-DD",photo.date],["location","地点名称",photo.location.name],["camera","拍摄设备",photo.camera],["tags","标签（逗号分隔，最多 20 个）",(photo.tags || []).join(", ")]].forEach(([key,label,value]) => {
      const field=node("label","edit-field"),input=node("input"); input.value=value; input.name=key; input.maxLength=key==="tags" ? 900 : key==="date" ? 10 : 200; input.required=key==="title" || key==="date"; if (key==="date") input.inputMode="numeric";
      field.append(node("span",null,label),input); form.append(field); inputs[key]=input;
    });
    const coord=node("div","edit-coordinate-fields"); [["lat","纬度（−90 至 90）",photo.location.lat],["lng","经度（−180 至 180）",photo.location.lng]].forEach(([key,label,value]) => {
      const field=node("label","edit-field"),input=node("input"); input.value=String(value); input.inputMode="decimal"; input.maxLength=12; field.append(node("span",null,label),input); coord.append(field); inputs[key]=input;
    }); form.append(coord,node("p","sheet-copy","坐标保存时取约 1 公里精度；不修改系统原片中的 EXIF。"));
    const error=node("p","field-error"),save=button("保存到手机",() => {},"button primary"),actions=node("div","sheet-buttons"); save.type="submit"; actions.append(button("取消",closeSheet),save); form.append(error,actions);
    form.addEventListener("submit",async (event) => {
      event.preventDefault(); const edit=JSON.parse(JSON.stringify(photo)),lat=Number(inputs.lat.value),lng=Number(inputs.lng.value);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) { error.textContent="请输入有效的经纬度。"; return; }
      edit.date=inputs.date.value; edit.camera=inputs.camera.value; edit.tags=inputs.tags.value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean); edit.location={name:inputs.location.value,lat,lng};
      save.disabled=true; try { const data=await request("edit",{id:photo.id,photo:edit}); closeSheet(); snapshot(data); const current=state.photos.find((p) => p.id===photo.id); if (current && state.detail) { const status=$("source-state").textContent,warning=$("source-state").classList.contains("warning"); fillDetail(current); $("source-state").textContent=status; $("source-state").classList.toggle("warning",warning); } toast("已保存到手机，原片未改动。"); }
      catch (failure) { error.textContent=failure.message; } finally { save.disabled=false; }
    }); openSheet("编辑这一帧",form,"EDIT YOUR FRAME");
  };
  function showTrash() {
    const content=node("div"); content.append(node("p","sheet-copy","应用回收站只管理记录和缓存。恢复不会覆盖编辑；永久删除不会删除系统相册原片。"));
    if (!state.trash.length) content.append(node("p","chart-empty","回收站是空的。"));
    state.trash.slice(0,100).forEach((photo) => {
      const row=node("div","trash-photo"),text=node("div"),actions=node("div","trash-actions"); text.append(node("strong",null,photo.location.name),node("small",null,photo.date));
      actions.append(button("恢复",async () => { const data=await run("restore",{id:photo.id}); if (data) { snapshot(data); closeSheet(); showTrash(); toast("照片已恢复。"); } },""),button("删除",() => confirmSheet("永久删除应用记录？","这会移除应用内的记录、缓存 / 旧版副本并释放引用授权。不能撤销，但不会删除系统原片。","确认永久删除",async () => { const data=await run("erase",{id:photo.id}); if (data) { snapshot(data); showTrash(); toast("应用记录已删除，系统原片未改动。"); } },true),""));
      row.append(image(safeMedia(photo.thumb),description(photo)),text,actions); content.append(row);
    }); if (state.trash.length>100) content.append(node("p","sheet-copy","先显示 100 张，处理后可以查看下一批。")); openSheet("回收站 · "+state.trash.length+" 张",content,"A SECOND CHANCE");
  }
  $("studio-trash").onclick=showTrash;
  $("studio-help").onclick=() => showText("关于你的私人相册","新导入只保存系统原图的长期读取引用、图片信息、2560px 展示缓存和 400px 缩略图，不保存原片副本。应用内独立存储与电脑、公开网站无自动同步。\n\n每批最多 100 张，单张 25MB / 6400 万像素，逐张导入。HEIC / AVIF 取决于系统解码。缺失的 EXIF 无法恢复，可手动补录。系统或相册提供者可能隐藏 GPS，不会绕过。\n\n请保留原片。删除 / 移动原图、撤销授权或系统清理授权后可能失联；详情会标记仅显示缓存，重新选择相同内容的原文件可修复。云端照片取决于提供者，不保证断网可读原图。\n\n旧版独立副本和编辑继续保留。完整备份会把可读取的原片复制进 ZIP，含回收站；ZIP 未加密，原片可能含精确 GPS。失联或原图变更时会拒绝不完整备份，不能用缓存冒充原片。恢复会创建应用私有副本，不重建系统引用。\n\n卸载 / 清除数据会删除引用、编辑、缓存和旧副本，不会删除系统原片。覆盖升级前建议备份，不要先卸载。\n\nGit 发布包只含展示图和网站元数据，不是完整备份，也不会自动公开。分享只发送去 EXIF 的展示图，系统地图只在你确认后接收坐标。\n\n界面与地图资源随 APK 安装。仅在你点击检查更新并确认后，原生更新器连接固定 HTTPS 网站下载签名界面包；不上传照片、坐标或原图引用。更新后仍可离线使用，启动异常自动回退，也可在管理页手动回退。不申请整个相册权限。动效跟随系统动画设置；进入后台暂停。");

  function renderAnalytics() {
    const photos=state.photos,locationCounts=countBy(photos,(p) => p.location.name),cameraCounts=countBy(photos,(p) => p.camera),colorCounts=countBy(photos,(p) => p.colorCategory),summary=$("analytics-summary"); summary.replaceChildren();
    [[photos.length,"总照片数","#a9bbdc"],[Object.keys(locationCounts).length,"拍摄地点","#a3c8b3"],[Object.keys(cameraCounts).length,"使用设备","#b9a3db"],[Object.keys(colorCounts).length,"色彩种类","#d8a4be"]].forEach(([value,label,c]) => { const card=node("div","stat-card"),number=node("strong",null,value); number.style.color=c; card.append(number,node("span",null,label)); summary.append(card); });
    const charts=$("analytics-charts"); charts.replaceChildren();
    const months=Object.entries(countBy(photos,(p) => p.date.slice(0,7))).sort(([a],[b]) => a.localeCompare(b)).slice(-12);
    charts.append(verticalChart("每月光影","最近 12 个有作品的月份",months.map(([label,value]) => [label.slice(2).replace("-","/"),value])));
    const seasons=[0,0,0,0]; photos.forEach((p) => { const month=Number(p.date.slice(5,7)); if (month>=1 && month<=12) seasons[month>=3 && month<=5 ? 0 : month>=6 && month<=8 ? 1 : month>=9 && month<=11 ? 2 : 3]++; });
    charts.append(verticalChart("四季的色彩","不同季节留下的作品",["春","夏","秋","冬"].map((season,index) => [season,seasons[index]])));
    const colorCard=chartCard("色彩偏好","你的镜头，偏爱怎样的光？"),ringSection=node("div","color-ring-section"),ring=node("div","color-ring"),legend=node("div","color-legend");
    let angle=0; const segments=[]; colors.filter(([id]) => colorCounts[id]).forEach(([id,,c]) => { const next=angle+colorCounts[id]/Math.max(1,photos.length)*360; segments.push(c+" "+angle+"deg "+next+"deg"); angle=next; });
    ring.style.background=segments.length ? "conic-gradient("+segments.join(",")+")" : "#ffffff08"; const center=node("strong",null,Object.keys(colorCounts).length); center.append(node("small",null,"种色彩")); ring.append(center);
    colors.filter(([id]) => colorCounts[id]).slice(0,6).forEach(([id,name,c]) => { const row=node("div","legend-row"),dot=node("span","dot"); dot.style.background=c; row.append(dot,node("span",null,name),node("strong",null,Math.round(colorCounts[id]/Math.max(1,photos.length)*100)+"%")); legend.append(row); });
    if (!segments.length) legend.append(node("span","chart-empty","导入照片后，色彩会在这里绽放。")); ringSection.append(ring,legend); colorCard.append(ringSection); charts.append(colorCard);
    charts.append(horizontalChart("拍摄地点","留下最多作品的地方",locationCounts,"#a9c7b5"),horizontalChart("拍摄设备","与你一起记录的镜头",cameraCounts,"#b8a3d3"));
  }
  function chartCard(title,subtitle) { const card=node("div","chart-card"); card.append(node("h2",null,title),node("p",null,subtitle)); return card; }
  function verticalChart(title,subtitle,values) {
    const card=chartCard(title,subtitle); if (!values.length || !values.some(([,value]) => value)) { card.append(node("div","chart-empty","导入作品后即可看到真实统计。")); return card; }
    const chart=node("div","bar-chart"),max=Math.max(1,...values.map(([,v]) => v)); values.forEach(([label,value],index) => { const column=node("div","bar-column"),bar=node("div","bar"); bar.style.height=Math.max(2,value/max*84)+"px"; bar.style.animationDelay=index*30+"ms"; column.append(node("span","bar-value",value),bar,node("span","bar-label",label)); chart.append(column); }); card.append(chart); return card;
  }
  function horizontalChart(title,subtitle,counts,c) {
    const card=chartCard(title,subtitle),values=Object.entries(counts).sort(([,a],[,b]) => b-a).slice(0,8),max=Math.max(1,...values.map(([,v]) => v));
    if (!values.length) card.append(node("div","chart-empty","没有可用的拍摄信息，可在详情里补录。"));
    values.forEach(([label,value]) => { const row=node("div","horizontal-bar"),description=node("div","bar-description"),track=node("div","horizontal-track"),bar=node("div"); bar.style.width=value/max*100+"%"; bar.style.background=c; description.append(node("span",null,label),node("span",null,value+" 张")); track.append(bar); row.append(description,track); card.append(row); }); return card;
  }

  let world=null,worldPromise=null,mapScale=4.5,mapLon=105,mapLat=29,mapWidth=0,mapHeight=0,mapHits=[],mapFrame=0,mapMoved=false;
  const mapPointers=new Map(); let mapStart=null,mapDistance=0,mapStartScale=1;
  // Offline city lookup: the same bounded polygons are used by the native reader.
  function hasCoordinates(loc) { return !!loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng) && Math.abs(loc.lat)<=90 && Math.abs(loc.lng)<=180 && (loc.lat!==0 || loc.lng!==0); }
  function insideRing(ring,x,y) { let inside=false; for(let i=0,j=ring.length-1;i<ring.length;j=i++) { const [ax,ay]=ring[i],[bx,by]=ring[j]; if((ay>y)!=(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax) inside=!inside; } return inside; }
  function insidePolygon(rings,x,y) { return rings.length>0 && insideRing(rings[0],x,y) && !rings.slice(1).some(ring=>insideRing(ring,x,y)); }
  function cityName(lat,lng) {
    if(!hasCoordinates({lat,lng}) || !world?.china) return null;
    for(const city of world.china.cities) {
      const [west,south,east,north]=city.bbox;
      if(lng<west || lng>east || lat<south || lat>north) continue;
      const {type,coordinates}=city.geometry;
      if(type==="Polygon" ? insidePolygon(coordinates,lng,lat) : coordinates.some(polygon=>insidePolygon(polygon,lng,lat))) return city.properties.name;
    } return null;
  }
  // End offline city lookup.
  function resolveCityNames() { if(!world?.china) return; [...state.photos,...state.trash].forEach(photo=>{const loc=photo.location;if(photo.locationOrigin!=="manual" && hasCoordinates(loc) && (!loc.name || loc.name==="未知" || loc.name.startsWith("拍摄地点 ("))) {const city=cityName(loc.lat,loc.lng);if(city) photo.location={...loc,name:city};}}); }
  async function loadWorld() { if (world) { drawMap(); return; } if (!worldPromise) worldPromise=fetch("world-land.geojson").then((response) => { if (!response.ok) throw new Error("地图资源不可用"); return response.json(); }).then((data) => { world=data;resolveCityNames();state.version++;renderHome();updateFilterOptions();filter();renderLocations();if(state.page==="analytics")renderAnalytics();if(state.detail){const photo=state.photos.find(p=>p.id===state.detail);if(photo){const status=$("source-state").textContent;fillDetail(photo);$("source-state").textContent=status;}}drawMap(); }).catch(() => {worldPromise=null;toast("离线底图未能加载，仍可浏览地点列表。");}); return worldPromise; }
  function resetChina() { mapLon=105;mapLat=29;mapScale=Math.max(1,Math.min((mapWidth-40)/66,(mapHeight-62)*.82/54)*360/Math.max(1,mapWidth));mapMoved=false;scheduleMap(); }
  function focusLocation(photo) { if(!hasCoordinates(photo.location)) return;mapLon=photo.location.lng;mapLat=photo.location.lat;mapScale=28;mapMoved=true;scheduleMap();$("map-canvas").scrollIntoView({behavior:state.motion?"smooth":"auto",block:"center"}); }
  function mapResize() { const canvas=$("map-canvas"),size=canvas.getBoundingClientRect(),ratio=Math.min(2,window.devicePixelRatio || 1); if (!size.width || !size.height) return; mapWidth=size.width; mapHeight=size.height; canvas.width=Math.round(size.width*ratio); canvas.height=Math.round(size.height*ratio); canvas.getContext("2d").setTransform(ratio,0,0,ratio,0,0);if(!mapMoved)resetChina();drawMap(); }
  function project(lon,lat) { let delta=lon-mapLon; while (delta>180) delta-=360; while (delta<-180) delta+=360; const unit=mapWidth/360*mapScale; return {x:mapWidth/2+delta*unit,y:mapHeight/2+(mapLat-lat)*unit/.82}; }
  function scheduleMap() { if (!mapFrame) mapFrame=requestAnimationFrame(() => { mapFrame=0;drawMap(); }); }
  function drawMap() {
    if (state.page !== "map" || !mapWidth) return; const ctx=$("map-canvas").getContext("2d"); ctx.clearRect(0,0,mapWidth,mapHeight); ctx.strokeStyle="#bfb3d20b"; ctx.lineWidth=.6;
    for (let lon=-180;lon<=180;lon+=30) { const p=project(lon,0); ctx.beginPath();ctx.moveTo(p.x,0);ctx.lineTo(p.x,mapHeight);ctx.stroke(); }
    for (let lat=-90;lat<=90;lat+=30) { const p=project(0,lat);ctx.beginPath();ctx.moveTo(0,p.y);ctx.lineTo(mapWidth,p.y);ctx.stroke(); }
    if (world) {
      ctx.fillStyle="#5b607e38";ctx.strokeStyle="#999abb22";ctx.lineWidth=.65;
      function land(features,fill,stroke) {ctx.fillStyle=fill;ctx.strokeStyle=stroke; features.forEach((feature) => { const polygons=feature.geometry.type==="Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates; polygons.forEach((polygon) => {
        ctx.beginPath(); polygon.forEach((ring) => { let previous=null; ring.forEach(([lon,lat],index) => { const p=project(lon,lat); if (!index || (previous && Math.abs(p.x-previous.x)>mapWidth*mapScale/2)) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); previous=p; }); ctx.closePath(); }); ctx.fill("evenodd");ctx.stroke();
      }); }); }
      land(world.features,"#5b607e18","#999abb16");
      if(world.china) { land(world.china.provinces,"#6f648540","#c5afd050");if(mapScale>12)land(world.china.cities,"#00000000","#b5a4ce24"); }
    }
    const groups=new Map(); state.photos.forEach((photo) => { const {lat,lng}=photo.location; if (!hasCoordinates(photo.location)) return; const p=project(lng,lat); if (p.x<-20 || p.x>mapWidth+20 || p.y<-20 || p.y>mapHeight+20) return;
      const key=Math.round(p.x/24)+":"+Math.round(p.y/24); if (!groups.has(key)) groups.set(key,{x:p.x,y:p.y,photos:[]}); groups.get(key).photos.push(photo);
    }); mapHits=[...groups.values()];const labels=[]; mapHits.forEach((point) => { const gradient=ctx.createRadialGradient(point.x,point.y,0,point.x,point.y,19); gradient.addColorStop(0,"#c9aef966");gradient.addColorStop(1,"#c9aef900");ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(point.x,point.y,19,0,Math.PI*2);ctx.fill();ctx.fillStyle="#ceb6f3";ctx.strokeStyle="#f6eaff88";ctx.lineWidth=1;ctx.beginPath();ctx.arc(point.x,point.y,point.photos.length>1 ? 6 : 3.5,0,Math.PI*2);ctx.fill();ctx.stroke();
      const names=[...new Set(point.photos.map(p=>p.location.name))].filter(name=>!name.startsWith("拍摄地点 (")),name=names.slice(0,2).join(" / ")+(names.length>2?"等":"");if(name&&!labels.some(p=>Math.abs(p.x-point.x)<55&&Math.abs(p.y-point.y)<26)){ctx.font="11px sans-serif";ctx.textAlign="center";const y=point.y-14,width=ctx.measureText(name).width+10;ctx.fillStyle="#15111dcc";ctx.fillRect(point.x-width/2,y-11,width,17);ctx.fillStyle="#e1d3f3";ctx.fillText(name,point.x,y+1);labels.push(point);}
      if (point.photos.length>1) {ctx.font="8px sans-serif";ctx.textAlign="center";ctx.fillStyle="#191021";ctx.fillText(point.photos.length,point.x,point.y+3);} });
    if (!mapHits.length) {ctx.font="10px sans-serif";ctx.textAlign="center";ctx.fillStyle="#a395b066";ctx.fillText("有坐标的照片会成为这里的光点",mapWidth/2,mapHeight-35);}
  }
  function renderLocations() {
    const groups=new Map(); state.photos.forEach((photo) => { const name=photo.location.name; if (!groups.has(name)) groups.set(name,[]);groups.get(name).push(photo); });
    const list=$("location-photos"); list.replaceChildren(); [...groups.entries()].slice(0,20).forEach(([name,photos]) => {
      const card=node("div","location-card"),heading=node("div","location-heading"),title=node("h2",null,name),strip=node("div","location-strip"); title.prepend(icon("pin"));heading.append(title); const located=photos.find(p=>hasCoordinates(p.location));if(located)heading.append(button("定位 · "+photos.length+" 张",()=>focusLocation(located),"location-focus"));else heading.append(node("small",null,"未提供 GPS · "+photos.length+" 张"));
      photos.slice(0,6).forEach((photo) => { const tile=node("button"),img=image(safeMedia(photo.thumb),description(photo)); tile.append(img); tile.setAttribute("aria-label","查看 "+description(photo)); tile.onclick=() => openPhoto(photo.id,img,photos.map((p) => p.id)); strip.append(tile); }); card.append(heading,strip); list.append(card);
    });
    if (!groups.size) list.append(node("div","recent-empty","还没有拍摄足迹。有 GPS 的照片会自动显示，缺失信息可以在详情里补录。"));
    if (groups.size>20) list.append(node("p","map-note","先显示前 20 个地点，其余作品可在画廊按地点筛选。")); scheduleMap();
  }
  const mapCanvas=$("map-canvas"); new ResizeObserver(mapResize).observe(mapCanvas);
  mapCanvas.addEventListener("pointerdown",(event) => { mapCanvas.setPointerCapture(event.pointerId);mapPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});mapStart={x:event.clientX,y:event.clientY,lon:mapLon,lat:mapLat};
    if (mapPointers.size===2) {const [a,b]=[...mapPointers.values()];mapDistance=Math.hypot(a.x-b.x,a.y-b.y);mapStartScale=mapScale;} });
  mapCanvas.addEventListener("pointermove",(event) => { if (!mapPointers.has(event.pointerId)) return;mapPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    mapMoved=true;
    if (mapPointers.size===2) {const [a,b]=[...mapPointers.values()];mapScale=Math.max(1,Math.min(60,mapStartScale*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,mapDistance)));}
    else if (mapStart) {const unit=mapWidth/360*mapScale;mapLon=mapStart.lon-(event.clientX-mapStart.x)/unit;mapLat=Math.max(-85,Math.min(85,mapStart.lat+(event.clientY-mapStart.y)*.82/unit));} scheduleMap(); });
  mapCanvas.addEventListener("pointerup",(event) => { if (mapPointers.size===1 && mapStart && Math.hypot(event.clientX-mapStart.x,event.clientY-mapStart.y)<8) {
    const rect=mapCanvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top,hit=mapHits.find((p) => Math.hypot(p.x-x,p.y-y)<18);
    if (hit) { if (hit.photos.length===1) openPhoto(hit.photos[0].id,null,state.photos.map((p) => p.id)); else {
      const content=node("div"),strip=node("div","location-strip");content.append(node("p","sheet-copy",hit.photos.length+" 张照片拍摄于这个光点附近。"));hit.photos.slice(0,30).forEach((photo) => {const tile=node("button"),img=image(safeMedia(photo.thumb),description(photo));tile.append(img);tile.setAttribute("aria-label",description(photo));tile.onclick=() => {closeSheet();openPhoto(photo.id,null,hit.photos.map((p) => p.id));};strip.append(tile);});content.append(strip);openSheet("这一片光影",content,"LIGHT ON THE MAP");
    }} }mapPointers.delete(event.pointerId); if (!mapPointers.size) mapStart=null;else if(mapPointers.size===1){const pointer=[...mapPointers.values()][0];mapStart={x:pointer.x,y:pointer.y,lon:mapLon,lat:mapLat};} });
  mapCanvas.addEventListener("pointercancel",() => {mapPointers.clear();mapStart=null;});
  $("map-zoom-in").onclick=() => {mapMoved=true;mapScale=Math.min(60,mapScale*1.4);scheduleMap();};$("map-zoom-out").onclick=() => {mapMoved=true;mapScale=Math.max(1,mapScale/1.4);scheduleMap();};$("map-reset").onclick=resetChina;
  document.addEventListener("keydown",(event) => {
    if (event.key==="Escape") {event.preventDefault();back();}
    if (state.detail && $("sheet-overlay").hidden) {if(event.key==="ArrowLeft")adjacent(-1);if(event.key==="ArrowRight")adjacent(1);}
    if (event.key==="Tab") {const scope=!$("sheet-overlay").hidden ? $("sheet") : state.detail ? $("viewer") : null;if(!scope)return;const candidates=[...scope.querySelectorAll("button:not(:disabled),input,textarea,select")].filter((item) => item.getClientRects().length);const first=candidates[0],last=candidates[candidates.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  });
  function back() { if (state.busy) {toast("正在处理照片，请等待完成；已完成项已保存。");return;} if(!$("sheet-overlay").hidden){if(escapeSheet)escapeSheet();else closeSheet();}else if(state.detail)closeViewer();else if(state.page!=="home")navigate("home");else run("exit"); }
  window.Album={
    request,receive,navigate,openPhoto,closeViewer,back,
    backProgress(value){const target=!$("sheet-overlay").hidden ? $("sheet") : state.detail ? $("viewer") : $("page-"+state.page);target.style.transform=value<0 ? "" : "translateX("+(value*18)+"px) scale("+(1-value*.025)+")";target.style.opacity=value<0 ? "" : String(1-value*.14);},
    insets(top,bottom,left,right,keyboard){const css=document.documentElement.style;[["top",top],["bottom",bottom],["left",left],["right",right]].forEach(([name,value]) => css.setProperty("--safe-"+name,Math.max(0,value)+"px"));css.setProperty("--keyboard",Math.max(0,keyboard)+"px");document.body.classList.toggle("keyboard-open",keyboard>0);},
    pause(paused){document.body.classList.toggle("paused",paused);},
    debug(){return {ready:state.ready,page:state.page,photoCount:state.photos.length,trashCount:state.trash.length,detail:state.detail,busy:state.busy,renderedCards:document.querySelectorAll(".photo-card").length,filteredCount:state.filtered.length,motion:state.motion,chinaReady:!!world?.china,mapLon,mapLat,mapScale,mapPoints:mapHits.length};}
  };
  request("bootstrap").then((data) => {state.motion=data.motion!==false && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;document.body.classList.toggle("reduced-motion",!state.motion);$("app-version").textContent=data.version || "私人相册";snapshot(data);renderUpdate(data.uiUpdate || {});state.ready=true;loadWorld();return request("uiReady");}).catch((error) => showText("相册暂未连接",error.message+"\n请重新打开应用。此界面只能在 APK 中操作手机相册。"));
})();
