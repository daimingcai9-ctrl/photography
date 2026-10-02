package com.hhs.photography;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.media.ExifInterface;
import android.os.Bundle;
import org.json.JSONObject;
import java.io.*;
import java.util.*;
import java.util.zip.*;

/** Framework-only device regression tests: no additional runtime/test dependencies. */
public final class OfflineInstrumentation extends Instrumentation {
    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    @Override public void onStart() {
        Bundle result = new Bundle(); PhotoStore store = null, restored = null;
        try {
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
            store.trash(added.id); store.erase(added.id); check(store.find(added.id) == null && !store.original(added.id).exists() && file.exists(), "删除触碰系统源片或残留副本");
            check(getTargetContext().getPackageManager().getPackageInfo(getTargetContext().getPackageName(), 4096).requestedPermissions == null, "离线应用不应申请网络/整盘权限");
            Activity activity = startActivitySync(new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            waitForIdleSync(); check(activity != null && !activity.isFinishing(), "原生画廊无法启动"); runOnMainSync(activity::finish);
            file.delete(); result.putString("stream", "OFFLINE_TESTS_OK: EXIF, rotation, persistence, deduplication, trash, backup/restore, Git export, zip safety, permissions, native launch\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("stream", "OFFLINE_TESTS_FAILED: " + error + "\n"); finish(Activity.RESULT_CANCELED, result);
        } finally { if (store != null) store.close(); if (restored != null) restored.close(); }
    }
}
