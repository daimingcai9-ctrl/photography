package com.hhs.photography;

import android.content.ContentValues;
import android.content.Context;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.os.Build;
import android.provider.MediaStore;
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
    private final ContentResolver resolver;
    private final Context context;
    private final CityIndex cities;
    public static final class Record {
        public final String id, name, mime, sourceUri;
        public final JSONObject photo;
        public final boolean deleted;
        Record(Cursor c) throws Exception {
            id = c.getString(0); photo = new JSONObject(c.getString(1)); name = c.getString(2);
            mime = c.getString(3); deleted = c.getInt(4) != 0; sourceUri = c.getString(5);
        }
        public boolean referenced() { return !sourceUri.isEmpty(); }
    }
    public static final class ImportResult {
        public final String id, status;
        ImportResult(String id, String status) { this.id = id; this.status = status; }
    }
    public interface Progress { void update(int done, String message); }

    public PhotoStore(Context context) throws IOException { this(context, "main"); }
    PhotoStore(Context context, String library) throws IOException {
        this(context, library, true);
    }
    PhotoStore(Context context, String library, boolean cleanup) throws IOException {
        super(context, "offline-" + library + ".db", null, 2);
        resolver = context.getContentResolver();
        this.context = context.getApplicationContext();
        cities = new CityIndex(this.context);
        root = new File(context.getNoBackupFilesDir(), "album-" + library);
        if (!root.isDirectory() && !root.mkdirs()) throw new IOException("无法创建手机相册存储");
        getWritableDatabase();
        File[] files = root.listFiles();
        if (cleanup && files != null) for (File f : files) if (f.getName().endsWith(".part")) f.delete();
    }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE photos(id TEXT PRIMARY KEY, metadata TEXT NOT NULL, original_name TEXT NOT NULL, mime TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, date TEXT NOT NULL, source_uri TEXT NOT NULL DEFAULT '')");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // An empty URI keeps v1 originals in place. Never discard existing private photos.
        if (oldVersion < 2) db.execSQL("ALTER TABLE photos ADD COLUMN source_uri TEXT NOT NULL DEFAULT ''");
    }
    private String safeId(String id) {
        if (!id.matches("mobile-[a-f0-9]{64}")) throw new IllegalArgumentException("照片 ID 不正确");
        return id;
    }
    public File original(String id) { return new File(root, safeId(id) + ".original"); }
    public File image(String id) { return new File(root, safeId(id) + ".jpg"); }
    public File thumb(String id) { return new File(root, safeId(id) + ".thumb.jpg"); }
    public List<Record> list(boolean deleted) throws Exception {
        ArrayList<Record> rows = new ArrayList<>();
        try (Cursor c = getReadableDatabase().rawQuery("SELECT id,metadata,original_name,mime,deleted,source_uri FROM photos WHERE deleted=? ORDER BY date DESC, rowid DESC", new String[]{deleted ? "1" : "0"})) {
            while (c.moveToNext()) { Record row=new Record(c); resolveAutomaticName(row.photo); rows.add(row); }
        }
        return rows;
    }
    public Record find(String id) throws Exception {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT id,metadata,original_name,mime,deleted,source_uri FROM photos WHERE id=?", new String[]{safeId(id)})) {
            if(!c.moveToFirst()) return null;
            Record row=new Record(c); resolveAutomaticName(row.photo); return row;
        }
    }
    public long bytes() { long n = 0; File[] files = root.listFiles(); if (files != null) for (File f : files) n += f.length(); return n; }

    public ImportResult importPhoto(InputStream input, String name, String mime, long modified) throws Exception {
        return importPhoto(input, name, mime, modified, null, null, null);
    }
    public ImportResult importReference(Uri uri, String name, String mime, long modified) throws Exception {
        requireGrant(uri);
        try (InputStream input = openUri(uri)) { return importPhoto(input, name, mime, modified, null, null, uri); }
    }
    public ImportResult relinkReference(String id, Uri uri, String name, String mime, long modified) throws Exception {
        Record row = find(id);
        if (row == null || row.deleted || !row.referenced()) throw new IOException("只能重新关联当前引用的原图");
        requireGrant(uri);
        try (InputStream input = openUri(uri)) { return importPhoto(input, name, mime, modified, id, null, uri); }
    }
    private void requireGrant(Uri uri) throws IOException {
        if (!"content".equals(uri.getScheme())) throw new IOException("仅支持系统提供者的原图引用");
        for (android.content.UriPermission grant : resolver.getPersistedUriPermissions())
            if (grant.isReadPermission() && grant.getUri().equals(uri)) return;
        throw new IOException("原图长期授权已失效，请在相册/文件选择器重新选择这张原图");
    }
    private InputStream openUri(Uri uri) throws IOException {
        requireGrant(uri);
        try {
            InputStream input = resolver.openInputStream(uri);
            if (input == null) throw new IOException("提供者无法读取原图");
            return input;
        } catch (SecurityException error) { throw new IOException("原图授权已失效，请重新选择原图", error); }
    }
    public boolean usesUri(Uri uri) {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT 1 FROM photos WHERE source_uri=? LIMIT 1", new String[]{uri.toString()})) { return c.moveToFirst(); }
    }
    public void releaseUnused(Uri uri) {
        if (!usesUri(uri)) try { resolver.releasePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (SecurityException ignored) { }
    }
    private InputStream openOriginal(Record row) throws IOException {
        return row.referenced() ? openUri(Uri.parse(row.sourceUri)) : new FileInputStream(original(row.id));
    }
    public boolean sourceAvailable(Record row) {
        try (InputStream input = openOriginal(row)) { return input.read() != -1; } catch (IOException | SecurityException error) { return false; }
    }
    public Bitmap decodeOriginal(Record row, int maximum) throws IOException {
        Source source = () -> openOriginal(row);
        ExifInterface exif = readExif(source);
        return decode(source, maximum, exif == null ? 1 : exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, 1));
    }
    private static final class LocationRead {
        final JSONObject location; final String status;
        LocationRead(JSONObject location,String status) { this.location=location; this.status=status; }
    }
    private LocationRead locationRead(Uri uri) throws Exception {
        // Read GPS separately: never swap/hash a different URI or mutate the original reference.
        if (Build.VERSION.SDK_INT >= 29 && context.checkSelfPermission(android.Manifest.permission.ACCESS_MEDIA_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            try {
                Uri media = "media".equals(uri.getAuthority()) ? uri : MediaStore.getMediaUri(context, uri);
                // Photo picker URIs don't support requireOriginal on older systems.
                if (media != null && media.getPath() != null && !media.getPath().contains("/picker")) {
                    try (InputStream input = resolver.openInputStream(MediaStore.setRequireOriginal(media))) {
                        if (input != null) {
                            JSONObject location=gpsLocation(new ExifInterface(input));
                            // A readable metadata stream is NOT proof that it contains GPS.
                            if (location!=null) return new LocationRead(location,"available");
                        }
                    }
                }
            } catch (IOException | SecurityException | IllegalArgumentException | UnsupportedOperationException ignored) { /* Provider may only expose selected/redacted data. */ }
        }
        try (InputStream input=openUri(uri)) {
            JSONObject location;
            try { location=gpsLocation(new ExifInterface(input)); } catch(IOException | IllegalArgumentException malformed) { location=null; }
            if(location!=null) return new LocationRead(location,"available");
        } catch(IOException | SecurityException unavailable) { return new LocationRead(null,"source-unavailable"); }
        boolean permission=Build.VERSION.SDK_INT<29 || context.checkSelfPermission(android.Manifest.permission.ACCESS_MEDIA_LOCATION)==android.content.pm.PackageManager.PERMISSION_GRANTED;
        return new LocationRead(null,!permission ? "permission-required" : uri.getPath()!=null&&uri.getPath().contains("/picker") ? "picker-redacted" : "not-provided");
    }
    private static JSONObject gpsLocation(ExifInterface exif) throws Exception {
        float[] gps = new float[2];
        try {
            if (exif == null || !exif.getLatLong(gps) || !Float.isFinite(gps[0]) || !Float.isFinite(gps[1]) || Math.abs(gps[0]) > 90 || Math.abs(gps[1]) > 180 || (gps[0]==0 && gps[1]==0)) return null;
        } catch(IllegalArgumentException malformed) { return null; }
        double lat = Math.round(gps[0] * 100.0) / 100.0, lng = Math.round(gps[1] * 100.0) / 100.0;
        return new JSONObject().put("lat",lat).put("lng",lng).put("name","拍摄地点 (" + lat + ", " + lng + ")");
    }
    public boolean refreshLocation(String id) throws Exception {
        Record row = find(id); if (row == null || row.deleted) throw new IOException("照片不存在");
        LocationRead result=row.referenced() ? locationRead(Uri.parse(row.sourceUri)) : new LocationRead(gpsLocation(readExif(() -> openOriginal(row))),sourceAvailable(row)?"not-provided":"source-unavailable");
        row.photo.put("gpsStatus",result.location!=null ? "available" : result.status);
        if(result.location!=null) { resolveCity(result.location); row.photo.put("location",result.location).put("locationOrigin","exif"); }
        // Persist the diagnostic, but never erase a manual location when GPS is missing/redacted.
        ContentValues values = new ContentValues(); values.put("metadata",row.photo.toString());
        getWritableDatabase().update("photos",values,"id=?",new String[]{id}); return result.location!=null;
    }
    private void resolveCity(JSONObject location) throws Exception {
        String city=cities.name(location.getDouble("lat"),location.getDouble("lng"));
        if(city!=null) location.put("name",city);
    }
    private void resolveAutomaticName(JSONObject photo) throws Exception {
        JSONObject location=photo.getJSONObject("location"); String name=location.optString("name");
        if(!"manual".equals(photo.optString("locationOrigin")) && (name.isEmpty()||name.equals("未知")||name.startsWith("拍摄地点 ("))) resolveCity(location);
    }
    private ImportResult importPhoto(InputStream input, String name, String mime, long modified, String expected, JSONObject backup, Uri uri) throws Exception {
        File raw = new File(root, UUID.randomUUID() + ".part");
        File display = new File(root, UUID.randomUUID() + ".part"), thumbnail = new File(root, UUID.randomUUID() + ".part");
        Bitmap bitmap = null, small = null;
        try {
            if (root.getUsableSpace() < MAX_FILE * 2) throw new IOException("手机剩余空间不足，请先备份并释放空间");
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long size = 0;
            try (OutputStream out = uri == null ? new FileOutputStream(raw) : null) {
                byte[] buffer = new byte[65536]; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("导入已取消，已完成的照片仍保留");
                    size += count;
                    if (size > MAX_FILE) throw new IOException("单张原片不能超过 25MB");
                    digest.update(buffer, 0, count); if (out != null) out.write(buffer, 0, count);
                }
            }
            if (size == 0) throw new IOException("图片为空");
            StringBuilder hash = new StringBuilder(); for (byte b : digest.digest()) hash.append(String.format(Locale.ROOT, "%02x", b & 255));
            String id = "mobile-" + hash;
            if (expected != null && !id.equals(expected)) throw new IOException(uri == null ? "备份原片校验失败" : "所选图片不是同一张原图，未替换引用或新建照片；请重新选择原文件");
            Record existing = find(id);
            if (existing != null) {
                // Re-selecting the same bytes repairs a missing/revoked reference without
                // replacing edits. Legacy private copies are deliberately NOT removed.
                if (uri != null && existing.referenced()) {
                    ContentValues link = new ContentValues(); link.put("source_uri", uri.toString());
                    getWritableDatabase().update("photos", link, "id=?", new String[]{id});
                    if (!existing.sourceUri.equals(uri.toString())) releaseUnused(Uri.parse(existing.sourceUri));
                }
                if (existing.deleted && backup == null) { restore(id); return new ImportResult(id, "restored"); }
                return new ImportResult(id, "duplicate");
            }
            Source source = uri == null ? () -> new FileInputStream(raw) : () -> openUri(uri);
            ExifInterface exif = readExif(source);
            int orientation = exif == null ? 1 : exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, 1);
            bitmap = decode(source, 2560, orientation);
            JSONObject photo = metadata(id, name, modified, exif, bitmap.getWidth(), bitmap.getHeight());
            if (uri != null) {
                LocationRead result=locationRead(uri); photo.put("gpsStatus",result.status);
                if(result.location!=null) photo.put("location",result.location);
            }
            JSONObject location=photo.getJSONObject("location");
            if(location.optDouble("lat")!=0 || location.optDouble("lng")!=0) {
                resolveCity(location); photo.put("gpsStatus","available").put("locationOrigin","exif");
            } else if(!photo.has("gpsStatus")) photo.put("gpsStatus","not-provided");
            small = scale(bitmap, 400);
            JSONArray palette = palette(small); photo.put("palette", palette); photo.put("dominantColor", palette.getString(0));
            photo.put("colorCategory", category(Color.parseColor(palette.getString(0))));
            if (backup != null) {
                JSONObject saved=backup.getJSONObject("photo"); applyEdit(photo,saved);
                photo.put("locationOrigin",saved.optString("locationOrigin","manual"));
                if(saved.has("gpsStatus")) photo.put("gpsStatus",saved.getString("gpsStatus"));
            }
            saveJpeg(bitmap, display, 88); saveJpeg(small, thumbnail, 80);
            // Only complete, validated images receive a DB record. Startup cleans partial files.
            if (uri == null) { if (original(id).exists()) raw.delete(); else move(raw, original(id)); }
            move(display, image(id)); move(thumbnail, thumb(id));
            ContentValues values = new ContentValues(); values.put("id", id); values.put("metadata", photo.toString());
            values.put("original_name", trim(name, 200)); values.put("mime", trim(mime, 100));
            values.put("date", photo.getString("date"));
            values.put("source_uri", uri == null ? "" : uri.toString());
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
        return decode(() -> new FileInputStream(file), maximum, orientation);
    }
    private interface Source { InputStream open() throws IOException; }
    private static ExifInterface readExif(Source source) {
        try (InputStream input = source.open()) { return new ExifInterface(input); } catch (IOException ignored) { return null; }
    }
    private static Bitmap decode(Source source, int maximum, int orientation) throws IOException {
        BitmapFactory.Options opts = new BitmapFactory.Options(); opts.inJustDecodeBounds = true;
        try (InputStream input = source.open()) { BitmapFactory.decodeStream(input, null, opts); }
        if (opts.outWidth <= 0 || opts.outHeight <= 0 || (long) opts.outWidth * opts.outHeight > 64000000) throw new IOException("图片无法解码或超过 6400 万像素；HEIC/AVIF 需要手机系统支持");
        opts.inJustDecodeBounds = false; opts.inSampleSize = 1;
        while (Math.max(opts.outWidth, opts.outHeight) / opts.inSampleSize > maximum) opts.inSampleSize *= 2;
        Bitmap decoded;
        try (InputStream input = source.open()) { decoded = BitmapFactory.decodeStream(input, null, opts); }
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
        JSONObject gps = gpsLocation(exif); if (gps != null) location = gps;
        double aperture = exif == null ? 0 : exif.getAttributeDouble(ExifInterface.TAG_F_NUMBER, 0);
        double exposure = exif == null ? 0 : exif.getAttributeDouble(ExifInterface.TAG_EXPOSURE_TIME, 0);
        int iso = exif == null ? 0 : Math.max(0, exif.getAttributeInt(ExifInterface.TAG_ISO_SPEED_RATINGS, 0));
        // Keep the website export schema, without turning a numeric filename into a display title.
        return new JSONObject().put("id", id).put("title", "照片")
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
        JSONObject before=record.photo.getJSONObject("location");
        applyEdit(record.photo, edit);
        JSONObject after=record.photo.getJSONObject("location");
        if(!before.optString("name").equals(after.optString("name")) || before.optDouble("lat")!=after.optDouble("lat") || before.optDouble("lng")!=after.optDouble("lng")) record.photo.put("locationOrigin","manual");
        ContentValues values = new ContentValues(); values.put("metadata", record.photo.toString()); values.put("date", record.photo.getString("date"));
        getWritableDatabase().update("photos", values, "id=?", new String[]{id});
    }
    public void trash(String id) { ContentValues v = new ContentValues(); v.put("deleted", 1); getWritableDatabase().update("photos", v, "id=?", new String[]{safeId(id)}); }
    public void restore(String id) throws IOException {
        if (!image(id).isFile() || !thumb(id).isFile()) throw new IOException("展示缓存不完整，请从备份恢复");
        ContentValues v = new ContentValues(); v.put("deleted", 0); getWritableDatabase().update("photos", v, "id=?", new String[]{safeId(id)});
    }
    public void erase(String id) throws Exception {
        Record row = find(id); if (row == null || !row.deleted) throw new IOException("只能永久删除回收站中的照片");
        for (File f : new File[]{original(id), image(id), thumb(id)}) if (f.exists() && !f.delete()) throw new IOException("无法删除本机副本");
        getWritableDatabase().delete("photos", "id=?", new String[]{safeId(id)});
        if (row.referenced()) releaseUnused(Uri.parse(row.sourceUri));
    }
    public void exportZip(OutputStream output, boolean git) throws Exception {
        List<Record> active = list(false), records = new ArrayList<>(active); if (!git) records.addAll(list(true));
        JSONArray photos = new JSONArray(), album = new JSONArray();
        for (Record row : records) {
            if (!git && !sourceAvailable(row)) throw new IOException("原图不可用：" + row.photo.optString("title") + "；请重新选择原图后再备份（不能用展示缓存冒充原片）");
            if (!row.deleted) photos.put(row.photo);
            album.put(new JSONObject().put("id", row.id).put("photo", row.photo).put("name", row.name).put("mime", row.mime).put("deleted", row.deleted));
        }
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            put(zip, "album.json", new JSONObject().put("format", "hhs-offline-v1").put("records", album).toString().getBytes(StandardCharsets.UTF_8));
            put(zip, "data/photos.json", new JSONObject().put("photos", photos).toString().getBytes(StandardCharsets.UTF_8));
            put(zip, "data/removed-photos.json", "[]".getBytes(StandardCharsets.UTF_8));
            for (Record row : records) {
                if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("导出取消，未完成的 ZIP 不可用于恢复");
                if (!git) putOriginal(zip, row);
                if (!row.deleted || !git) { put(zip, "public/photos/" + row.id + ".jpg", image(row.id)); put(zip, "public/thumbnails/" + row.id + ".jpg", thumb(row.id)); }
            }
        }
    }
    private static void put(ZipOutputStream zip, String name, byte[] bytes) throws IOException { zip.putNextEntry(new ZipEntry(name)); zip.write(bytes); zip.closeEntry(); }
    private void putOriginal(ZipOutputStream zip, Record row) throws Exception {
        zip.putNextEntry(new ZipEntry("originals/" + row.id + ".original"));
        MessageDigest digest = MessageDigest.getInstance("SHA-256"); long size = 0;
        try (InputStream input = openOriginal(row)) {
            byte[] b = new byte[65536]; int n;
            while ((n = input.read(b)) != -1) {
                if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("备份已取消");
                size += n; if (size > MAX_FILE) throw new IOException("原图超过 25MB 限制");
                digest.update(b, 0, n); zip.write(b, 0, n);
            }
        }
        StringBuilder hash = new StringBuilder(); for (byte b : digest.digest()) hash.append(String.format(Locale.ROOT, "%02x", b & 255));
        if (!row.id.equals("mobile-" + hash)) throw new IOException("原图内容已改变：" + row.photo.optString("title") + "；备份不完整，请重新导入原图");
        zip.closeEntry();
    }
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
                    ImportResult result = importPhoto(zip, row.optString("name"), row.optString("mime"), 0, id, row, null);
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
