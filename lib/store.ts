"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { API_BASE } from "./config";
import { getAllPhotos, type Photo } from "./photos";
import { validateEdit, validatePhoto, type PhotoEdit } from "./photo-schema";

type Snapshot = { photos: Photo[]; deletedIds: string[]; loaded: boolean; error: string; authenticated: boolean; configured: boolean };
const initial: Snapshot = { photos: [], deletedIds: [], loaded: false, error: "", authenticated: false, configured: false };
let current = initial;
const listeners = new Set<() => void>();
let pending: Promise<void> | null = null;
let nextRefresh = 0;
let mutationVersion = 0;
function publish(update: Partial<Snapshot>) { current = { ...current, ...update }; for (const listener of listeners) listener(); }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function snapshot() { return current; }
function serverSnapshot() { return initial; }

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}/${path}`, { ...init, credentials: "include", cache: "no-store", signal: init.signal || AbortSignal.timeout(90000) });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) publish({ authenticated: false });
    throw new Error(result?.error || `请求失败（${response.status}）`);
  }
  return result as T;
}

export async function refreshPhotos(force = false): Promise<void> {
  if (pending) return force ? pending.then(() => refreshPhotos(true)) : pending;
  if (!force && Date.now() < nextRefresh) return;
  nextRefresh = Date.now() + 15000;
  pending = (async () => {
    const version = mutationVersion;
    try {
      const result = await apiRequest<{ photos: unknown[]; deletedIds: unknown[]; configured?: boolean }>("photos");
      if (!Array.isArray(result.photos) || !Array.isArray(result.deletedIds)) throw new Error("相册服务返回了无效数据");
      const photos = result.photos.map(validatePhoto);
      const deletedIds = result.deletedIds.filter((id): id is string => typeof id === "string");
      // A response started before a save must not undo that save in the UI.
      if (version === mutationVersion) publish({ photos, deletedIds, loaded: true, error: "", configured: !!result.configured });
    } catch {
      publish({ loaded: true, error: "暂时无法同步新作品，正在显示已加载的照片" });
    } finally { pending = null; }
  })();
  return pending;
}

export function usePhotoStore() {
  const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    void refreshPhotos();
    const refresh = () => { if (document.visibilityState === "visible") void refreshPhotos(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return state;
}

export function useEditedPhotos(): [Photo[], () => void] {
  const state = usePhotoStore();
  const photos = useMemo(() => {
    const merged = new Map(getAllPhotos().map((p) => [p.id, p]));
    for (const photo of state.photos) merged.set(photo.id, photo);
    for (const id of state.deletedIds) merged.delete(id);
    return [...merged.values()].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  }, [state.photos, state.deletedIds]);
  const reload = useCallback(() => { void refreshPhotos(true); }, []);
  return [photos, reload];
}

export async function refreshSession() {
  const result = await apiRequest<{ authenticated: boolean; configured: boolean }>("session");
  publish({ authenticated: !!result.authenticated, configured: !!result.configured });
  return result;
}
export async function login(password: string) {
  await apiRequest("login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
  await refreshSession();
}
export async function logout() {
  await apiRequest("logout", { method: "POST" });
  publish({ authenticated: false });
}
export async function savePhotoEdit(id: string, edit: PhotoEdit) {
  const valid = validateEdit(edit);
  const result = await apiRequest<{ photo: Photo }>(`photos/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(valid) });
  upsertPhoto(result.photo);
}
export async function deletePhoto(id: string) {
  await apiRequest(`photos/${encodeURIComponent(id)}`, { method: "DELETE" });
  mutationVersion++;
  publish({ photos: current.photos.filter((p) => p.id !== id), deletedIds: [...new Set([...current.deletedIds, id])] });
}
export function upsertPhoto(value: unknown) {
  const photo = validatePhoto(value);
  mutationVersion++;
  publish({ photos: [...current.photos.filter((p) => p.id !== photo.id), photo], deletedIds: current.deletedIds.filter((id) => id !== photo.id) });
}
