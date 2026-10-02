/** Local-only controls never appear on the public gallery. */
export const LOCAL_STUDIO_ENABLED = process.env.NEXT_PUBLIC_ENABLE_LOCAL_STUDIO === "true";
export const API_BASE = LOCAL_STUDIO_ENABLED ? "http://localhost:3001/api" : "/api";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://photography-hhs.pages.dev";
