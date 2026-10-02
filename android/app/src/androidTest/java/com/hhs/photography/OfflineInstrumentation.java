package com.hhs.photography;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.ContentValues;
import android.database.sqlite.SQLiteDatabase;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.media.ExifInterface;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import org.json.JSONObject;
import org.json.JSONArray;
import android.net.Uri;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.io.*;
import java.util.*;
import java.util.zip.*;

/** Framework-only device regression tests: no additional runtime/test dependencies. */
public final class OfflineInstrumentation extends Instrumentation {
    private boolean networkOnly;
    private MainActivity captureActivity;
    @Override public void onCreate(Bundle args) { super.onCreate(args); networkOnly=args!=null&&"true".equals(args.getString("updateNetwork")); start(); }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    private static String albumState(PhotoStore store) throws Exception {
        JSONArray rows=new JSONArray(); for (PhotoStore.Record row:store.list(false)) rows.put(new JSONObject().put("id",row.id).put("photo",row.photo)); return rows.toString();
    }
    private void stage(String message) { Bundle status = new Bundle(); status.putString("stream", "TEST_STAGE: " + message + "\n"); sendStatus(0, status); }
    private void fixture(String operation) throws Exception {
        stage("provider " + operation);
        // NEW_TASK | CLEAR_TASK: do not deliver a second operation to an old
        // still-visible fixture activity while its delayed finish is pending.
        try (ParcelFileDescriptor command = getUiAutomation().executeShellCommand("am start -W -f 0x10008000 -n com.hhs.photography.offline.test/com.hhs.photography.ReferenceGrantActivity --es operation " + operation);
             InputStream input = new ParcelFileDescriptor.AutoCloseInputStream(command)) {
            ByteArrayOutputStream output = new ByteArrayOutputStream(); byte[] bytes = new byte[4096]; int n;
            while ((n = input.read(bytes)) != -1) output.write(bytes, 0, n);
            check(!output.toString("UTF-8").contains("Error"), "test provider activity failed");
        }
    }
    private static void copy(File source, File destination) throws IOException {
        try (InputStream input = new FileInputStream(source); OutputStream output = new FileOutputStream(destination)) {
            byte[] bytes = new byte[4096]; int n; while ((n = input.read(bytes)) != -1) output.write(bytes, 0, n);
        }
    }
    private String js(MainActivity activity,String script) throws Exception {
        CountDownLatch latch=new CountDownLatch(1);String[] output={null};
        String checked="(()=>{try{return ("+script+");}catch(e){return '__JS_ERROR__'+e.name+': '+e.message;}})()";
        runOnMainSync(()->activity.uiView().evaluateJavascript(checked,value->{output[0]=value;latch.countDown();}));
        check(latch.await(8,TimeUnit.SECONDS),"JS evaluation timeout");check(output[0]==null || !output[0].contains("__JS_ERROR__"),"UI JavaScript: "+output[0]+" in "+script);return output[0];
    }
    private void waitJs(MainActivity activity,String condition) throws Exception {
        long deadline=System.currentTimeMillis()+20000;
        while(System.currentTimeMillis()<deadline) {if("true".equals(js(activity,condition)))return;Thread.sleep(150);}
        throw new AssertionError("Offline UI condition failed: "+condition+"; "+js(activity,"window.Album&&Album.debug()"));
    }
    private void screenshot(String name) throws Exception {
        CountDownLatch frame=new CountDownLatch(1);
        runOnMainSync(() -> captureActivity.uiView().postVisualStateCallback(System.nanoTime(),new android.webkit.WebView.VisualStateCallback() {
            @Override public void onComplete(long requestId) { captureActivity.uiView().invalidate(); frame.countDown(); }
        }));
        check(frame.await(10,TimeUnit.SECONDS),"WebView visual state did not reach screenshot frame");
        waitForIdleSync();Thread.sleep(650);
        android.view.accessibility.AccessibilityNodeInfo root=getUiAutomation().getRootInActiveWindow();
        check(root != null && getTargetContext().getPackageName().contentEquals(root.getPackageName()),"External system window obscures album screenshot: " + (root == null ? "none" : root.getPackageName()));
        root.recycle(); Bitmap bitmap=getUiAutomation().takeScreenshot();check(bitmap!=null,"No screenshot");
        try(OutputStream output=new FileOutputStream(new File(getTargetContext().getFilesDir(),"ui-"+name+".png"))){bitmap.compress(Bitmap.CompressFormat.PNG,100,output);}finally{bitmap.recycle();}
    }
    private void uiTests() throws Exception {
        stage("bundled offline UI, real referenced public fixtures");fixture("gallery");
        JSONArray fixtures;try(InputStream input=getContext().getAssets().open("demo/photos.json")){ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;while((n=input.read(buffer))!=-1)bytes.write(buffer,0,n);fixtures=new JSONArray(bytes.toString("UTF-8"));}
        ArrayList<String> ids=new ArrayList<>();
        try(PhotoStore main=new PhotoStore(getTargetContext())) {
            for(int i=0;i<6;i++) {
                Uri uri=Uri.parse("content://com.hhs.photography.offline.test.references/demo"+i);
                getTargetContext().getContentResolver().takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);
                String id=main.importReference(uri,"测试作品"+i+".jpg","image/jpeg",0).id;ids.add(id);
                JSONObject edit=new JSONObject(main.find(id).photo.toString()),source=fixtures.getJSONObject(i);
                for(String key:new String[]{"title","date","location","camera","tags"})edit.put(key,source.get(key));main.edit(id,edit);
                check(!main.refreshLocation(id) && main.find(id).photo.getJSONObject("location").toString().equals(edit.getJSONObject("location").toString()),"Missing GPS erased edited location");
                check(!main.original(id).exists(),"UI fixture copied source original");
            }
            boolean wrong=false;
            try{main.relinkReference(ids.get(0),Uri.parse("content://com.hhs.photography.offline.test.references/demo1"),"错误原图.jpg","image/jpeg",0);}catch(IOException expected){wrong=true;}
            check(wrong && main.list(false).size()==6,"Wrong re-link modified album");
        }
        MainActivity activity=(MainActivity)startActivitySync(new Intent(getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        captureActivity=activity;
        waitJs(activity,"!!window.Album&&Album.debug().ready");
        stage("viewport "+js(activity,"({width:innerWidth,height:innerHeight,density:devicePixelRatio,top:getComputedStyle(document.documentElement).getPropertyValue('--safe-top'),bottom:getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')})"));
        check("true".equals(js(activity,"innerHeight/innerWidth>2.1&&innerWidth>=390&&innerWidth<=410")),"Emulator did not use the Xiaomi 15 target viewport");
        check("6".equals(js(activity,"Album.debug().photoCount")),"Native snapshot not delivered");
        waitJs(activity,"document.getElementById('page-home').getBoundingClientRect().width>=innerWidth-1&&document.getElementById('hero-image').naturalWidth>0&&!document.getElementById('hero').classList.contains('empty')");screenshot("home");
        check("true".equals(js(activity,"Album.debug().motion")),"Device tests must exercise WebView animations");
        runOnMainSync(()->{
            for(String blocked:new String[]{"https://example.com/ui/app.js","file:///data/data/private","https://appassets.androidplatform.net/ui/../private","https://appassets.androidplatform.net/media/raw/"+ids.get(0)+".jpg"})check(activity.resource(Uri.parse(blocked),"GET").getStatusCode()==404,"Resource escaped allowlist");
            check(activity.resource(Uri.parse(MainActivity.PAGE),"POST").getStatusCode()==404,"POST resource allowed");
        });
        js(activity,"document.getElementById('nav-gallery').click()");waitJs(activity,"Album.debug().page==='gallery'&&Album.debug().renderedCards>0");screenshot("gallery");
        js(activity,"(()=>{const x=document.getElementById('gallery-search');x.value='不存在的作品';x.dispatchEvent(new Event('input'));return true})()");waitJs(activity,"Album.debug().filteredCount===0");
        js(activity,"document.getElementById('reset-filters').click()");waitJs(activity,"Album.debug().filteredCount===6&&Album.debug().renderedCards>0");
        js(activity,"document.querySelector('.photo-card').click()");waitJs(activity,"!!Album.debug().detail&&document.querySelector('.viewer-loading').hidden");
        waitJs(activity,"document.getElementById('source-state').textContent.includes('系统原图')&&document.getElementById('viewer-image').complete&&document.getElementById('viewer-image').naturalWidth>0");screenshot("detail");
        js(activity,"document.getElementById('viewer-edit').click()");waitJs(activity,"!document.getElementById('sheet-overlay').hidden&&!!document.querySelector('#sheet-content input')");
        check("true".equals(js(activity,"!document.querySelector('#sheet-content input[name=title]')&&document.getElementById('viewer-title').hidden")),"Filename controls remain visible");
        js(activity,"(()=>{document.querySelector('#sheet-content input[name=location]').value='位置编辑测试';document.querySelector('#sheet-content form').requestSubmit();return true})()");
        waitJs(activity,"document.getElementById('sheet-overlay').hidden&&document.getElementById('viewer-location').textContent==='位置编辑测试'");
        check("true".equals(js(activity,"document.getElementById('source-state').textContent.includes('系统原图')")),"Edit lost source status");
        js(activity,"(()=>{const seq=Album.debug();document.getElementById('viewer-next').click();document.getElementById('viewer-prev').click();Album.closeViewer();document.querySelector('.photo-card').click();return true})()");
        waitJs(activity,"!!Album.debug().detail&&document.querySelector('.viewer-loading').hidden&&document.getElementById('viewer-image').dataset.photo===Album.debug().detail&&document.getElementById('viewer-image').naturalWidth>0");
        waitJs(activity,"!document.getElementById('viewer').hidden&&getComputedStyle(document.getElementById('viewer')).opacity==='1'&&!document.querySelector('.morph-image')");
        js(activity,"(Album.back(),Album.navigate('map'))");waitJs(activity,"Album.debug().page==='map'&&document.getElementById('map-canvas').width>0");screenshot("map");
        js(activity,"Album.navigate('analytics')");waitJs(activity,"document.querySelectorAll('.stat-card').length===4");screenshot("analytics");
        js(activity,"Album.navigate('studio')");
        waitJs(activity,"document.getElementById('page-studio').getBoundingClientRect().width>=innerWidth-1&&document.querySelector('.studio-card').getBoundingClientRect().width>=innerWidth-50&&document.getElementById('nav-studio').classList.contains('selected')");screenshot("studio");
        js(activity,"document.getElementById('studio-check-update').scrollIntoView({block:'center'})");screenshot("updates");
        check("true".equals(js(activity,"!!document.getElementById('studio-check-update')&&document.getElementById('studio-apply-update').hidden")),"Update controls missing or staged unexpectedly");
        check("true".equals(js(activity,"getComputedStyle(document.querySelector('.bottom-nav')).bottom!=='0px'")),"Navigation safe inset lost");
        js(activity,"Album.pause(true)");check("true".equals(js(activity,"document.body.classList.contains('paused')")),"Pause doesn't stop UI animation");js(activity,"Album.pause(false)");
        stage("verified hot resource session + real bridge/photo preservation");
        UiUpdates.Pack hot=UiUpdateTests.run(getTargetContext());
        java.lang.reflect.Field session=MainActivity.class.getDeclaredField("uiPack");session.setAccessible(true);
        runOnMainSync(() -> { try { session.set(activity,hot);activity.uiView().reload(); } catch (Exception error) { throw new AssertionError(error); } });
        waitJs(activity,"window.HotUpdateProbe==='verified-test'&&!!window.Album&&Album.debug().ready&&Album.debug().photoCount===6");
        js(activity,"Album.navigate('studio')");check("true".equals(js(activity,"document.getElementById('stored-count').textContent==='6'")),"Hot UI lost private album");
        runOnMainSync(() -> { try { session.set(activity,null);activity.uiView().reload(); } catch (Exception error) { throw new AssertionError(error); } });
        waitJs(activity,"!window.HotUpdateProbe&&!!window.Album&&Album.debug().ready&&Album.debug().photoCount===6");
        runOnMainSync(activity::finish);waitForIdleSync();
        // Emulators only: prove shared display is not a raw copy; deleting never touches provider.
        try(PhotoStore main=new PhotoStore(getTargetContext())) {
            String id=ids.get(0);Uri shared=Uri.parse("content://com.hhs.photography.offline.share/image/"+id);
            File partial=new File(main.image(id).getParentFile(),"in-progress.part");check(partial.createNewFile(),"Partial fixture");
            try(InputStream input=getTargetContext().getContentResolver().openInputStream(shared)){check(input!=null&&input.read()!=-1,"Display share unavailable");}
            check(partial.isFile(),"Opening share removed another worker's temporary file");partial.delete();
            boolean writeRejected=false;try{getTargetContext().getContentResolver().openFileDescriptor(shared,"w");}catch(FileNotFoundException expected){writeRejected=true;}check(writeRejected,"Share provider writable");
            for(String photo:ids){main.trash(photo);main.restore(photo);main.trash(photo);main.erase(photo);}
            fixture("gallerygrant");
            try(InputStream input=getTargetContext().getContentResolver().openInputStream(Uri.parse("content://com.hhs.photography.offline.test.references/demo0"))){check(input!=null&&input.read()!=-1,"UI deletion touched external original");}
        }
    }
    @Override public void onStart() {
        if (networkOnly) {
            Bundle networkResult=new Bundle();
            try (PhotoStore main=new PhotoStore(getTargetContext())) {
                String before=albumState(main); long bytes=main.bytes();
                UiUpdates updater=new UiUpdates(getTargetContext());updater.check();
                String pin;try (InputStream input=getTargetContext().getAssets().open("updates/public-key.txt")) { pin=new String(UiUpdates.readLimited(input,16384),java.nio.charset.StandardCharsets.UTF_8); }
                File cache=new File(getTargetContext().getNoBackupFilesDir(),"network-update-test-"+System.nanoTime());
                JSONObject oldBaseline=new JSONObject().put("version",0).put("release","simulate-older-apk").put("protocol",1);
                UiUpdates older=new UiUpdates(cache,pin,oldBaseline);older.check();
                long downloaded=older.status().getLong("pendingVersion");check(downloaded>0,"No real signed UI staged for older APK");
                older.apply();check(older.beginSession().version==downloaded,"Real network update failed activation");older.ready();
                older=new UiUpdates(cache,pin,oldBaseline);check(older.beginSession().version==downloaded,"Offline cached network UI failed restart");older.ready();
                older.rollback("network test rollback");check(older.beginSession()==null,"Real network update cannot roll back");
                check(before.equals(albumState(main))&&bytes==main.bytes(),"UI download modified private album");
                networkResult.putString("stream","UI_UPDATE_NETWORK_OK: fixed HTTPS endpoint, pinned signature, real download/stage/activation/offline-restart/rollback, private album unchanged; version="+downloaded+"; "+updater.status()+"\n");
                finish(Activity.RESULT_OK,networkResult);
            } catch (Throwable error) { networkResult.putString("stream","UI_UPDATE_NETWORK_FAILED: "+error+"\n");finish(Activity.RESULT_CANCELED,networkResult); }
            return;
        }
        Bundle result = new Bundle(); PhotoStore store = null, restored = null;
        try {
            stage("legacy imports and v1 upgrade");
            String library = "test" + System.nanoTime(); store = new PhotoStore(getTargetContext(), library);
            File file = new File(getTargetContext().getCacheDir(), "fixture-" + library + ".jpg");
            Bitmap bitmap = Bitmap.createBitmap(120, 80, Bitmap.Config.ARGB_8888); bitmap.eraseColor(Color.RED);
            try (OutputStream output = new FileOutputStream(file)) { bitmap.compress(Bitmap.CompressFormat.JPEG, 95, output); } bitmap.recycle();
            ExifInterface exif = new ExifInterface(file.getPath());
            exif.setAttribute(ExifInterface.TAG_ORIENTATION, "6"); exif.setAttribute(ExifInterface.TAG_DATETIME_ORIGINAL, "2025:01:02 00:03:00");
            exif.setAttribute(ExifInterface.TAG_MAKE, "Offline"); exif.setAttribute(ExifInterface.TAG_MODEL, "Test Camera"); exif.saveAttributes();
            exif.setAttribute(ExifInterface.TAG_GPS_LATITUDE,"31/1,13/1,48/1");exif.setAttribute(ExifInterface.TAG_GPS_LATITUDE_REF,"N");
            exif.setAttribute(ExifInterface.TAG_GPS_LONGITUDE,"121/1,28/1,12/1");exif.setAttribute(ExifInterface.TAG_GPS_LONGITUDE_REF,"E");exif.saveAttributes();
            PhotoStore.ImportResult added; try (InputStream input = new FileInputStream(file)) { added = store.importPhoto(input, "原片.jpg", "image/jpeg", 0); }
            PhotoStore.Record row = store.find(added.id);
            check(row.photo.getInt("width") == 80 && row.photo.getInt("height") == 120, "自动方向不正确");
            check(row.photo.getString("date").equals("2025-01-02"), "EXIF 日期不正确");
            check(row.photo.getString("camera").equals("Offline Test Camera"), "EXIF 设备未读取");
            check(Math.abs(row.photo.getJSONObject("location").getDouble("lat")-31.23)<.001 && Math.abs(row.photo.getJSONObject("location").getDouble("lng")-121.47)<.001,"EXIF GPS not parsed/rounded");
            check(store.refreshLocation(added.id),"Existing photo cannot re-read EXIF GPS");
            check(row.photo.getString("colorCategory").equals("red"), "色彩分类不正确");
            check(new ExifInterface(store.image(added.id).getPath()).getAttribute(ExifInterface.TAG_MAKE) == null, "展示图未移除 EXIF");
            check(new ExifInterface(store.original(added.id).getPath()).getAttribute(ExifInterface.TAG_MAKE).equals("Offline"), "原片未保留");
            try (InputStream input = new FileInputStream(file)) { check(store.importPhoto(input, "原片.jpg", "image/jpeg", 0).status.equals("duplicate"), "重复照片入库"); }
            JSONObject edit = new JSONObject(row.photo.toString()); edit.put("title", "手机独立保存"); store.edit(added.id, edit);
            // Recreate the exact v1 schema and private files to test a non-destructive upgrade.
            String oldLibrary = library + "v1";
            try (SQLiteDatabase old = getTargetContext().openOrCreateDatabase("offline-" + oldLibrary + ".db", 0, null)) {
                old.execSQL("CREATE TABLE photos(id TEXT PRIMARY KEY, metadata TEXT NOT NULL, original_name TEXT NOT NULL, mime TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, date TEXT NOT NULL)");
                ContentValues values = new ContentValues(); values.put("id", added.id); values.put("metadata", edit.toString());
                values.put("original_name", "原片.jpg"); values.put("mime", "image/jpeg"); values.put("date", "2025-01-02");
                old.insertOrThrow("photos", null, values); old.setVersion(1);
            }
            File oldRoot = new File(getTargetContext().getNoBackupFilesDir(), "album-" + oldLibrary); check(oldRoot.mkdirs(), "migration fixture failed");
            for (File owned : new File[]{store.original(added.id), store.image(added.id), store.thumb(added.id)}) copy(owned, new File(oldRoot, owned.getName()));
            try (PhotoStore upgraded = new PhotoStore(getTargetContext(), oldLibrary)) {
                check(!upgraded.find(added.id).referenced() && upgraded.find(added.id).photo.getString("title").equals("手机独立保存"), "旧照片/编辑丢失");
                check(upgraded.sourceAvailable(upgraded.find(added.id)), "升级移除了旧原片");
            }
            store.close(); store = new PhotoStore(getTargetContext(), library);
            check(store.list(false).size() == 1 && store.find(added.id).photo.getString("title").equals("手机独立保存"), "重启后信息丢失");
            check(!PhotoStore.validDate("2026-02-30"), "无效日期被接受");
            store.trash(added.id); check(store.list(false).isEmpty() && store.list(true).size() == 1, "回收站未生效");
            store.restore(added.id); check(store.list(false).size() == 1, "回收站不能恢复");
            ByteArrayOutputStream backup = new ByteArrayOutputStream(); store.exportZip(backup, false);
            restored = new PhotoStore(getTargetContext(), library + "restore"); restored.restoreZip(new ByteArrayInputStream(backup.toByteArray()), (n,msg) -> {});
            check(restored.list(false).size() == 1 && restored.find(added.id).photo.getString("title").equals("手机独立保存"), "备份恢复未保留照片及编辑");
            restored.restoreZip(new ByteArrayInputStream(backup.toByteArray()), (n,msg) -> {}); check(restored.list(false).size() == 1, "备份重复导入");
            ByteArrayOutputStream git = new ByteArrayOutputStream(); store.exportZip(git, true); int images = 0;
            try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(git.toByteArray()))) {
                ZipEntry entry; while ((entry = zip.getNextEntry()) != null) { check(!entry.getName().startsWith("originals/"), "Git 包泄露原片"); if (entry.getName().startsWith("public/photos/")) images++; }
            }
            check(images == 1, "Git 包缺少展示图");
            ByteArrayOutputStream unsafe = new ByteArrayOutputStream();
            try (ZipOutputStream zip = new ZipOutputStream(unsafe)) {
                zip.putNextEntry(new ZipEntry("album.json")); zip.write("{\"format\":\"hhs-offline-v1\",\"records\":[]}".getBytes("UTF-8")); zip.closeEntry();
                zip.putNextEntry(new ZipEntry("../../escape.jpg")); zip.write(1); zip.closeEntry();
            }
            boolean refused = false; try { restored.restoreZip(new ByteArrayInputStream(unsafe.toByteArray()), (n,msg) -> {}); } catch (IOException expected) { refused = true; }
            check(refused, "未拒绝恶意 ZIP 路径");
            // A provider in the other APK grants access just as the system picker does.
            stage("persistent original references");
            fixture("grant");
            getTargetContext().getContentResolver().takePersistableUriPermission(ReferenceFixtureProvider.URI, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            PhotoStore.ImportResult linked = store.importReference(ReferenceFixtureProvider.URI, "引用.jpg", "image/jpeg", 0);
            check(!store.original(linked.id).exists(), "引用模式复制了原片");
            PhotoStore.Record reference = store.find(linked.id);
            check(reference.referenced() && reference.photo.getString("date").equals("2025-04-03"), "引用元数据未保存");
            Bitmap original = store.decodeOriginal(reference, 1920); check(original.getWidth() == 80 && original.getHeight() == 120, "引用图方向错误"); original.recycle();
            JSONObject referenceEdit = new JSONObject(reference.photo.toString()).put("title", "引用编辑保留"); store.edit(linked.id, referenceEdit);
            store.close(); store = new PhotoStore(getTargetContext(), library);
            check(store.find(linked.id).referenced() && store.sourceAvailable(store.find(linked.id)), "重开后引用授权丢失");
            ByteArrayOutputStream referencedBackup = new ByteArrayOutputStream(); store.exportZip(referencedBackup, false);
            restored.restoreZip(new ByteArrayInputStream(referencedBackup.toByteArray()), (n,msg) -> {});
            check(!restored.find(linked.id).referenced() && restored.original(linked.id).isFile(), "完整备份缺少引用原片");
            fixture("revoke"); check(!store.sourceAvailable(store.find(linked.id)), "未检测授权撤销");
            boolean revokedRejected = false;
            try { store.importReference(ReferenceFixtureProvider.URI, "引用.jpg", "image/jpeg", 0); } catch (IOException expected) { revokedRejected = true; }
            check(revokedRejected, "允许临时/无授权引用");
            fixture("grant"); getTargetContext().getContentResolver().takePersistableUriPermission(ReferenceFixtureProvider.URI, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            check(store.importReference(ReferenceFixtureProvider.URI, "引用.jpg", "image/jpeg", 0).status.equals("duplicate"), "重新关联生成重复记录");
            check(store.find(linked.id).photo.getString("title").equals("引用编辑保留"), "关联覆盖已有编辑");
            fixture("delete"); check(!store.sourceAvailable(store.find(linked.id)) && store.image(linked.id).isFile(), "失联未保留展示缓存");
            boolean missingBackupRejected = false;
            try { store.exportZip(new ByteArrayOutputStream(), false); } catch (IOException expected) { missingBackupRejected = true; }
            check(missingBackupRejected, "用缓存冒充完整备份");
            store.exportZip(new ByteArrayOutputStream(), true); // Cached Git images still work.
            fixture("grant"); store.trash(linked.id); store.restore(linked.id); store.trash(linked.id); store.erase(linked.id);
            boolean released = true;
            for (android.content.UriPermission grant : getTargetContext().getContentResolver().getPersistedUriPermissions()) if (grant.getUri().equals(ReferenceFixtureProvider.URI)) released = false;
            check(released, "删除记录未释放持久授权");
            getTargetContext().getContentResolver().takePersistableUriPermission(ReferenceFixtureProvider.URI, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try (InputStream source = getTargetContext().getContentResolver().openInputStream(ReferenceFixtureProvider.URI)) { check(source != null && source.read() != -1, "删除应用记录触碰了系统原片"); }
            getTargetContext().getContentResolver().releasePersistableUriPermission(ReferenceFixtureProvider.URI, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            store.trash(added.id); store.erase(added.id); check(store.find(added.id) == null && !store.original(added.id).exists() && file.exists(), "删除触碰系统源片或残留副本");
            String[] permissions=getTargetContext().getPackageManager().getPackageInfo(getTargetContext().getPackageName(),4096).requestedPermissions;
            stage("requested permissions " + Arrays.toString(permissions));
            check(permissions != null && Arrays.asList(permissions).contains(android.Manifest.permission.ACCESS_MEDIA_LOCATION),"Photo EXIF permission is missing");
            // Android automatically adds this selected-only permission when ACCESS_MEDIA_LOCATION
            // is declared. Only native signed UI downloads use INTERNET; WebView network stays blocked.
            for (String permission : permissions) check(permission.equals(android.Manifest.permission.ACCESS_MEDIA_LOCATION)
                || permission.equals(android.Manifest.permission.INTERNET)
                || permission.equals("android.permission.READ_MEDIA_VISUAL_USER_SELECTED"),"Unexpected permission: " + permission);
            stage("signed UI verification, atomic activation, restart recovery, anti-replay");
            UiUpdateTests.run(getTargetContext());
            uiTests();
            file.delete(); result.putString("stream", "OFFLINE_TESTS_OK: URI grants, no original copy, reference persistence, revocation, relinking, missing source, portable backup, safe deletion, v1 migration, EXIF, rotation, deduplication, trash, Git export, zip safety, native launch\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("stream", "OFFLINE_TESTS_FAILED: " + error + "\n"); finish(Activity.RESULT_CANCELED, result);
        } finally { if (store != null) store.close(); if (restored != null) restored.close(); }
    }
}
