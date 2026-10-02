package com.hhs.photography;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.media.ExifInterface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import java.io.*;

/** Emulates the picker owner's read/persistable grant. Test APK only. */
public final class ReferenceGrantActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        File file = new File(getCacheDir(), "reference.jpg");
        try {
            String action = getIntent().getStringExtra("operation");
            if ("gallery".equals(action) || "gallerygrant".equals(action)) {
                for(int i=0;i<6;i++) {
                    File demo=new File(getCacheDir(),"demo"+i+".jpg");
                    if("gallery".equals(action)) try(InputStream input=getAssets().open("demo/"+i+".jpg");OutputStream output=new FileOutputStream(demo)) {
                        byte[] bytes=new byte[4096];int n;while((n=input.read(bytes))!=-1)output.write(bytes,0,n);
                    }
                    if(!demo.isFile() || demo.length()==0)throw new IOException("App deleted provider-owned original");
                    grantUriPermission("com.hhs.photography.offline",android.net.Uri.parse("content://com.hhs.photography.offline.test.references/demo"+i),Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                }
            }
            else if ("delete".equals(action)) { if (!file.delete()) throw new IOException("fixture delete failed"); }
            else if ("revoke".equals(action)) revokeUriPermission(ReferenceFixtureProvider.URI, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            else {
                Bitmap bitmap = Bitmap.createBitmap(120, 80, Bitmap.Config.ARGB_8888); bitmap.eraseColor(Color.GREEN);
                try (OutputStream output = new FileOutputStream(file)) { bitmap.compress(Bitmap.CompressFormat.JPEG, 95, output); }
                bitmap.recycle(); ExifInterface exif = new ExifInterface(file.getPath());
                exif.setAttribute(ExifInterface.TAG_ORIENTATION, "6"); exif.setAttribute(ExifInterface.TAG_DATETIME_ORIGINAL, "2025:04:03 00:00:00");
                exif.setAttribute(ExifInterface.TAG_MAKE, "Reference");
                if("gps".equals(action)) {
                    exif.setAttribute(ExifInterface.TAG_GPS_LATITUDE,"31/1,13/1,48/1");exif.setAttribute(ExifInterface.TAG_GPS_LATITUDE_REF,"N");
                    exif.setAttribute(ExifInterface.TAG_GPS_LONGITUDE,"121/1,28/1,12/1");exif.setAttribute(ExifInterface.TAG_GPS_LONGITUDE_REF,"E");
                }
                exif.saveAttributes();
                grantUriPermission("com.hhs.photography.offline", ReferenceFixtureProvider.URI,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            }
        } catch (Exception error) { throw new RuntimeException(error); }
        // Let Android 11 report the first frame before the shell's "am start -W"
        // waits for launch completion. Finishing inside onCreate can race that report.
        new Handler(Looper.getMainLooper()).postDelayed(this::finish, 500);
    }
}
