package com.hhs.photography;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;

/** Grant-protected cross-UID original, stored outside the app under test. */
public final class ReferenceFixtureProvider extends ContentProvider {
    static final Uri URI = Uri.parse("content://com.hhs.photography.offline.test.references/original");
    @Override public boolean onCreate() { return true; }
    @Override public String getType(Uri uri) { return "image/jpeg"; }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        String path=uri.getPath(); boolean demo=path != null && path.matches("/demo[0-5]");
        if ((!URI.equals(uri) && !demo) || !"r".equals(mode)) throw new FileNotFoundException("Unknown/read-only fixture");
        return ParcelFileDescriptor.open(new File(getContext().getCacheDir(), demo ? path.substring(1)+".jpg" : "reference.jpg"), ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        MatrixCursor cursor = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME}); cursor.addRow(new String[]{"引用原图.jpg"}); return cursor;
    }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException(); }
}
