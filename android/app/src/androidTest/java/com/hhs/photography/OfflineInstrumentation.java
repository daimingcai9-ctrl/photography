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
import java.io.*;
import java.util.*;
import java.util.zip.*;

/** Framework-only device regression tests: no additional runtime/test dependencies. */
public final class OfflineInstrumentation extends Instrumentation {
    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    private void stage(String message) { Bundle status = new Bundle(); status.putString("stream", "TEST_STAGE: " + message + "\n"); sendStatus(0, status); }
    private void fixture(String operation) throws Exception {
        stage("provider " + operation);
        try (ParcelFileDescriptor command = getUiAutomation().executeShellCommand("am start -W -n com.hhs.photography.offline.test/com.hhs.photography.ReferenceGrantActivity --es operation " + operation);
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
    @Override public void onStart() {
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
            PhotoStore.ImportResult added; try (InputStream input = new FileInputStream(file)) { added = store.importPhoto(input, "原片.jpg", "image/jpeg", 0); }
            PhotoStore.Record row = store.find(added.id);
            check(row.photo.getInt("width") == 80 && row.photo.getInt("height") == 120, "自动方向不正确");
            check(row.photo.getString("date").equals("2025-01-02"), "EXIF 日期不正确");
            check(row.photo.getString("camera").equals("Offline Test Camera"), "EXIF 设备未读取");
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
            check(getTargetContext().getPackageManager().getPackageInfo(getTargetContext().getPackageName(), 4096).requestedPermissions == null, "离线应用不应申请网络/整盘权限");
            stage("native launch");
            Activity activity = startActivitySync(new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            waitForIdleSync(); check(activity != null && !activity.isFinishing(), "原生画廊无法启动"); runOnMainSync(activity::finish);
            file.delete(); result.putString("stream", "OFFLINE_TESTS_OK: URI grants, no original copy, reference persistence, revocation, relinking, missing source, portable backup, safe deletion, v1 migration, EXIF, rotation, deduplication, trash, Git export, zip safety, native launch\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("stream", "OFFLINE_TESTS_FAILED: " + error + "\n"); finish(Activity.RESULT_CANCELED, result);
        } finally { if (store != null) store.close(); if (restored != null) restored.close(); }
    }
}
