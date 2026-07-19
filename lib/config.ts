/**
 * Local studio controls are intentionally disabled on the public build.
 * Enable them in `.env.local` with NEXT_PUBLIC_ENABLE_LOCAL_STUDIO=true.
 */
export const LOCAL_STUDIO_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_LOCAL_STUDIO === "true";

/**
 * A future authenticated mobile upload API can replace the local helper
 * without changing the gallery UI.
 */
export const PHOTO_UPLOAD_ENDPOINT =
  process.env.NEXT_PUBLIC_PHOTO_UPLOAD_ENDPOINT ||
  "http://localhost:3001/api/upload";
