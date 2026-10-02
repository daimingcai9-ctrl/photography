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
            if ("delete".equals(action)) { if (!file.delete()) throw new IOException("fixture delete failed"); }
            else if ("revoke".equals(action)) revokeUriPermission(ReferenceFixtureProvider.URI, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            else {
                Bitmap bitmap = Bitmap.createBitmap(120, 80, Bitmap.Config.ARGB_8888); bitmap.eraseColor(Color.GREEN);
                try (OutputStream output = new FileOutputStream(file)) { bitmap.compress(Bitmap.CompressFormat.JPEG, 95, output); }
                bitmap.recycle(); ExifInterface exif = new ExifInterface(file.getPath());
                exif.setAttribute(ExifInterface.TAG_ORIENTATION, "6"); exif.setAttribute(ExifInterface.TAG_DATETIME_ORIGINAL, "2025:04:03 00:00:00");
                exif.setAttribute(ExifInterface.TAG_MAKE, "Reference"); exif.saveAttributes();
                grantUriPermission("com.hhs.photography.offline", ReferenceFixtureProvider.URI,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            }
        } catch (Exception error) { throw new RuntimeException(error); }
        // Let Android 11 report the first frame before the shell's "am start -W"
        // waits for launch completion. Finishing inside onCreate can race that report.
        new Handler(Looper.getMainLooper()).postDelayed(this::finish, 500);
    }
}
