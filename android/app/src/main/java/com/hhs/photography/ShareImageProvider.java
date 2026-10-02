package com.hhs.photography;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;

/** A read-only, per-share URI. Never exposes raw originals or arbitrary app files. */
public final class ShareImageProvider extends ContentProvider {
    @Override public boolean onCreate() { return true; }
    private File image(Uri uri) throws FileNotFoundException {
        String path = uri.getPath();
        if (path == null || !path.matches("/image/mobile-[a-f0-9]{64}")) throw new FileNotFoundException("Unknown share");
        String id = path.substring(7);
        // No cleanup: a receiver opening a share must not remove a concurrent import's .part files.
        try (PhotoStore store = new PhotoStore(getContext(), "main", false)) {
            PhotoStore.Record row = store.find(id); if (row == null || row.deleted || !store.image(id).isFile()) throw new FileNotFoundException("Photo unavailable");
            return store.image(id);
        } catch (Exception error) { throw new FileNotFoundException("Photo unavailable"); }
    }
    @Override public String getType(Uri uri) { return "image/jpeg"; }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("Read-only share");
        return ParcelFileDescriptor.open(image(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        try {
            File file = image(uri); String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE} : projection;
            MatrixCursor cursor = new MatrixCursor(columns); Object[] row = new Object[columns.length];
            for (int i=0;i<columns.length;i++) row[i] = columns[i].equals(OpenableColumns.DISPLAY_NAME) ? "光影视界.jpg" : columns[i].equals(OpenableColumns.SIZE) ? file.length() : null;
            cursor.addRow(row); return cursor;
        } catch (FileNotFoundException missing) { return null; }
    }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException("Read-only"); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException("Read-only"); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException("Read-only"); }
}
