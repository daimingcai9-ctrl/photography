"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { Photo, getAllPhotos } from "./photos";

const EDITS_KEY = "photo-edits";
const CUSTOM_PHOTOS_KEY = "custom-photos";
const STORE_EVENT = "photo-store-change";

interface PhotoEdit {
  location?: { name: string; lat: number; lng: number };
  title?: string;
  tags?: string[];
  camera?: string;
}

type EditMap = Record<string, PhotoEdit>;

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function loadEdits(): EditMap {
  if (typeof window === "undefined") return {};
  const parsed = parseJson<unknown>(localStorage.getItem(EDITS_KEY), {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as EditMap
    : {};
}

function emitStoreChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(STORE_EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(STORE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(STORE_EVENT, callback);
  };
}

function getSnapshot() {
  return `${localStorage.getItem(EDITS_KEY) || ""}\n${localStorage.getItem(CUSTOM_PHOTOS_KEY) || ""}`;
}

function getServerSnapshot() {
  return "";
}

function applyEdits(photos: Photo[]): Photo[] {
  const edits = loadEdits();
  return photos.map((photo) => {
    const edit = edits[photo.id];
    if (!edit) return photo;
    return {
      ...photo,
      location: edit.location || photo.location,
      title: edit.title || photo.title,
      tags: edit.tags || photo.tags,
      camera: edit.camera || photo.camera,
    };
  });
}

/** All static and local-draft photos, kept in sync across components and tabs. */
export function useEditedPhotos(): [Photo[], () => void] {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const photos = useMemo(() => {
    void snapshot;
    return applyEdits(getAllPhotos());
  }, [snapshot]);
  const reload = useCallback(() => emitStoreChange(), []);
  return [photos, reload];
}

export function savePhotoEdit(id: string, edit: PhotoEdit) {
  const edits = loadEdits();
  edits[id] = { ...edits[id], ...edit };
  localStorage.setItem(EDITS_KEY, JSON.stringify(edits));
  emitStoreChange();
}

export function resetPhotoEdit(id: string) {
  const edits = loadEdits();
  delete edits[id];
  localStorage.setItem(EDITS_KEY, JSON.stringify(edits));
  emitStoreChange();
}

export function saveCustomPhoto(photo: Photo) {
  const photos = parseJson<Photo[]>(localStorage.getItem(CUSTOM_PHOTOS_KEY), []);
  localStorage.setItem(CUSTOM_PHOTOS_KEY, JSON.stringify([...photos, photo]));
  emitStoreChange();
}

export function deleteCustomPhoto(id: string) {
  const photos = parseJson<Photo[]>(localStorage.getItem(CUSTOM_PHOTOS_KEY), []);
  localStorage.setItem(CUSTOM_PHOTOS_KEY, JSON.stringify(photos.filter((photo) => photo.id !== id)));
  resetPhotoEdit(id);
}
