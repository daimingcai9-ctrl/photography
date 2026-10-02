"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest, upsertPhoto } from "@/lib/store";
import { MAX_BATCH_SIZE, type Photo } from "@/lib/photo-schema";
import { preparePhoto } from "@/lib/prepare-photo";
import { CITIES } from "@/lib/exif";
import { LOCAL_STUDIO_ENABLED } from "@/lib/config";

type QueueItem = {
  id: string; file?: File; name: string; status: "queued" | "processing" | "uploading" | "done" | "error";
  error?: string; photo?: Photo;
};
export default function BatchUpload({ onUploaded }: { onUploaded?: () => void }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [commonCity, setCommonCity] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const runningRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; cancelRef.current = true; abortRef.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);
  const update = (id: string, change: Partial<QueueItem>) => { if (mountedRef.current) setItems((list) => list.map((item) => item.id === id ? { ...item, ...change } : item)); };
  const addFiles = (files: FileList | File[]) => {
    if (runningRef.current) return;
    const incoming = Array.from(files);
    setItems((previous) => {
      const known = new Set(previous.filter((p) => p.file).map((p) => `${p.file!.name}:${p.file!.size}:${p.file!.lastModified}`));
      const additions: QueueItem[] = [];
      for (const file of incoming) {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (known.has(key)) continue;
        known.add(key);
        additions.push({ id: crypto.randomUUID(), name: file.name, file, status: "queued" });
      }
      return [...previous, ...additions].slice(0, MAX_BATCH_SIZE);
    });
    setNotice(incoming.length + items.length > MAX_BATCH_SIZE ? "每批最多 100 张，请分批上传" : "已选择照片。点击开始后自动读取拍摄信息并逐张保存。");
    if (inputRef.current) inputRef.current.value = "";
  };
  const start = async () => {
    if (runningRef.current) return;
    runningRef.current = true; cancelRef.current = false; setRunning(true); setNotice("");
    const queue = items.filter((item) => item.file && (item.status === "queued" || item.status === "error"));
    let successes = 0, failures = 0;
    for (const item of queue) {
      if (cancelRef.current || !mountedRef.current) break;
      update(item.id, { status: "processing", error: undefined });
      try {
        const prepared = await preparePhoto(item.file!);
        if (cancelRef.current || !mountedRef.current) { update(item.id, { status: "queued" }); break; }
        if (commonCity) prepared.metadata.location = { ...CITIES.find((c) => c.name === commonCity)! };
        const form = new FormData();
        form.set("image", prepared.image, "image.jpg"); form.set("thumbnail", prepared.thumbnail, "thumbnail.jpg");
        form.set("metadata", JSON.stringify(prepared.metadata)); form.set("requestId", item.id);
        abortRef.current = new AbortController();
        update(item.id, { status: "uploading" });
        const timeout = setTimeout(() => abortRef.current?.abort(), 90000);
        let response: { photo: Photo };
        try { response = await apiRequest<{ photo: Photo }>("upload", { method: "POST", body: form, signal: abortRef.current.signal }); }
        finally { clearTimeout(timeout); abortRef.current = null; }
        upsertPhoto(response.photo);
        // Retain only the saved metadata, not source files/base64 strings or decoded canvases.
        update(item.id, { status: "done", photo: response.photo, file: undefined });
        successes++;
      } catch (error) {
        update(item.id, { status: cancelRef.current ? "queued" : "error", error: cancelRef.current ? undefined : (error instanceof Error ? error.message : "上传失败") });
        if (!cancelRef.current) failures++;
      }
    }
    runningRef.current = false;
    if (!mountedRef.current) return;
    setRunning(false);
    setNotice(cancelRef.current ? "上传已暂停，尚未完成的照片可以继续；网络中断后的重试不会重复添加。" : `本批成功 ${successes} 张，失败 ${failures} 张。失败照片保留在列表中，可重试。`);
    onUploaded?.();
  };
  const done = items.filter((item) => item.status === "done").length;
  const pending = items.filter((item) => item.file && (item.status === "queued" || item.status === "error")).length;
  const labels = { queued: "等待上传", processing: "读取信息 / 处理图片", uploading: "正在保存", done: LOCAL_STUDIO_ENABLED ? "已保存到本机" : "已发布", error: "未保存" };
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-semibold">批量上传</h2><p className="mt-1 text-sm text-white/50">{LOCAL_STUDIO_ENABLED ? "电脑选文件或拖入照片，逐张保存到硬盘；每批最多 100 张，不自动发布。" : "电脑选文件或拖入照片，手机打开相册多选；每批最多 100 张。"}</p></div>
        <button type="button" disabled={running} onClick={() => inputRef.current?.click()} className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black disabled:opacity-40">选择照片 / 打开相册</button>
      </div>
      <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.heic,.heif" className="sr-only" aria-label="批量选择照片" onChange={(event) => { if (event.target.files) addFiles(event.target.files); }} disabled={running} />
      <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }} className="my-4 rounded-xl border border-dashed border-white/20 px-4 py-6 text-center text-sm text-white/45">拖拽多张照片到这里 · 支持 JPG / PNG / WebP / HEIC / AVIF · 单张最大 25MB</div>
      <label className="mb-3 block text-sm text-white/60">整批拍摄城市（可选）
        <select disabled={running} value={commonCity} onChange={(e) => setCommonCity(e.target.value)} className="ml-2 max-w-full rounded-lg bg-zinc-800 p-2 text-white">
          <option value="">自动识别地点，没有 GPS 则标记未知</option>{CITIES.map((c) => <option key={c.name}>{c.name}</option>)}
        </select>
      </label>
      <p className="text-xs leading-6 text-white/40">自动读取日期、设备、镜头、ISO、光圈、快门、色板及可用的拍摄地点。没有拍摄日期时使用文件日期。公开图片会去掉 EXIF，GPS 只保留城市或约 1 公里精度；上传后可编辑信息。</p>
      {items.length > 0 && <>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" disabled={running || !pending} onClick={() => void start()} className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black disabled:opacity-40">{items.some((i) => i.status === "error") ? "上传 / 重试失败项" : "开始批量上传"}</button>
          {running ? <button type="button" onClick={() => { cancelRef.current = true; abortRef.current?.abort(); }} className="text-sm text-white/60">暂停上传</button> : <button type="button" onClick={() => { setItems([]); setNotice(""); }} className="text-sm text-white/60">清空列表</button>}
          <span className="text-sm text-white/45">已保存 {done} / {items.length}</span>
        </div>
        <progress aria-label="本批上传进度" value={done} max={items.length} className="mt-4 h-2 w-full accent-white" />
        <ul className="mt-3 max-h-96 space-y-2 overflow-auto">
          {items.map((item) => <li key={item.id} className="rounded-xl bg-black/25 px-3 py-3">
            <div className="flex items-start justify-between gap-3"><span className="min-w-0 break-all text-sm">{item.name}</span><span className={`shrink-0 text-xs ${item.status === "error" ? "text-red-300" : item.status === "done" ? "text-green-300" : "text-white/50"}`}>{labels[item.status]}</span></div>
            {item.photo && <p className="mt-1 text-xs text-white/45">{item.photo.date} · {item.photo.camera} · {item.photo.location.name}{item.photo.iso > 0 ? ` · ISO ${item.photo.iso}` : ""}</p>}
            {item.error && <p className="mt-1 text-xs text-red-300" role="alert">{item.error}</p>}
          </li>)}
        </ul>
      </>}
      {notice && <p role="status" className="mt-4 text-sm text-white/65">{notice}</p>}
    </section>
  );
}
