package com.hhs.photography;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
import android.media.ExifInterface;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/** Independent, private, durable phone library. No network or browser storage. */
public final class PhotoStore extends SQLiteOpenHelper {
    public static final long MAX_FILE = 25L * 1024 * 1024;
    private final File root;
    public static final class Record {
        public final String id, name, mime;
        public final JSONObject photo;
        public final boolean deleted;
        Record(Cursor c) throws Exception {
            id = c.getString(0); photo = new JSONObject(c.getString(1)); name = c.getString(2);
            mime = c.getString(3); deleted = c.getInt(4) != 0;
        }
    }
    public static final class ImportResult {
        public final String id, status;
        ImportResult(String id, String status) { this.id = id; this.status = status; }
    }
    public interface Progress { void update(int done, String message); }

    public PhotoStore(Context context) throws IOException { this(context, "main"); }
    PhotoStore(Context context, String library) throws IOException {
        super(context, "offline-" + library + ".db", null, 1);
        root = new File(context.getNoBackupFilesDir(), "album-" + library);
        if (!root.isDirectory() && !root.mkdirs()) throw new IOException("无法创建手机相册存储");
        getWritableDatabase();
        File[] files = root.listFiles();
        if (files != null) for (File f : files) if (f.getName().endsWith(".part")) f.delete();
    }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE photos(id TEXT PRIMARY KEY, metadata TEXT NOT NULL, original_name TEXT NOT NULL, mime TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, date TEXT NOT NULL)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { /* Future migrations must preserve the library. */ }
    private String safeId(String id) {
        if (!id.matches("mobile-[a-f0-9]{64}")) throw new IllegalArgumentException("照片 ID 不正确");
        return id;
    }
    public File original(String id) { return new File(root, safeId(id) + ".original"); }
    public File image(String id) { return new File(root, safeId(id) + ".jpg"); }
    public File thumb(String id) { return new File(root, safeId(id) + ".thumb.jpg"); }
    public List<Record> list(boolean deleted) throws Exception {
        ArrayList<Record> rows = new ArrayList<>();
        try (Cursor c = getReadableDatabase().rawQuery("SELECT id,metadata,original_name,mime,deleted FROM photos WHERE deleted=? ORDER BY date DESC, rowid DESC", new String[]{deleted ? "1" : "0"})) {
            while (c.moveToNext()) rows.add(new Record(c));
        }
        return rows;
    }
    public Record find(String id) throws Exception {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT id,metadata,original_name,mime,deleted FROM photos WHERE id=?", new String[]{safeId(id)})) {
            return c.moveToFirst() ? new Record(c) : null;
        }
    }
    public long bytes() { long n = 0; File[] files = root.listFiles(); if (files != null) for (File f : files) n += f.length(); return n; }

    public ImportResult importPhoto(InputStream input, String name, String mime, long modified) throws Exception {
        return importPhoto(input, name, mime, modified, null, null);
    }
    private ImportResult importPhoto(InputStream input, String name, String mime, long modified, String expected, JSONObject backup) throws Exception {
        File raw = new File(root, UUID.randomUUID() + ".part");
        File display = new File(root, UUID.randomUUID() + ".part"), thumbnail = new File(root, UUID.randomUUID() + ".part");
        Bitmap bitmap = null, small = null;
        try {
            if (root.getUsableSpace() < MAX_FILE * 2) throw new IOException("手机剩余空间不足，请先备份并释放空间");
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long size = 0;
            try (OutputStream out = new FileOutputStream(raw)) {
                byte[] buffer = new byte[65536]; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("导入已取消，已完成的照片仍保留");
                    size += count;
                    if (size > MAX_FILE) throw new IOException("单张原片不能超过 25MB");
                    digest.update(buffer, 0, count); out.write(buffer, 0, count);
                }
            }
            if (size == 0) throw new IOException("图片为空");
            StringBuilder hash = new StringBuilder(); for (byte b : digest.digest()) hash.append(String.format(Locale.ROOT, "%02x", b & 255));
            String id = "mobile-" + hash;
            if (expected != null && !id.equals(expected)) throw new IOException("备份原片校验失败");
            Record existing = find(id);
            if (existing != null) {
                if (existing.deleted && backup == null) { restore(id); return new ImportResult(id, "restored"); }
                return new ImportResult(id, "duplicate");
            }
            BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(raw.getPath(), bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || (long) bounds.outWidth * bounds.outHeight > 64000000) throw new IOException("图片无法解码或超过 6400 万像素；HEIC/AVIF 需要手机系统支持");
            ExifInterface exif = null;
            try { exif = new ExifInterface(raw.getPath()); } catch (IOException ignored) { }
            int orientation = exif == null ? 1 : exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, 1);
            bitmap = decode(raw, 2560, orientation);
            JSONObject photo = metadata(id, name, modified, exif, bitmap.getWidth(), bitmap.getHeight());
            small = scale(bitmap, 400);
            JSONArray palette = palette(small); photo.put("palette", palette); photo.put("dominantColor", palette.getString(0));
            photo.put("colorCategory", category(Color.parseColor(palette.getString(0))));
            if (backup != null) applyEdit(photo, backup.getJSONObject("photo"));
            saveJpeg(bitmap, display, 88); saveJpeg(small, thumbnail, 80);
            // Only complete, validated images receive a DB record. Startup cleans partial files.
            if (original(id).exists()) raw.delete(); else move(raw, original(id));
            move(display, image(id)); move(thumbnail, thumb(id));
            ContentValues values = new ContentValues(); values.put("id", id); values.put("metadata", photo.toString());
            values.put("original_name", trim(name, 200)); values.put("mime", trim(mime, 100));
            values.put("date", photo.getString("date"));
            values.put("deleted", backup != null && backup.optBoolean("deleted") ? 1 : 0);
            getWritableDatabase().insertOrThrow("photos", null, values);
            return new ImportResult(id, "imported");
        } finally {
            if (small != null && small != bitmap) small.recycle(); if (bitmap != null) bitmap.recycle();
            raw.delete(); display.delete(); thumbnail.delete();
        }
    }
    private static void move(File from, File to) throws IOException {
        if (!from.renameTo(to)) throw new IOException("保存手机相册文件失败");
    }
    private static void saveJpeg(Bitmap bitmap, File file, int quality) throws IOException {
        try (FileOutputStream out = new FileOutputStream(file)) {
            if (!bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)) throw new IOException("图片压缩失败");
            out.getFD().sync();
        }
    }
    private static Bitmap scale(Bitmap bitmap, int maximum) {
        double factor = Math.min(1, maximum / (double) Math.max(bitmap.getWidth(), bitmap.getHeight()));
        return Bitmap.createScaledBitmap(bitmap, Math.max(1, (int) (bitmap.getWidth() * factor)), Math.max(1, (int) (bitmap.getHeight() * factor)), true);
    }
    public static Bitmap decode(File file, int maximum, int orientation) throws IOException {
        BitmapFactory.Options opts = new BitmapFactory.Options(); opts.inJustDecodeBounds = true; BitmapFactory.decodeFile(file.getPath(), opts);
        opts.inJustDecodeBounds = false; opts.inSampleSize = 1;
        while (Math.max(opts.outWidth, opts.outHeight) / opts.inSampleSize > maximum) opts.inSampleSize *= 2;
        Bitmap decoded = BitmapFactory.decodeFile(file.getPath(), opts);
        if (decoded == null) throw new IOException("图片读取失败");
        Matrix matrix = new Matrix();
        switch (orientation) {
            case 2: matrix.setScale(-1, 1); break;
            case 3: matrix.setRotate(180); break;
            case 4: matrix.setScale(1, -1); break;
            case 5: matrix.setRotate(90); matrix.postScale(-1, 1); break;
            case 6: matrix.setRotate(90); break;
            case 7: matrix.setRotate(-90); matrix.postScale(-1, 1); break;
            case 8: matrix.setRotate(-90); break;
        }
        Bitmap rotated = Bitmap.createBitmap(decoded, 0, 0, decoded.getWidth(), decoded.getHeight(), matrix, true);
        if (rotated != decoded) decoded.recycle();
        Bitmap sized = scale(rotated, maximum); if (sized != rotated) rotated.recycle(); return sized;
    }
    private static String attribute(ExifInterface exif, String tag) { return exif == null ? "" : trim(exif.getAttribute(tag), 200); }
    private static String trim(String value, int max) { if (value == null) return ""; return value.trim().substring(0, Math.min(value.trim().length(), max)); }
    public static boolean validDate(String date) {
        if (date == null || !date.matches("\\d{4}-\\d{2}-\\d{2}")) return false;
        try { SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT); f.setLenient(false); return f.format(f.parse(date)).equals(date); } catch (Exception ignored) { return false; }
    }
    private static JSONObject metadata(String id, String name, long modified, ExifInterface exif, int width, int height) throws Exception {
        String date = attribute(exif, ExifInterface.TAG_DATETIME_ORIGINAL);
        if (date.isEmpty()) date = attribute(exif, ExifInterface.TAG_DATETIME);
        date = date.length() >= 10 ? date.substring(0, 10).replace(':', '-') : "";
        if (!validDate(date)) date = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date(modified > 0 ? modified : System.currentTimeMillis()));
        String camera = (attribute(exif, ExifInterface.TAG_MAKE) + " " + attribute(exif, ExifInterface.TAG_MODEL)).trim();
        JSONObject location = new JSONObject().put("name", "未知").put("lat", 0).put("lng", 0);
        float[] gps = new float[2];
        if (exif != null && exif.getLatLong(gps)) {
            double lat = Math.round(gps[0] * 100.0) / 100.0, lng = Math.round(gps[1] * 100.0) / 100.0;
            location.put("lat", lat).put("lng", lng).put("name", "拍摄地点 (" + lat + ", " + lng + ")");
        }
        double aperture = exif == null ? 0 : exif.getAttributeDouble(ExifInterface.TAG_F_NUMBER, 0);
        double exposure = exif == null ? 0 : exif.getAttributeDouble(ExifInterface.TAG_EXPOSURE_TIME, 0);
        int iso = exif == null ? 0 : Math.max(0, exif.getAttributeInt(ExifInterface.TAG_ISO_SPEED_RATINGS, 0));
        return new JSONObject().put("id", id).put("title", trim(name, 200).isEmpty() ? "未命名照片" : trim(name, 200))
            .put("url", "/photos/" + id + ".jpg").put("thumbnail", "/thumbnails/" + id + ".jpg").put("source", "static")
            .put("date", date).put("camera", camera.isEmpty() ? "未知" : trim(camera, 200)).put("lens", attribute(exif, "LensModel"))
            .put("iso", Math.min(iso, 10000000)).put("aperture", aperture > 0 ? "f/" + aperture : "")
            .put("shutter", exposure > 0 ? (exposure >= 1 ? exposure + "s" : "1/" + Math.round(1 / exposure) + "s") : "")
            .put("location", location).put("tags", new JSONArray()).put("width", width).put("height", height);
    }
    private static JSONArray palette(Bitmap bitmap) throws Exception {
        HashMap<Integer, Integer> counts = new HashMap<>();
        int step = Math.max(1, Math.min(bitmap.getWidth(), bitmap.getHeight()) / 80);
        for (int y = 0; y < bitmap.getHeight(); y += step) for (int x = 0; x < bitmap.getWidth(); x += step) {
            int c = bitmap.getPixel(x, y); if (Color.alpha(c) < 128) continue;
            int bucket = Color.rgb((Color.red(c) / 32) * 32 + 16, (Color.green(c) / 32) * 32 + 16, (Color.blue(c) / 32) * 32 + 16);
            counts.put(bucket, counts.getOrDefault(bucket, 0) + 1);
        }
        ArrayList<Integer> colors = new ArrayList<>(counts.keySet()); colors.sort((a, b) -> Integer.compare(counts.get(b), counts.get(a)));
        JSONArray palette = new JSONArray(); for (int i = 0; i < Math.min(4, colors.size()); i++) palette.put(String.format(Locale.ROOT, "#%06x", colors.get(i) & 0xffffff));
        if (palette.length() == 0) palette.put("#808080"); return palette;
    }
    static String category(int c) {
        double r = Color.red(c) / 255.0, g = Color.green(c) / 255.0, b = Color.blue(c) / 255.0;
        double max = Math.max(r, Math.max(g, b)), min = Math.min(r, Math.min(g, b)), delta = max - min, light = (max + min) / 2;
        double saturation = delta == 0 ? 0 : delta / (light > .5 ? 2 - max - min : max + min);
        if (saturation < .1) return light < .2 ? "black" : light > .8 ? "white" : "gray";
        double hue = max == r ? ((g - b) / delta + (g < b ? 6 : 0)) * 60 : max == g ? ((b - r) / delta + 2) * 60 : ((r - g) / delta + 4) * 60;
        if (hue >= 15 && hue < 45 && saturation < .5 && light < .5) return "brown";
        return hue < 15 || hue >= 345 ? "red" : hue < 45 ? "orange" : hue < 75 ? "yellow" : hue < 165 ? "green" : hue < 195 ? "cyan" : hue < 255 ? "blue" : hue < 285 ? "purple" : "pink";
    }
    private static void applyEdit(JSONObject photo, JSONObject edit) throws Exception {
        String title = trim(edit.getString("title"), 200), date = edit.getString("date");
        if (title.isEmpty() || !validDate(date)) throw new IOException("标题或拍摄日期不正确");
        JSONObject loc = edit.getJSONObject("location"); double lat = loc.getDouble("lat"), lng = loc.getDouble("lng");
        if (!Double.isFinite(lat) || !Double.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new IOException("经纬度不正确");
        JSONArray tags = edit.getJSONArray("tags"), safeTags = new JSONArray(); if (tags.length() > 20) throw new IOException("最多 20 个标签");
        for (int i = 0; i < tags.length(); i++) safeTags.put(trim(tags.getString(i), 40));
        photo.put("title", title).put("date", date).put("camera", trim(edit.getString("camera"), 200)).put("tags", safeTags)
            .put("location", new JSONObject().put("name", trim(loc.getString("name"), 100)).put("lat", Math.round(lat * 100) / 100.0).put("lng", Math.round(lng * 100) / 100.0));
    }
    public void edit(String id, JSONObject edit) throws Exception {
        Record record = find(id); if (record == null) throw new IOException("照片不存在");
        applyEdit(record.photo, edit); ContentValues values = new ContentValues(); values.put("metadata", record.photo.toString()); values.put("date", record.photo.getString("date"));
        getWritableDatabase().update("photos", values, "id=?", new String[]{id});
    }
    public void trash(String id) { ContentValues v = new ContentValues(); v.put("deleted", 1); getWritableDatabase().update("photos", v, "id=?", new String[]{safeId(id)}); }
    public void restore(String id) throws IOException {
        if (!original(id).isFile() || !image(id).isFile() || !thumb(id).isFile()) throw new IOException("本机文件不完整，请从备份恢复");
        ContentValues v = new ContentValues(); v.put("deleted", 0); getWritableDatabase().update("photos", v, "id=?", new String[]{safeId(id)});
    }
    public void erase(String id) throws Exception {
        Record row = find(id); if (row == null || !row.deleted) throw new IOException("只能永久删除回收站中的照片");
        for (File f : new File[]{original(id), image(id), thumb(id)}) if (f.exists() && !f.delete()) throw new IOException("无法删除本机副本");
        getWritableDatabase().delete("photos", "id=?", new String[]{safeId(id)});
    }
    public void exportZip(OutputStream output, boolean git) throws Exception {
        List<Record> active = list(false), records = new ArrayList<>(active); if (!git) records.addAll(list(true));
        JSONArray photos = new JSONArray(), album = new JSONArray();
        for (Record row : records) {
            if (!row.deleted) photos.put(row.photo);
            album.put(new JSONObject().put("id", row.id).put("photo", row.photo).put("name", row.name).put("mime", row.mime).put("deleted", row.deleted));
        }
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            put(zip, "album.json", new JSONObject().put("format", "hhs-offline-v1").put("records", album).toString().getBytes(StandardCharsets.UTF_8));
            put(zip, "data/photos.json", new JSONObject().put("photos", photos).toString().getBytes(StandardCharsets.UTF_8));
            put(zip, "data/removed-photos.json", "[]".getBytes(StandardCharsets.UTF_8));
            for (Record row : records) {
                if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("导出取消，未完成的 ZIP 不可用于恢复");
                if (!git) put(zip, "originals/" + row.id + ".original", original(row.id));
                if (!row.deleted || !git) { put(zip, "public/photos/" + row.id + ".jpg", image(row.id)); put(zip, "public/thumbnails/" + row.id + ".jpg", thumb(row.id)); }
            }
        }
    }
    private static void put(ZipOutputStream zip, String name, byte[] bytes) throws IOException { zip.putNextEntry(new ZipEntry(name)); zip.write(bytes); zip.closeEntry(); }
    private static void put(ZipOutputStream zip, String name, File file) throws IOException {
        zip.putNextEntry(new ZipEntry(name)); try (InputStream input = new FileInputStream(file)) { byte[] b = new byte[65536]; int n; while ((n = input.read(b)) != -1) zip.write(b, 0, n); } zip.closeEntry();
    }
    public String restoreZip(InputStream input, Progress progress) throws Exception {
        HashMap<String, JSONObject> records = new HashMap<>(); Set<String> seen = new HashSet<>();
        int imported = 0, duplicate = 0;
        try (ZipInputStream zip = new ZipInputStream(input)) {
            ZipEntry first = zip.getNextEntry(); if (first == null || !first.getName().equals("album.json")) throw new IOException("不是光影视界备份包");
            ByteArrayOutputStream bytes = new ByteArrayOutputStream(); copyLimited(zip, bytes, 16L * 1024 * 1024);
            JSONObject manifest = new JSONObject(bytes.toString("UTF-8"));
            if (!manifest.getString("format").equals("hhs-offline-v1")) throw new IOException("不支持此备份版本");
            JSONArray rows = manifest.getJSONArray("records"); if (rows.length() > 10000) throw new IOException("备份超过 10000 张照片，请分批恢复");
            for (int i = 0; i < rows.length(); i++) { JSONObject row = rows.getJSONObject(i); String id = safeId(row.getString("id")); if (records.put(id, row) != null) throw new IOException("备份照片 ID 重复"); }
            ZipEntry entry; int entries = 0;
            while ((entry = zip.getNextEntry()) != null) {
                if (++entries > 30002) throw new IOException("备份文件数量超出限制");
                String name = entry.getName();
                if (name.matches("originals/mobile-[a-f0-9]{64}\\.original")) {
                    String id = name.substring(10, name.length() - 9); JSONObject row = records.get(id);
                    if (row == null || !seen.add(id)) throw new IOException("备份原片记录不匹配");
                    ImportResult result = importPhoto(zip, row.optString("name"), row.optString("mime"), 0, id, row);
                    if (result.status.equals("duplicate")) duplicate++; else imported++;
                    progress.update(imported + duplicate, "恢复 " + (imported + duplicate) + " / " + records.size());
                } else {
                    if (!name.matches("data/(photos|removed-photos)\\.json|public/(photos|thumbnails)/mobile-[a-f0-9]{64}\\.jpg")) throw new IOException("备份含未知文件，已停止；完成的照片仍保留");
                    copyLimited(zip, null, MAX_FILE);
                }
                zip.closeEntry();
            }
            if (seen.size() != records.size()) throw new IOException("备份原片不完整；已恢复部分仍保留。Git 导出包不能代替完整备份");
        }
        return "已恢复 " + imported + " 张，重复跳过 " + duplicate + " 张（不覆盖已有编辑）";
    }
    private static void copyLimited(InputStream input, OutputStream output, long limit) throws IOException {
        byte[] b = new byte[65536]; int n; long total = 0;
        while ((n = input.read(b)) != -1) {
            if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("操作已取消");
            total += n; if (total > limit) throw new IOException("备份文件超过大小限制"); if (output != null) output.write(b, 0, n);
        }
    }
}
