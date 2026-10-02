package com.hhs.photography;

import android.animation.ValueAnimator;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/** Bundled offline UI + native picker/SQLite/URI permissions. Never loads a remote page. */
public final class MainActivity extends Activity {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    static final String PAGE = ORIGIN + "/ui/index.html";
    private static final int PICK = 100, BACKUP = 101, GIT = 102, RESTORE = 103, FILES = 104;
    private final ThreadPoolExecutor worker = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<>(32), new ThreadPoolExecutor.AbortPolicy());
    private final AtomicInteger pending = new AtomicInteger();
    private PhotoStore store;
    private WebView web;
    private WebMessagePort port;
    private volatile boolean trusted, busy;
    private String relinkId;
    private int insetTop, insetBottom, insetLeft, insetRight;
    private float keyboard;
    private volatile String previewId = "";
    private volatile byte[] previewBytes;

    @SuppressLint("SetJavaScriptEnabled") // Only bundled, CSP-restricted UI; no JavascriptInterface.
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        try { store = new PhotoStore(this); }
        catch (Exception error) { new AlertDialog.Builder(this).setMessage("相册打开失败：" + message(error)).setPositiveButton("关闭", (d,w) -> finish()).show(); return; }
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        getWindow().setStatusBarColor(Color.TRANSPARENT); getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        FrameLayout host = new FrameLayout(this); host.setBackgroundColor(Color.rgb(7,7,10));
        web = new WebView(this); web.setBackgroundColor(Color.rgb(7,7,10)); web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(false);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setBlockNetworkLoads(true); settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false); settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) { return resource(request.getUrl(),request.getMethod()); }
            @Override public void onPageStarted(WebView view, String url, Bitmap icon) { trusted=false; if (port != null) { port.close(); port=null; } }
            @Override public void onPageFinished(WebView view, String url) {
                if (!PAGE.equals(url) || isFinishing() || isDestroyed()) return;
                WebMessagePort[] channel = web.createWebMessageChannel(); port=channel[0]; trusted=true;
                port.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
                    @Override public void onMessage(WebMessagePort source, WebMessage msg) { accept(msg.getData()); }
                });
                // Exact target origin. No global Java object is exposed to pages or frames.
                web.postWebMessage(new WebMessage("hhs-album-connect",new WebMessagePort[]{channel[1]}),Uri.parse(ORIGIN));
                applyInsets();
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                trusted=false; Toast.makeText(MainActivity.this,"界面进程已退出，照片仍保留；请重新打开应用",Toast.LENGTH_LONG).show(); finish(); return true;
            }
        });
        host.addView(web,new FrameLayout.LayoutParams(-1,-1)); setContentView(host);
        host.setOnApplyWindowInsetsListener((v,insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                insetTop=bars.top; insetBottom=bars.bottom; insetLeft=bars.left; insetRight=bars.right;
                keyboard=insets.isVisible(WindowInsets.Type.ime()) ? insets.getInsets(WindowInsets.Type.ime()).bottom : 0;
            } else {
                insetTop=insets.getSystemWindowInsetTop(); insetBottom=insets.getSystemWindowInsetBottom();
                insetLeft=insets.getSystemWindowInsetLeft(); insetRight=insets.getSystemWindowInsetRight(); keyboard=0;
            }
            applyInsets(); return insets;
        });
        host.requestApplyInsets(); web.loadUrl(PAGE);
        if (Build.VERSION.SDK_INT >= 34) ModernBack.register(this);
        else if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0,this::back);
    }
    private void applyInsets() {
        if (!trusted || web == null) return; float density=getResources().getDisplayMetrics().density;
        web.evaluateJavascript("window.Album&&window.Album.insets(" + insetTop/density + "," + insetBottom/density + "," + insetLeft/density + "," + insetRight/density + "," + keyboard/density + ")",null);
    }
    private static WebResourceResponse response(String mime,int status,InputStream input) {
        Map<String,String> headers=new HashMap<>(); headers.put("Cache-Control","no-store"); headers.put("X-Content-Type-Options","nosniff");
        headers.put("Content-Security-Policy","default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; font-src 'self'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
        return new WebResourceResponse(mime,"UTF-8",status,status == 200 ? "OK" : "Not Found",headers,input);
    }
    WebResourceResponse resource(Uri uri,String method) {
        try {
            if (!"GET".equals(method) || !"https".equals(uri.getScheme()) || !"appassets.androidplatform.net".equals(uri.getHost())
                || uri.getPort() != -1 || uri.getUserInfo() != null) throw new IOException("Blocked origin");
            String path=uri.getPath();
            if (path != null && path.matches("/ui/(index\\.html|app\\.js|style\\.css|world-land\\.geojson|brand\\.svg)")) {
                String mime=path.endsWith("html") ? "text/html" : path.endsWith("js") ? "application/javascript" : path.endsWith("css") ? "text/css" : path.endsWith("svg") ? "image/svg+xml" : "application/json";
                return response(mime,200,getAssets().open(path.substring(1)));
            }
            if (path != null && path.matches("/media/(thumb|image|preview)/mobile-[a-f0-9]{64}\\.jpg")) {
                String id=path.substring(path.lastIndexOf('/') + 1,path.length() - 4);
                PhotoStore.Record row=store.find(id); if (row == null) throw new IOException("Unknown photo");
                if (path.startsWith("/media/preview/")) {
                    byte[] bytes=previewBytes; if (!id.equals(previewId) || bytes == null) throw new IOException("Stale preview");
                    return response("image/jpeg",200,new ByteArrayInputStream(bytes));
                }
                File file=path.startsWith("/media/thumb/") ? store.thumb(id) : store.image(id);
                return response("image/jpeg",200,new FileInputStream(file));
            }
        } catch (Exception ignored) { }
        // Never return null: unknown resources cannot fall through to the network.
        return response("text/plain",404,new ByteArrayInputStream(new byte[0]));
    }
    private void accept(String input) {
        if (!trusted || input == null || input.length() > 131072) return; String requestId="";
        try {
            JSONObject request=new JSONObject(input); requestId=request.getString("id"); if (!requestId.matches("r[0-9]{1,9}")) return;
            String action=request.getString("action"); JSONObject data=request.optJSONObject("data"); if (data == null) data=new JSONObject();
            if (pending.incrementAndGet() > 24) { pending.decrementAndGet(); throw new IOException("操作太快，请稍后重试"); }
            String id=requestId; JSONObject body=data;
            try { worker.execute(() -> {
                try { reply(id,command(action,body),null); } catch (Exception error) { reply(id,null,message(error)); }
                finally { pending.decrementAndGet(); }
            }); } catch (RejectedExecutionException error) { pending.decrementAndGet(); throw new IOException("正在处理照片，请稍后重试"); }
        } catch (Exception error) { if (!requestId.isEmpty()) reply(requestId,null,message(error)); }
    }
    private JSONObject command(String action,JSONObject data) throws Exception {
        if (busy && !action.equals("bootstrap") && !action.equals("list") && !action.equals("haptic")) throw new IOException("正在处理照片，请等待完成");
        JSONObject result=new JSONObject();
        switch (action) {
            case "bootstrap": return snapshot().put("motion",ValueAnimator.areAnimatorsEnabled()).put("version","3.0 · 私人相册");
            case "list": return snapshot();
            case "preview": {
                PhotoStore.Record row=require(data.getString("id"),false); Bitmap bitmap=null;
                try {
                    bitmap=store.decodeOriginal(row,2560); ByteArrayOutputStream bytes=new ByteArrayOutputStream();
                    if (!bitmap.compress(Bitmap.CompressFormat.JPEG,90,bytes)) throw new IOException("原图预览失败");
                    previewBytes=bytes.toByteArray(); previewId=row.id;
                    return result.put("available",true).put("url","/media/preview/" + row.id + ".jpg?t=" + System.nanoTime());
                } catch (IOException | SecurityException missing) {
                    return result.put("available",false).put("url","/media/image/" + row.id + ".jpg").put("warning","原图不可用或授权失效：当前仅显示缓存，不是原片。重新选择同一原图可恢复关联。");
                } finally { if (bitmap != null) bitmap.recycle(); }
            }
            case "closePreview": previewId=""; previewBytes=null; return result;
            case "edit": require(data.getString("id"),false); store.edit(data.getString("id"),data.getJSONObject("photo")); return snapshot();
            case "trash": require(data.getString("id"),false); store.trash(data.getString("id")); return snapshot();
            case "restore": require(data.getString("id"),true); store.restore(data.getString("id")); return snapshot();
            case "erase": require(data.getString("id"),true); store.erase(data.getString("id")); return snapshot();
            case "pick": {
                String relink=data.optString("relink"); if (!relink.isEmpty()) require(relink,false); boolean files=data.optBoolean("files");
                ui(() -> { relinkId=relink; pick(files ? FILES : PICK); }); return result;
            }
            case "backup": ui(() -> export(BACKUP)); return result;
            case "git": ui(() -> export(GIT)); return result;
            case "restoreBackup": ui(() -> pick(RESTORE)); return result;
            case "website": ui(() -> external(new Intent(Intent.ACTION_VIEW,Uri.parse("https://photography-hhs.pages.dev/gallery")))); return result;
            case "map": {
                PhotoStore.Record row=require(data.getString("id"),false); JSONObject loc=row.photo.getJSONObject("location");
                double lat=loc.getDouble("lat"),lng=loc.getDouble("lng"); if (lat == 0 && lng == 0) throw new IOException("这张照片没有可用坐标");
                ui(() -> external(new Intent(Intent.ACTION_VIEW,Uri.parse("geo:" + lat + "," + lng + "?q=" + lat + "," + lng)))); return result;
            }
            case "share": {
                PhotoStore.Record row=require(data.getString("id"),false); Uri uri=Uri.parse("content://com.hhs.photography.offline.share/image/" + row.id);
                ui(() -> { Intent send=new Intent(Intent.ACTION_SEND).setType("image/jpeg").putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    send.setClipData(android.content.ClipData.newUri(getContentResolver(),"展示图",uri)); external(Intent.createChooser(send,"分享已去除 EXIF 的展示图")); }); return result;
            }
            case "haptic": ui(() -> web.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)); return result;
            case "exit": ui(this::finish); return result;
            default: throw new IOException("不支持的操作");
        }
    }
    private PhotoStore.Record require(String id,boolean deleted) throws Exception {
        PhotoStore.Record row=store.find(id); if (row == null || row.deleted != deleted) throw new IOException("照片不存在或状态已改变"); return row;
    }
    private JSONObject snapshot() throws Exception {
        JSONArray photos=new JSONArray(),trash=new JSONArray();
        for (PhotoStore.Record row : store.list(false)) photos.put(record(row)); for (PhotoStore.Record row : store.list(true)) trash.put(record(row));
        return new JSONObject().put("photos",photos).put("trash",trash).put("bytes",store.bytes()).put("busy",busy);
    }
    private static JSONObject record(PhotoStore.Record row) throws Exception {
        // System content URIs/raw paths never enter HTML or export packages.
        JSONObject photo=new JSONObject(row.photo.toString()); photo.put("referenced",row.referenced());
        photo.put("image","/media/image/" + row.id + ".jpg").put("thumb","/media/thumb/" + row.id + ".jpg"); return photo;
    }
    private void reply(String id,JSONObject result,String error) {
        try { JSONObject response=new JSONObject().put("id",id).put("ok",error == null);
            if (error != null) response.put("error",error); else response.put("data",result); post(response);
        } catch (Exception ignored) { }
    }
    private void event(String type,JSONObject data) { try { post(new JSONObject().put("event",type).put("data",data)); } catch (Exception ignored) { } }
    private void post(JSONObject json) { String value=json.toString(); ui(() -> { if (trusted && port != null) try { port.postMessage(new WebMessage(value)); } catch (IllegalStateException ignored) { } }); }
    private void progress(boolean processing,String message,int done,int total) {
        busy=processing; try { event("progress",new JSONObject().put("busy",processing).put("message",message).put("done",done).put("total",total)); } catch (Exception ignored) { }
    }
    private void pick(int request) {
        if (busy) return; boolean photos=request == PICK || request == FILES;
        Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(photos ? "image/*" : "*/*")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,photos && (relinkId == null || relinkId.isEmpty()));
        if (request == PICK && Build.VERSION.SDK_INT >= 33) {
            Intent album=new Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*");
            if (relinkId == null || relinkId.isEmpty()) album.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX,Math.min(100,MediaStore.getPickImagesMaxLimit()));
            // Start directly: package visibility can make resolveActivity report
            // false even though the system photo picker can be launched.
            try { startActivityForResult(album,request); return; }
            catch (android.content.ActivityNotFoundException unavailable) { /* Document picker fallback below. */ }
        }
        try { startActivityForResult(intent,request); } catch (Exception error) { notice("无法打开选择器","请使用手机系统文件或相册提供者。"); }
    }
    private void export(int request) {
        if (busy) return;
        String warning=request == GIT ? "仅包含当前照片的展示图、缩略图和网站元数据，不含原片，不是完整备份。不自动提交 Git；以后发布会公开这些照片。"
            : "本次会读取原图并复制进 ZIP，包含编辑信息和回收站；日常导入不复制原片。原图失联时会中止。ZIP 未加密，可能含精确 GPS，请选择可信保存位置。恢复会创建应用私有副本。";
        new AlertDialog.Builder(this).setTitle(request == GIT ? "导出 Git 发布包" : "导出完整备份").setMessage(warning).setNegativeButton("取消",null).setPositiveButton("选择保存位置",(d,w) -> {
            Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/zip")
                .putExtra(Intent.EXTRA_TITLE,request == GIT ? "hhs-git-photos.zip" : "hhs-album-" + System.currentTimeMillis() + ".zip");
            try { startActivityForResult(intent,request); } catch (Exception error) { notice("无法导出",message(error)); }
        }).show();
    }
    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data); if (result != RESULT_OK || data == null || busy || store == null) return;
        if (request == PICK || request == FILES) {
            LinkedHashSet<Uri> selected=new LinkedHashSet<>();
            if (data.getClipData() != null) for (int i=0;i<data.getClipData().getItemCount() && selected.size()<100;i++) selected.add(data.getClipData().getItemAt(i).getUri());
            else if (data.getData() != null) selected.add(data.getData());
            if (!selected.isEmpty()) importSelected(new ArrayList<>(selected),relinkId); relinkId=null;
        } else if (data.getData() != null && (request == BACKUP || request == GIT || request == RESTORE)) {
            Uri uri=data.getData(); progress(true,request == RESTORE ? "正在恢复备份…" : "正在导出…",0,0);
            worker.execute(() -> {
                String outcome;
                try {
                    if (request == RESTORE) try (InputStream input=getContentResolver().openInputStream(uri)) {
                        if (input == null) throw new IOException("无法读取备份"); outcome=store.restoreZip(input,(n,msg) -> progress(true,msg,n,0));
                    } else try (OutputStream output=getContentResolver().openOutputStream(uri,"w")) {
                        if (output == null) throw new IOException("无法写入文件"); store.exportZip(output,request == GIT); outcome="导出完成。请妥善保管；Git 包尚未发布。";
                    }
                } catch (Exception error) { outcome="操作未全部完成：" + message(error) + "。未完成 ZIP 不可作为备份；已恢复的照片仍保留。"; }
                progress(false,outcome,0,0); changed();
            });
        }
    }
    private void importSelected(List<Uri> uris,String relink) {
        progress(true,"正在读取系统原图…",0,uris.size());
        worker.execute(() -> {
            int saved=0,duplicates=0,restored=0,done=0; ArrayList<String> errors=new ArrayList<>();
            for (Uri uri : uris) {
                if (Thread.currentThread().isInterrupted()) break; String name="照片"; long modified=0;
                try {
                    if (!"content".equals(uri.getScheme())) throw new IOException("仅允许系统相册/文件提供者");
                    try { getContentResolver().takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION); }
                    catch (SecurityException error) { throw new IOException("相册不支持长期授权，请用管理 → 从文件选择器导入",error); }
                    try (Cursor c=getContentResolver().query(uri,null,null,null,null)) {
                        if (c != null && c.moveToFirst()) { int n=c.getColumnIndex(OpenableColumns.DISPLAY_NAME),m=c.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED);
                            if (n>=0) name=c.getString(n); if (m>=0 && !c.isNull(m)) modified=c.getLong(m); }
                    }
                    PhotoStore.ImportResult imported=relink == null || relink.isEmpty()
                        ? store.importReference(uri,name,getContentResolver().getType(uri),modified)
                        : store.relinkReference(relink,uri,name,getContentResolver().getType(uri),modified);
                    if (imported.status.equals("duplicate")) duplicates++; else if (imported.status.equals("restored")) restored++; else saved++;
                } catch (Exception error) { errors.add(name + "：" + message(error)); }
                finally { store.releaseUnused(uri); }
                progress(true,"逐张识别 " + (++done) + " / " + uris.size() + " · 已完成项已保存",done,uris.size());
            }
            String outcome="新引用 " + saved + " 张 · 重复/重新关联 " + duplicates + " 张 · 恢复 " + restored + " 张 · 失败 " + errors.size() + " 张";
            progress(false,outcome,done,uris.size()); changed();
            if (!errors.isEmpty()) try { event("errors",new JSONObject().put("message",String.join("\n",errors))); } catch (Exception ignored) { }
        });
    }
    private void changed() { try { event("changed",snapshot()); } catch (Exception error) { notice("读取失败",message(error)); } }
    private void external(Intent intent) { try { startActivity(intent); } catch (Exception error) { notice("无法打开",message(error)); } }
    private void notice(String title,String message) { ui(() -> new AlertDialog.Builder(this).setTitle(title).setMessage(message).setPositiveButton("知道了",null).show()); }
    private static String message(Exception error) { return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage(); }
    private void ui(Runnable task) { runOnUiThread(() -> { if (!isFinishing() && !isDestroyed()) task.run(); }); }
    private void back() { if (busy) Toast.makeText(this,"正在处理照片，请等待完成；已完成项已保存",Toast.LENGTH_LONG).show();
        else if (trusted) web.evaluateJavascript("window.Album&&window.Album.back()",null); else finish(); }
    @SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() { if (Build.VERSION.SDK_INT < 33) back(); else super.onBackPressed(); }
    @android.annotation.TargetApi(34)
    private static final class ModernBack {
        static void register(MainActivity activity) {
            activity.getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0,new android.window.OnBackAnimationCallback() {
                public void onBackStarted(android.window.BackEvent event) { gesture(0); }
                public void onBackProgressed(android.window.BackEvent event) { gesture(event.getProgress()); }
                public void onBackCancelled() { gesture(-1); }
                public void onBackInvoked() { gesture(-1); activity.back(); }
                private void gesture(float progress) { if (activity.trusted && !activity.busy) activity.web.evaluateJavascript("window.Album&&window.Album.backProgress(" + progress + ")",null); }
            });
        }
    }
    WebView uiView() { return web; }
    @Override protected void onPause() { if (web != null) { web.onPause(); web.evaluateJavascript("window.Album&&window.Album.pause(true)",null); } super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) { web.onResume(); web.evaluateJavascript("window.Album&&window.Album.pause(false)",null); } }
    @Override protected void onDestroy() {
        trusted=false; if (port != null) port.close(); previewBytes=null; if (web != null) { web.stopLoading(); web.destroy(); }
        worker.shutdownNow(); if (store != null) new Thread(() -> { try { worker.awaitTermination(30,TimeUnit.SECONDS); } catch (InterruptedException ignored) {} store.close(); }).start();
        super.onDestroy();
    }
}
