package com.hhs.photography;

import android.content.Context;
import android.util.Base64;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;

/** Disposable framework-only tests. Ephemeral signing key never ships in the APK. */
final class UiUpdateTests {
    private static void check(boolean yes,String why) { if (!yes) throw new AssertionError(why); }
    private static byte[] sign(JSONObject payload,PrivateKey key) throws Exception {
        String text=payload.toString(); Signature signer=Signature.getInstance("SHA256withECDSA"); signer.initSign(key);
        signer.update(text.getBytes(StandardCharsets.UTF_8));
        return new JSONObject().put("payload",text).put("signature",Base64.encodeToString(signer.sign(),Base64.NO_WRAP)).toString().getBytes(StandardCharsets.UTF_8);
    }
    private static void reject(UiUpdates updates,byte[] bytes,String why) throws Exception {
        boolean failed=false; try { updates.verify(bytes); } catch (Exception expected) { failed=true; } check(failed,why);
    }
    static UiUpdates.Pack run(Context context) throws Exception {
        UiUpdates actual=new UiUpdates(context); JSONObject baseline=actual.status();
        try (InputStream in=context.getAssets().open("updates/builtin.json")) {
            JSONObject meta=new JSONObject(new String(UiUpdates.readLimited(in,16384),StandardCharsets.UTF_8));
            check(meta.getLong("version")==baseline.getLong("currentVersion"),"APK baseline incoherent");
        }
        KeyPairGenerator generator=KeyPairGenerator.getInstance("EC"); generator.initialize(new java.security.spec.ECGenParameterSpec("secp256r1"));
        KeyPair keys=generator.generateKeyPair(); String pin=Base64.encodeToString(keys.getPublic().getEncoded(),Base64.NO_WRAP);
        long builtin=baseline.getLong("currentVersion"); JSONObject meta=new JSONObject().put("version",builtin).put("release","test-builtin").put("protocol",1);
        File directory=new File(context.getNoBackupFilesDir(),"update-test-"+System.nanoTime());
        UiUpdates updates=new UiUpdates(directory,pin,meta);
        JSONArray files=new JSONArray();
        for (String name:UiUpdates.NAMES) try (InputStream in=context.getAssets().open("ui/"+name)) {
            byte[] bytes=UiUpdates.readLimited(in,1024*1024);
            if (name.equals("app.js")) bytes=(new String(bytes,StandardCharsets.UTF_8)+"\nwindow.HotUpdateProbe='verified-test';\n").getBytes(StandardCharsets.UTF_8);
            files.put(new JSONObject().put("name",name).put("size",bytes.length).put("sha256",UiUpdates.sha(bytes)).put("content",Base64.encodeToString(bytes,Base64.NO_WRAP)));
        }
        JSONObject first=new JSONObject().put("format","hhs-ui-v1").put("protocol",1).put("version",builtin+1)
            .put("release","signed-test-1").put("notes","preserve private photos").put("files",files);
        byte[] one=sign(first,keys.getPrivate()); UiUpdates.Pack resourcePack=updates.verify(one);
        reject(actual,one,"Unpinned signing key accepted");
        JSONObject tampered=new JSONObject(new String(one,StandardCharsets.UTF_8));
        tampered.put("payload",tampered.getString("payload").replace("signed-test-1","tampered-test1"));
        reject(updates,tampered.toString().getBytes(StandardCharsets.UTF_8),"Tampered signature accepted");
        JSONObject bad=new JSONObject(first.toString()); bad.put("protocol",2); reject(updates,sign(bad,keys.getPrivate()),"Incompatible bridge accepted");
        bad=new JSONObject(first.toString()); bad.getJSONArray("files").getJSONObject(0).put("name","../private.db");
        reject(updates,sign(bad,keys.getPrivate()),"Path traversal accepted");
        bad=new JSONObject(first.toString()); bad.getJSONArray("files").getJSONObject(0).put("sha256",String.join("",Collections.nCopies(64,"0")));
        reject(updates,sign(bad,keys.getPrivate()),"Corrupt resource accepted");
        reject(updates,new byte[UiUpdates.MAX_BYTES+1],"Oversized download accepted");
        updates.stage(one); check(updates.status().getLong("pendingVersion")==builtin+1,"Stage failed");
        check(updates.status().getString("source").equals("builtin"),"Staging changed current UI");
        updates.apply(); check(updates.beginSession().version==builtin+1,"Atomic apply failed"); updates.ready();
        updates=new UiUpdates(directory,pin,meta); check(updates.beginSession().version==builtin+1,"Offline restart lost cached UI"); updates.ready();
        JSONObject second=new JSONObject(first.toString()).put("version",builtin+2).put("release","signed-test-2");
        updates.stage(sign(second,keys.getPrivate())); updates.apply(); check(updates.beginSession().version==builtin+2,"Second activation failed");
        // Simulate process death before uiReady; startup recovers previous verified resources.
        updates=new UiUpdates(directory,pin,meta); check(updates.beginSession().version==builtin+1,"Failed boot did not recover previous UI"); updates.ready();
        updates.rollback("test rollback"); check(updates.beginSession()==null,"Rollback did not recover APK resources");
        updates.stage(one); check(updates.status().getLong("pendingVersion")==0,"Network downgrade/replay accepted after rollback");
        second.put("version",builtin+3); updates.stage(sign(second,keys.getPrivate())); updates.apply(); updates.beginSession(); updates.ready();
        try (OutputStream out=new FileOutputStream(new File(directory,"pack-"+(builtin+3)+".json"))) { out.write("corrupt".getBytes(StandardCharsets.UTF_8)); }
        updates=new UiUpdates(directory,pin,meta); check(updates.beginSession()==null,"Corrupt persisted cache bricked UI");
        return resourcePack;
    }
}
