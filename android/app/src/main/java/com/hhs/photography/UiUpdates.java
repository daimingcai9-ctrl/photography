package com.hhs.photography;

import android.content.Context;
import android.util.AtomicFile;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import javax.net.ssl.HttpsURLConnection;
import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.X509EncodedKeySpec;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** Signed, bounded UI-only updates. No access to PhotoStore, URIs, or arbitrary URLs. */
final class UiUpdates {
    static final String ENDPOINT = "https://photography-hhs.pages.dev/app-updates/stable.json";
    static final int PROTOCOL = 1, MAX_BYTES = 3 * 1024 * 1024;
    static final Set<String> NAMES = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
        "index.html", "app.js", "style.css", "world-land.geojson", "brand.svg")));
    static final class Pack {
        final long version;
        final String release, notes, hash;
        private final Map<String,byte[]> files;
        Pack(long version,String release,String notes,String hash,Map<String,byte[]> files) {
            this.version=version; this.release=release; this.notes=notes; this.hash=hash; this.files=files;
        }
        InputStream open(String name) throws IOException {
            byte[] bytes=files.get(name); if (bytes == null) throw new IOException("Unknown UI resource");
            return new ByteArrayInputStream(bytes);
        }
    }
    private final File root;
    private final PublicKey key;
    private final long builtin;
    private final String builtinRelease;
    private final AtomicFile stateFile;
    private JSONObject state;
    private String message="只更新界面，照片不上传";

    UiUpdates(Context context) throws Exception {
        this(new File(context.getNoBackupFilesDir(),"ui-updates-main"),
            readAsset(context,"updates/public-key.txt"),new JSONObject(readAsset(context,"updates/builtin.json")));
    }
    // Package-private injection for isolated device tests; never controlled by WebView input.
    UiUpdates(File directory,String publicKey,JSONObject metadata) throws Exception {
        root=directory; if (!root.isDirectory() && !root.mkdirs()) throw new IOException("更新存储不可用");
        key=KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(Base64.decode(publicKey.trim(),Base64.DEFAULT)));
        builtin=metadata.getLong("version"); builtinRelease=metadata.getString("release");
        if (metadata.getInt("protocol") != PROTOCOL) throw new IOException("APK 界面协议不匹配");
        stateFile=new AtomicFile(new File(root,"state.json"));
        try (InputStream in=stateFile.openRead()) { state=new JSONObject(new String(readLimited(in,16384),StandardCharsets.UTF_8)); }
        catch (Exception invalid) { state=new JSONObject(); }
        // A newer APK replaces old hot resources without migrating or touching album data.
        if (state.optLong("active") <= builtin) { state.put("active",0).put("previous",0).put("booting",false); }
        if (state.optLong("pending") <= builtin) state.put("pending",0);
        state.put("highest",Math.max(builtin,state.optLong("highest"))); save(); cleanup();
    }
    private static String readAsset(Context context,String name) throws IOException {
        try (InputStream in=context.getAssets().open(name)) { return new String(readLimited(in,16384),StandardCharsets.UTF_8); }
    }
    static byte[] readLimited(InputStream in,int limit) throws IOException {
        ByteArrayOutputStream out=new ByteArrayOutputStream(); byte[] buffer=new byte[8192]; int n; long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);
        while ((n=in.read(buffer)) != -1) { if (System.nanoTime()>deadline) throw new IOException("更新读取超时"); if (out.size()+n > limit) throw new IOException("界面包过大"); out.write(buffer,0,n); }
        return out.toByteArray();
    }
    static String sha(byte[] bytes) throws Exception {
        byte[] digest=MessageDigest.getInstance("SHA-256").digest(bytes); StringBuilder result=new StringBuilder();
        for (byte b : digest) result.append(String.format(Locale.ROOT,"%02x",b & 255)); return result.toString();
    }
    Pack verify(byte[] bytes) throws Exception {
        if (bytes.length > MAX_BYTES) throw new IOException("界面包过大");
        JSONObject envelope=new JSONObject(new String(bytes,StandardCharsets.UTF_8)); String payload=envelope.getString("payload");
        if (payload.length() > 2*1024*1024) throw new IOException("界面包过大");
        String signature=envelope.getString("signature");
        if (signature.length()>256 || !signature.matches("[A-Za-z0-9+/]+={0,2}")) throw new IOException("签名格式无效");
        Signature verifier=Signature.getInstance("SHA256withECDSA"); verifier.initVerify(key);
        verifier.update(payload.getBytes(StandardCharsets.UTF_8));
        if (!verifier.verify(Base64.decode(signature,Base64.NO_WRAP))) throw new IOException("界面签名校验失败");
        // Only parse or use resource contents AFTER authenticating the exact payload bytes.
        JSONObject pack=new JSONObject(payload); long version=pack.getLong("version");
        if (!"hhs-ui-v1".equals(pack.getString("format")) || !(pack.get("protocol") instanceof Number) || pack.getDouble("protocol") != PROTOCOL)
            throw new IOException("这次更新需要新版 APK");
        if (!(pack.get("version") instanceof Number) || version<1 || version>9007199254740991L || pack.getDouble("version") != version) throw new IOException("版本无效");
        String release=pack.getString("release"),notes=pack.getString("notes");
        if (release.length()>100 || notes.length()>500) throw new IOException("更新信息过长");
        JSONArray items=pack.getJSONArray("files"); if (items.length()!=NAMES.size()) throw new IOException("界面资源不完整");
        Map<String,byte[]> files=new HashMap<>(); int total=0;
        for (int i=0;i<items.length();i++) {
            JSONObject item=items.getJSONObject(i); String name=item.getString("name"),content=item.getString("content");
            int size=item.getInt("size");
            if (!NAMES.contains(name) || files.containsKey(name) || !(item.get("size") instanceof Number) || item.getDouble("size")!=size || size<1 || size>1024*1024
                || content.length()>1400000 || !content.matches("[A-Za-z0-9+/]+={0,2}")) throw new IOException("不允许的界面资源");
            byte[] decoded=Base64.decode(content,Base64.NO_WRAP); total+=decoded.length;
            if (decoded.length!=size || total>1536*1024 || !sha(decoded).equals(item.getString("sha256"))) throw new IOException("界面资源校验失败");
            files.put(name,decoded);
        }
        return new Pack(version,release,notes,sha(bytes),Collections.unmodifiableMap(files));
    }
    private File packFile(long version) throws IOException {
        if (version<1 || version>9007199254740991L) throw new IOException("版本无效");
        return new File(root,"pack-"+version+".json");
    }
    private Pack load(long version) throws Exception {
        try (InputStream in=new FileInputStream(packFile(version))) {
            Pack pack=verify(readLimited(in,MAX_BYTES)); if (pack.version != version) throw new IOException("版本不一致"); return pack;
        }
    }
    synchronized Pack beginSession() throws Exception {
        if (state.optBoolean("booting")) rollback("上次界面未能启动，已回退");
        long active=state.optLong("active");
        if (active==0) return null;
        try { Pack pack=load(active); state.put("booting",true); save(); return pack; }
        catch (Exception invalid) { rollback("界面缓存校验失败，已回退");
            long previous=state.optLong("active");
            if (previous!=0) try { Pack pack=load(previous); state.put("booting",true); save(); return pack; } catch (Exception ignored) { }
            state.put("active",0).put("booting",false); save(); return null;
        }
    }
    synchronized void ready() throws Exception { state.put("booting",false); save(); }
    synchronized void stage(byte[] bytes) throws Exception {
        Pack pack=verify(bytes); long floor=Math.max(builtin,state.optLong("highest"));
        if (pack.version <= floor) {
            long pending=state.optLong("pending");
            if (pack.version==pending && !load(pending).hash.equals(pack.hash)) throw new IOException("同版本内容不一致");
            message=pending>0 ? "已下载更新，点击应用" : "当前已是最新可用界面（不会自动降级）"; return;
        }
        write(new AtomicFile(packFile(pack.version)),bytes);
        state.put("pending",pack.version).put("highest",pack.version); save(); cleanup(); message="新界面已下载并验证，等待应用";
    }
    void check() throws Exception {
        HttpsURLConnection connection=(HttpsURLConnection)new URL(ENDPOINT).openConnection();
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(5000); connection.setReadTimeout(8000);
        connection.setRequestMethod("GET"); connection.setUseCaches(false); connection.setRequestProperty("Accept","application/json");
        try {
            if (connection.getResponseCode()!=200) throw new IOException("更新服务暂不可用（HTTP "+connection.getResponseCode()+"）");
            if (connection.getContentLengthLong()>MAX_BYTES) throw new IOException("界面包过大");
            try (InputStream in=connection.getInputStream()) { stage(readLimited(in,MAX_BYTES)); }
        } finally { connection.disconnect(); }
    }
    synchronized void apply() throws Exception {
        long pending=state.optLong("pending"); if (pending==0) throw new IOException("没有待应用的更新"); load(pending);
        state.put("previous",state.optLong("active")).put("active",pending).put("pending",0).put("booting",false); save(); cleanup();
    }
    synchronized void rollback(String reason) throws Exception {
        long previous=state.optLong("previous");
        if (previous>builtin) try { load(previous); } catch (Exception ignored) { previous=0; } else previous=0;
        state.put("active",previous).put("previous",0).put("booting",false); save(); cleanup(); message=reason;
    }
    synchronized JSONObject status() throws Exception {
        long active=state.optLong("active"),pending=state.optLong("pending"); String release=builtinRelease,notes="";
        if (active>0) try { release=load(active).release; } catch (Exception ignored) { }
        String next=""; if (pending>0) try { Pack p=load(pending); next=p.release; notes=p.notes; }
        catch (Exception invalid) { state.put("pending",0); pending=0; save(); }
        return new JSONObject().put("currentVersion",active==0?builtin:active).put("currentRelease",release)
            .put("source",active==0?"builtin":"hot").put("pendingVersion",pending).put("pendingRelease",next)
            .put("notes",notes).put("canRollback",active>0).put("message",message);
    }
    private void save() throws Exception { write(stateFile,state.toString().getBytes(StandardCharsets.UTF_8)); }
    private static void write(AtomicFile file,byte[] bytes) throws IOException {
        FileOutputStream out=null;
        try { out=file.startWrite(); out.write(bytes); file.finishWrite(out); }
        catch (IOException error) { if (out!=null) file.failWrite(out); throw error; }
    }
    private void cleanup() {
        File[] files=root.listFiles(); if (files==null) return;
        for (File file:files) if (file.getName().matches("pack-[0-9]{1,16}\\.json(?:\\.new|\\.bak)?")) {
            long version=Long.parseLong(file.getName().substring(5,file.getName().indexOf(".json")));
            if (!file.getName().endsWith(".json") || (version!=state.optLong("active") && version!=state.optLong("previous") && version!=state.optLong("pending"))) file.delete();
        }
    }
}
