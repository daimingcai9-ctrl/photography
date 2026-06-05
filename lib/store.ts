"use client";

import { useState, useEffect, useCallback } from "react";
import { Photo, getAllPhotos } from "./photos";

const STORAGE_KEY = "photo-edits";

interface PhotoEdit {
  location?: { name: string; lat: number; lng: number };
  title?: string;
  tags?: string[];
}

type EditMap = Record<string, PhotoEdit>;

function loadEdits(): EditMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveEdits(edits: EditMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
}

/** Hook: loads photos with edits from localStorage, only after client mount */
export function useEditedPhotos(): [Photo[], () => void] {
  const [photos, setPhotos] = useState<Photo[]>(getAllPhotos);

  const reload = useCallback(() => {
    const edits = loadEdits();
    const updated = getAllPhotos().map((p) => {
      const edit = edits[p.id];
      if (!edit) return p;
      return { ...p, location: edit.location || p.location, title: edit.title || p.title, tags: edit.tags || p.tags };
    });
    setPhotos(updated);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return [photos, reload];
}

export function savePhotoEdit(id: string, edit: PhotoEdit) {
  const edits = loadEdits();
  edits[id] = { ...edits[id], ...edit };
  saveEdits(edits);
}
