package com.hhs.photography;

import android.app.Activity;
import android.app.AlertDialog;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.provider.MediaStore;
import android.text.Editable;
import android.text.TextWatcher;
import android.util.LruCache;
import android.view.View;
import android.view.ViewGroup;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native, offline-first library. Opening the public website is an explicit external action. */
public final class MainActivity extends Activity {
    private static final int PICK = 100, BACKUP = 101, GIT = 102, RESTORE = 103, FILES = 104;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final LruCache<String, Bitmap> thumbs = new LruCache<String, Bitmap>(12 * 1024 * 1024) {
        @Override protected int sizeOf(String key, Bitmap value) { return value.getAllocationByteCount(); }
    };
    private PhotoStore store;
    private LinearLayout root;
    private GridView grid;
    private TextView status, stats;
    private EditText search;
    private Spinner colors;
    private ProgressBar progress;
    private final List<Button> controls = new ArrayList<>();
    private List<PhotoStore.Record> all = new ArrayList<>(), shown = new ArrayList<>();
    private boolean busy, detail;
    private String color = "";
    private final String[] colorIds = {"", "red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink", "brown", "gray", "black", "white"};

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        try { store = new PhotoStore(this); }
        catch (Exception error) { new AlertDialog.Builder(this).setMessage("无法打开手机相册：" + message(error)).setPositiveButton("关闭", (d, w) -> finish()).show(); return; }
        root = column();
        root.setBackgroundColor(Color.rgb(9, 9, 11));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(dp(12) + insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                dp(12) + insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        setContentView(root);
        showLibrary();
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
            android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::back);
    }
    private int dp(int n) { return (int) (getResources().getDisplayMetrics().density * n); }
    private LinearLayout column() { LinearLayout v = new LinearLayout(this); v.setOrientation(LinearLayout.VERTICAL); return v; }
    private TextView text(String value, int size) {
        TextView v = new TextView(this); v.setText(value); v.setTextColor(Color.WHITE); v.setTextSize(size); v.setPadding(dp(4), dp(8), dp(4), dp(8)); return v;
    }
    private Button button(String label, Runnable action) {
        Button b = new Button(this); b.setText(label); b.setTextSize(13); b.setOnClickListener(v -> action.run()); return b;
    }
    private void control(LinearLayout row, String label, Runnable action) {
        Button b = button(label, action); controls.add(b); row.addView(b, new LinearLayout.LayoutParams(0, dp(50), 1));
    }
    private void showLibrary() {
        detail = false; root.removeAllViews(); controls.clear();
        root.addView(text("光影视界 · 手机离线相册", 23));
        TextView hint = text("引用手机原图 · 私人信息与缓存 · 不自动发布", 12); hint.setTextColor(Color.LTGRAY); root.addView(hint);
        LinearLayout row = new LinearLayout(this);
        control(row, "相册多选导入", () -> pick(PICK));
        control(row, "回收站", this::trash);
        control(row, "更多 / 备份", this::menu);
        root.addView(row);
        search = new EditText(this); search.setSingleLine(true); search.setHint("搜索标题、日期、地点、设备或标签"); search.setTextColor(Color.WHITE); search.setHintTextColor(Color.GRAY);
        root.addView(search);
        colors = new Spinner(this);
        colors.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, new String[]{"全部色彩", "红", "橙", "黄", "绿", "青", "蓝", "紫", "粉", "棕", "灰", "黑", "白"}));
        root.addView(colors);
        stats = text("", 12); root.addView(stats);
        status = text("新导入只引用原图，保留展示缓存；请勿删除系统原片。", 12); status.setTextColor(Color.LTGRAY); root.addView(status);
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal); progress.setVisibility(View.GONE); root.addView(progress);
        grid = new GridView(this); grid.setNumColumns(getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE ? 4 : 2);
        grid.setHorizontalSpacing(dp(8)); grid.setVerticalSpacing(dp(8));
        root.addView(grid, new LinearLayout.LayoutParams(-1, 0, 1));
        grid.setOnItemClickListener((parent, view, position, id) -> { if (!busy) showPhoto(shown.get(position)); });
        search.addTextChangedListener(new TextWatcher() { public void beforeTextChanged(CharSequence s,int start,int count,int after){} public void onTextChanged(CharSequence s,int start,int before,int count){ filter(); } public void afterTextChanged(Editable e){} });
        colors.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) { color = colorIds[position]; filter(); }
            public void onNothingSelected(AdapterView<?> parent) {}
        });
        load();
    }
    private void load() {
        worker.execute(() -> {
            try {
                List<PhotoStore.Record> rows = store.list(false); long bytes = store.bytes();
                ui(() -> {
                    if (detail) return; all = rows; Set<String> cameras = new HashSet<>(), places = new HashSet<>();
                    for (PhotoStore.Record row : rows) {
                        String c = row.photo.optString("camera"); if (!c.equals("未知")) cameras.add(c);
                        JSONObject loc = row.photo.optJSONObject("location"); if (loc != null && !loc.optString("name").equals("未知")) places.add(loc.optString("name"));
                    }
                    int references = 0; for (PhotoStore.Record row : rows) if (row.referenced()) references++;
                    stats.setText(rows.size() + " 张（引用 " + references + "）· " + cameras.size() + " 台设备 · " + places.size() + " 个地点 · 应用缓存/旧副本 " + String.format(Locale.ROOT, "%.1f MB", bytes / 1048576.0));
                    filter();
                });
            } catch (Exception error) { ui(() -> alert("读取失败", message(error))); }
        });
    }
    private void filter() {
        if (grid == null || search == null) return;
        String q = search.getText().toString().trim().toLowerCase(Locale.ROOT);
        shown = new ArrayList<>();
        for (PhotoStore.Record row : all) {
            JSONObject p = row.photo;
            if ((color.isEmpty() || color.equals(p.optString("colorCategory"))) && p.toString().toLowerCase(Locale.ROOT).contains(q)) shown.add(row);
        }
        grid.setAdapter(new BaseAdapter() {
            public int getCount() { return shown.size(); }
            public Object getItem(int p) { return shown.get(p); }
            public long getItemId(int p) { return p; }
            public View getView(int position, View recycled, ViewGroup parent) {
                PhotoStore.Record record = shown.get(position);
                LinearLayout tile; ImageView image; TextView label;
                if (recycled instanceof LinearLayout) { tile = (LinearLayout) recycled; image = (ImageView) tile.getChildAt(0); label = (TextView) tile.getChildAt(1); }
                else {
                    tile = column(); tile.setBackgroundColor(Color.rgb(27,27,30));
                    image = new ImageView(MainActivity.this); image.setScaleType(ImageView.ScaleType.CENTER_CROP);
                    tile.addView(image, new LinearLayout.LayoutParams(-1, dp(150)));
                    label = text("", 12); label.setMaxLines(2); tile.addView(label);
                }
                image.setContentDescription(record.photo.optString("title"));
                label.setText(record.photo.optString("title") + "\n" + record.photo.optString("date"));
                image.setTag(record.id); Bitmap cached = thumbs.get(record.id); image.setImageBitmap(cached);
                if (cached == null) {
                    ImageView target = image;
                    worker.execute(() -> {
                        try {
                            Bitmap bitmap = thumbs.get(record.id);
                            if (bitmap == null) { bitmap = PhotoStore.decode(store.thumb(record.id), 400, 1); thumbs.put(record.id, bitmap); }
                            Bitmap result = bitmap; ui(() -> { if (record.id.equals(target.getTag())) target.setImageBitmap(result); });
                        } catch (Exception ignored) {}
                    });
                }
                return tile;
            }
        });
    }
    private void pick(int request) {
        if (busy) return;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
        boolean photos = request == PICK || request == FILES;
        intent.setType(photos ? "image/*" : "*/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, photos);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        if (request == PICK && Build.VERSION.SDK_INT >= 33) {
            Intent album = new Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*")
                .putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, Math.min(100, MediaStore.getPickImagesMaxLimit()));
            if (album.resolveActivity(getPackageManager()) != null) intent = album;
        }
        try { startActivityForResult(intent, request); } catch (Exception error) { alert("无法打开系统选择器", "请使用手机系统的文件或相册提供者。"); }
    }
    private void export(int request) {
        if (busy) return;
        String warning = request == GIT ? "导出包只包含当前照片的展示图和网站元数据，不包含原片，也不是完整备份。它不会自动提交 Git；以后发布到网站会公开这些照片。"
            : "这次备份会读取引用的原图并复制进 ZIP，含编辑信息和回收站；日常导入不复制原片。原图缺失或授权失效会中止，不会用缓存冒充原片。ZIP 未加密，可能含精确 GPS。恢复到应用会创建独立副本，不恢复原相册引用。";
        new AlertDialog.Builder(this).setTitle(request == GIT ? "导出 Git 发布包" : "导出完整备份").setMessage(warning).setNegativeButton("取消", null).setPositiveButton("选择保存位置", (d, w) -> {
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/zip");
            intent.putExtra(Intent.EXTRA_TITLE, request == GIT ? "hhs-git-photos.zip" : "hhs-album-" + System.currentTimeMillis() + ".zip");
            try { startActivityForResult(intent, request); } catch (Exception error) { alert("无法导出", message(error)); }
        }).show();
    }
    private void menu() {
        if (busy) return;
        new AlertDialog.Builder(this).setTitle("私人相册").setItems(new String[]{"导出完整备份（含原片）", "恢复备份（合并，不覆盖已有照片）", "导出 Git 发布包", "打开公开网站", "使用说明", "从文件选择器引用原图（相册授权失败时）"}, (d, which) -> {
            if (which == 0) export(BACKUP); else if (which == 1) pick(RESTORE); else if (which == 2) export(GIT);
            else if (which == 3) { try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://photography-hhs.pages.dev/gallery"))); } catch (Exception error) { alert("无法打开浏览器", message(error)); } }
            else if (which == 5) pick(FILES);
            else alert("使用说明", "新导入只保存系统原图的长期读取引用、图片信息和展示/缩略图缓存，不保存原片副本。原图仍在原来的相册，删除/移动原图或撤销授权可能失联；详情会提示并可重新选择同一原图。只在云端的照片取决于提供者，不保证断网可读原片。\n\n一次最多 100 张，单张最大 25MB / 6400 万像素；HEIC 取决于系统支持。授权失败时可用更多中的文件选择器；不会偷偷切回复制模式。导入期间保持应用打开。\n\n旧版导入/备份恢复的独立原片副本继续保留，不自动删照片。回收站只管理应用记录和缓存，不会删除系统原片。\n\n完整备份会复制可读取的原片进 ZIP；恢复会存入应用私有目录。卸载或清除数据会删除引用、编辑和缓存/旧副本，但不会删除系统相册原图。Git 导出接口保留，不自动公开。");
        }).show();
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (result != RESULT_OK || data == null || busy || store == null) return;
        if (request == PICK || request == FILES) {
            LinkedHashSet<Uri> selected = new LinkedHashSet<>();
            if (data.getClipData() != null) for (int i = 0; i < data.getClipData().getItemCount() && selected.size() < 100; i++) selected.add(data.getClipData().getItemAt(i).getUri());
            else if (data.getData() != null) selected.add(data.getData());
            if (!selected.isEmpty()) importSelected(new ArrayList<>(selected));
        } else if ((request == BACKUP || request == GIT || request == RESTORE) && data.getData() != null) {
            Uri uri = data.getData(); setBusy(true, request == RESTORE ? "正在恢复…" : "正在导出…");
            worker.execute(() -> {
                String outcome;
                try {
                    if (request == RESTORE) try (InputStream input = getContentResolver().openInputStream(uri)) {
                        if (input == null) throw new IOException("无法读取备份");
                        outcome = store.restoreZip(input, (done, msg) -> ui(() -> status.setText(msg)));
                    } else try (OutputStream output = getContentResolver().openOutputStream(uri, "w")) {
                        if (output == null) throw new IOException("无法写入保存位置"); store.exportZip(output, request == GIT);
                        outcome = "导出完成。请妥善保管文件；Git 包尚未发布。";
                    }
                } catch (Exception error) { outcome = "操作未全部完成：" + message(error) + "。未完成的 ZIP 不可作为备份；已恢复照片仍保留。"; }
                String message = outcome; ui(() -> { setBusy(false, message); load(); alert("结果", message); });
            });
        }
    }
    private void importSelected(List<Uri> uris) {
        setBusy(true, "正在读取照片…");
        worker.execute(() -> {
            int saved = 0, duplicates = 0, restored = 0; ArrayList<String> errors = new ArrayList<>(); int done = 0;
            for (Uri uri : uris) {
                if (Thread.currentThread().isInterrupted()) break;
                String name = "照片"; long modified = 0;
                try {
                    if (!"content".equals(uri.getScheme())) throw new IOException("只允许系统相册或文件提供者的照片");
                    try { getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION); }
                    catch (SecurityException error) { throw new IOException("选择器不支持长期读取授权，请用更多 → 从文件选择器引用原图", error); }
                    try (Cursor c = getContentResolver().query(uri, null, null, null, null)) {
                        if (c != null && c.moveToFirst()) {
                            int n = c.getColumnIndex(OpenableColumns.DISPLAY_NAME), m = c.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED);
                            if (n >= 0) name = c.getString(n); if (m >= 0) modified = c.getLong(m);
                        }
                    }
                    PhotoStore.ImportResult result = store.importReference(uri, name, getContentResolver().getType(uri), modified);
                    if (result.status.equals("duplicate")) duplicates++; else if (result.status.equals("restored")) restored++; else saved++;
                } catch (Exception error) { if (errors.size() < 100) errors.add(name + "：" + message(error)); }
                finally { store.releaseUnused(uri); }
                int finished = ++done; ui(() -> { progress.setMax(uris.size()); progress.setProgress(finished); status.setText("逐张导入 " + finished + " / " + uris.size() + "；已完成的照片已保存"); });
            }
            String result = "新引用 " + saved + " 张，重复/重新关联 " + duplicates + " 张，回收站恢复 " + restored + " 张，失败 " + errors.size() + " 张。";
            ui(() -> { setBusy(false, result); load(); if (!errors.isEmpty()) alert("部分照片未导入", result + "\n\n" + String.join("\n", errors) + "\n\n可以重新选择失败照片，成功照片不会重复入库。"); });
        });
    }
    private void setBusy(boolean value, String message) {
        busy = value; for (Button b : controls) b.setEnabled(!value);
        if (search != null) search.setEnabled(!value); if (colors != null) colors.setEnabled(!value);
        status.setText(message); progress.setVisibility(value ? View.VISIBLE : View.GONE); progress.setIndeterminate(value);
    }
    private void showPhoto(PhotoStore.Record record) {
        detail = true; root.removeAllViews(); controls.clear(); JSONObject p = record.photo;
        root.addView(button("← 返回手机相册", this::showLibrary));
        ScrollView scroll = new ScrollView(this); LinearLayout content = column(); scroll.addView(content); root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        ImageView image = new ImageView(this); image.setScaleType(ImageView.ScaleType.FIT_CENTER); image.setContentDescription(p.optString("title"));
        content.addView(image, new LinearLayout.LayoutParams(-1, dp(340)));
        TextView sourceStatus = text(record.referenced() ? "正在读取系统原图…" : "旧版/备份恢复的原片副本仍保存在应用中。", 12);
        worker.execute(() -> {
            try {
                Bitmap bitmap; boolean fallback;
                try { bitmap = store.decodeOriginal(record, 1920); fallback = false; }
                catch (IOException | SecurityException missing) { bitmap = PhotoStore.decode(store.image(record.id), 1920, 1); fallback = true; }
                Bitmap result = bitmap; boolean cached = fallback;
                ui(() -> {
                    if (detail && image.isAttachedToWindow()) {
                        image.setImageBitmap(result);
                        sourceStatus.setText(cached ? "原图不可用/授权失效：当前仅显示展示缓存，不是原片。请重新选择同一原图；完整备份需要原图。"
                            : record.referenced() ? "正在显示引用的系统原图；应用不保存原片副本。" : "正在显示保留的应用原片副本。升级不会自动删除它。");
                    } else result.recycle();
                });
            } catch (Exception error) { ui(() -> alert("读取失败", message(error))); }
        });
        content.addView(text(p.optString("title"), 22));
        content.addView(text(p.optString("date") + " · " + p.optJSONObject("location").optString("name"), 15));
        content.addView(text("设备：" + p.optString("camera") + "\n镜头：" + p.optString("lens") + "\nISO：" + p.optInt("iso") + "  " + p.optString("aperture") + "  " + p.optString("shutter")
            + "\n展示图：" + p.optInt("width") + " × " + p.optInt("height") + "\n标签：" + p.optJSONArray("tags").toString(), 14));
        LinearLayout palette = new LinearLayout(this); JSONArray shades = p.optJSONArray("palette");
        for (int i = 0; i < shades.length(); i++) { View swatch = new View(this); swatch.setBackgroundColor(Color.parseColor(shades.optString(i))); palette.addView(swatch, new LinearLayout.LayoutParams(0, dp(32), 1)); } content.addView(palette);
        content.addView(sourceStatus);
        content.addView(text("这张照片没有自动发布到网站。", 12));
        if (record.referenced()) content.addView(button("重新选择同一原图 / 恢复授权", () -> {
            showLibrary(); pick(PICK);
        }));
        content.addView(button("编辑标题 / 日期 / 地点 / 设备 / 标签", () -> edit(record)));
        content.addView(button("移入回收站（不删除系统原片）", () -> new AlertDialog.Builder(this).setMessage("移入回收站？可以恢复，应用缓存/旧副本仍占用空间，不修改系统原片。").setNegativeButton("取消", null).setPositiveButton("移入", (d,w) -> {
            worker.execute(() -> { store.trash(record.id); ui(this::showLibrary); });
        }).show()));
    }
    private void edit(PhotoStore.Record row) {
        LinearLayout fields = column(); ScrollView scroll = new ScrollView(this); scroll.addView(fields);
        String[] labels = {"标题", "日期 YYYY-MM-DD", "地点名称", "拍摄设备", "标签（用逗号分隔）"};
        JSONObject p = row.photo; List<EditText> inputs = new ArrayList<>();
        String[] values = {p.optString("title"), p.optString("date"), p.optJSONObject("location").optString("name"), p.optString("camera"), p.optJSONArray("tags").toString().replace("[","").replace("]","").replace("\"","")};
        for (int i=0; i<labels.length; i++) { fields.addView(text(labels[i], 13)); EditText input = new EditText(this); input.setTextColor(Color.WHITE); input.setSingleLine(true); input.setText(values[i]); fields.addView(input); inputs.add(input); }
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("编辑信息").setView(scroll).setNegativeButton("取消", null).setPositiveButton("保存到手机", null).create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            try {
                JSONObject edit = new JSONObject(p.toString()); edit.put("title", inputs.get(0).getText().toString()).put("date", inputs.get(1).getText().toString());
                JSONObject location = new JSONObject(p.getJSONObject("location").toString()); location.put("name", inputs.get(2).getText().toString()); edit.put("location", location);
                edit.put("camera", inputs.get(3).getText().toString()); JSONArray tags = new JSONArray();
                for (String tag : inputs.get(4).getText().toString().split("[,，]")) if (!tag.trim().isEmpty()) tags.put(tag.trim()); edit.put("tags", tags);
                // Small SQLite update only; no decoding or full-file work on the UI thread.
                store.edit(row.id, edit); dialog.dismiss(); showPhoto(store.find(row.id));
            } catch (Exception error) { Toast.makeText(this, message(error), Toast.LENGTH_LONG).show(); }
        }));
        dialog.show();
    }
    private void trash() {
        if (busy) return;
        worker.execute(() -> {
            try {
                List<PhotoStore.Record> rows = store.list(true); String[] names = new String[rows.size()]; for(int i=0;i<rows.size();i++) names[i] = rows.get(i).photo.optString("title");
                ui(() -> new AlertDialog.Builder(this).setTitle("回收站 · " + rows.size() + " 张").setItems(names, (d,index) -> {
                    PhotoStore.Record row = rows.get(index);
                    new AlertDialog.Builder(this).setTitle(row.photo.optString("title")).setMessage("恢复可返回画廊。永久删除仅移除应用副本，不删除系统相册原片；此操作不可撤销。")
                        .setNeutralButton("取消", null).setPositiveButton("恢复", (dd,w) -> mutateTrash(row.id, false))
                        .setNegativeButton("永久删除", (dd,w) -> new AlertDialog.Builder(this).setMessage("确认删除应用记录、缓存/旧版副本并释放引用授权？不会删除系统相册的原图。")
                            .setNegativeButton("取消", null).setPositiveButton("确认永久删除", (ddd,ww) -> mutateTrash(row.id, true)).show()).show();
                }).setPositiveButton("关闭", null).show());
            } catch (Exception error) { ui(() -> alert("回收站读取失败", message(error))); }
        });
    }
    private void mutateTrash(String id, boolean erase) {
        worker.execute(() -> { try { if (erase) store.erase(id); else store.restore(id); ui(this::load); } catch (Exception error) { ui(() -> alert("操作失败", message(error))); } });
    }
    private static String message(Exception error) { return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage(); }
    private void alert(String title, String msg) { if (!isFinishing() && !isDestroyed()) new AlertDialog.Builder(this).setTitle(title).setMessage(msg).setPositiveButton("知道了", null).show(); }
    private void ui(Runnable action) { runOnUiThread(() -> { if (!isDestroyed() && !isFinishing()) action.run(); }); }
    private void back() { if (busy) { Toast.makeText(this,"正在处理照片，请等待完成后退出；已完成部分已保存",Toast.LENGTH_LONG).show(); } else if (detail) showLibrary(); else finish(); }
    // API 33+ uses the native OnBackInvokedCallback registered in onCreate.
    // This override is retained only for Android 8–12, without AndroidX dependencies.
    @SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() { if (Build.VERSION.SDK_INT < 33) back(); else super.onBackPressed(); }
    @Override public void onConfigurationChanged(Configuration config) { super.onConfigurationChanged(config); if (grid != null) grid.setNumColumns(config.orientation == Configuration.ORIENTATION_LANDSCAPE ? 4 : 2); }
    @Override protected void onDestroy() {
        worker.shutdownNow(); thumbs.evictAll();
        // Close SQLite after any running bounded import has released it.
        if (store != null) { Thread cleanup = new Thread(() -> { try { worker.awaitTermination(30, java.util.concurrent.TimeUnit.SECONDS); } catch (InterruptedException ignored) {} store.close(); }); cleanup.start(); }
        super.onDestroy();
    }
}
