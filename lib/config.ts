/** Local-only controls never appear on the public gallery. */
export const LOCAL_STUDIO_ENABLED = process.env.NEXT_PUBLIC_ENABLE_LOCAL_STUDIO === "true";
export const REMOTE_STUDIO_ENABLED = process.env.NEXT_PUBLIC_ENABLE_REMOTE_STUDIO === "true";
export const STUDIO_ENABLED = LOCAL_STUDIO_ENABLED || REMOTE_STUDIO_ENABLED;
export function apiBase() {
  if (!LOCAL_STUDIO_ENABLED) return "/api";
  // Match the page hostname: Strict cookies must not cross localhost/127.0.0.1.
  const hostname = typeof window === "undefined" ? "127.0.0.1" : window.location.hostname;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") throw new Error("本地管理只能在本机打开");
  return `http://${hostname}:3001/api`;
}
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://photography-hhs.pages.dev";
