// Read-only loopback visual harness. Never bundled in the APK or public website.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const root=process.cwd(),assets=path.join(root,"android/app/src/main/assets/ui");
const originals=JSON.parse(await readFile(path.join(root,"data/photos.json"),"utf8")).photos;
const photos=originals.map((p)=>({...p,referenced:true,width:p.width||1600,height:p.height||1200,image:`/media/image/${p.id}.jpg`,thumb:`/media/thumb/${p.id}.jpg`}));
const bridge=`window.addEventListener('DOMContentLoaded',()=>{
 let photos=${JSON.stringify(photos)},trash=[];
 let uiUpdate={currentRelease:'视觉预览',source:'builtin',pendingVersion:0,canRollback:false,message:'只更新界面，不上传照片。'};
 const snapshot=()=>({photos,trash,bytes:photos.length*180000,busy:false,motion:true,version:'3.2 · 本机视觉预览',uiUpdate});
 const channel=new MessageChannel();channel.port1.onmessage=({data})=>{
  const msg=JSON.parse(data);let answer={},error;
  const row=photos.find(p=>p.id===msg.data.id);
  switch(msg.action){
   case 'bootstrap':case 'list':answer=snapshot();break;
   case 'preview':answer={available:true,url:row?.image};break;
   case 'edit':if(row)Object.assign(row,msg.data.photo);answer=snapshot();break;
   case 'trash':if(row){photos=photos.filter(p=>p!==row);trash.push(row);}answer=snapshot();break;
   case 'restore':{const p=trash.find(p=>p.id===msg.data.id);if(p){trash=trash.filter(x=>x!==p);photos.push(p);}answer=snapshot();break;}
   case 'erase':trash=trash.filter(p=>p.id!==msg.data.id);answer=snapshot();break;
   case 'uiReady':case 'haptic':case 'closePreview':break;
   case 'checkUi':uiUpdate={...uiUpdate,pendingVersion:2,pendingRelease:'预览测试 · 2',notes:'签名验证成功（仅模拟）',message:'预览模拟：界面已下载，等待应用'};channel.port1.postMessage(JSON.stringify({event:'uiUpdate',data:uiUpdate}));break;
   case 'applyUi':uiUpdate={...uiUpdate,currentRelease:uiUpdate.pendingRelease,source:'hot',pendingVersion:0,canRollback:true,message:'预览模拟：已应用，不会实际下载或写文件'};channel.port1.postMessage(JSON.stringify({event:'uiUpdate',data:uiUpdate}));break;
   case 'rollbackUi':uiUpdate={...uiUpdate,currentRelease:'视觉预览',source:'builtin',pendingVersion:0,canRollback:false,message:'预览模拟：已回退'};channel.port1.postMessage(JSON.stringify({event:'uiUpdate',data:uiUpdate}));break;
   default:error='浏览器仅供视觉预览，此操作请在 APK 中进行。';
  }
  channel.port1.postMessage(JSON.stringify({id:msg.id,ok:!error,data:answer,error}));
 };channel.port1.start();window.postMessage('hhs-album-connect',location.origin,[channel.port2]);
});`;
const types={html:"text/html",js:"application/javascript",css:"text/css",svg:"image/svg+xml",geojson:"application/json",jpg:"image/jpeg"};
const server=http.createServer(async(req,res)=>{
 try {
  if(req.method!=="GET")throw Error("Read-only");
  const url=new URL(req.url,"http://127.0.0.1:3012");let body,mime;
  if(url.pathname==="/preview-bridge.js"){body=bridge;mime=types.js;}
  else if(/^\/ui\/(index\.html|app\.js|style\.css|brand\.svg|world-land\.geojson)$/.test(url.pathname)){
   body=await readFile(path.join(assets,path.basename(url.pathname)));mime=types[url.pathname.split(".").pop()];
   if(url.pathname.endsWith("index.html"))body=body.toString().replace('<script src="app.js" defer></script>','<script src="/preview-bridge.js" defer></script><script src="app.js" defer></script>');
  }else{
   const match=url.pathname.match(/^\/media\/(thumb|image|preview)\/([A-Za-z0-9_-]+)\.jpg$/),p=match&&originals.find(p=>p.id===match[2]);
   if(!p)throw Error("Unknown resource");
   const source=match[1]==="thumb"?p.thumbnail:p.url;
   if(!/^\/(photos|thumbnails)\/[^/]+\.(jpe?g|png|webp)$/i.test(source))throw Error("Invalid fixture path");
   body=await readFile(path.join(root,"public",source));mime=types.jpg;
  }
  res.writeHead(200,{"Content-Type":mime,"Cache-Control":"no-store","Content-Security-Policy":"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-src 'none'"});res.end(body);
 }catch{res.writeHead(404);res.end();}
});
server.listen(3012,"127.0.0.1",()=>console.log("APK visual preview (public fixtures, read-only): http://127.0.0.1:3012/ui/index.html"));
