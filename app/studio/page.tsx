"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BatchUpload from "@/components/BatchUpload";
import EditPanel from "@/components/EditPanel";
import { login, logout, refreshSession, useEditedPhotos, usePhotoStore } from "@/lib/store";
import { LOCAL_STUDIO_ENABLED, STUDIO_ENABLED } from "@/lib/config";
import type { Photo } from "@/lib/photos";

export default function StudioPage() {
  if (!STUDIO_ENABLED) return <div className="mx-auto min-h-screen max-w-3xl px-4 pb-12 pt-24">
    <h1 className="text-3xl font-bold">本地相册管理</h1>
    <p className="mt-4 leading-7 text-white/60">照片先保存在你的电脑上，线上网站只展示已经发布的作品。无需开通付费图片存储。</p>
    <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-xl">在电脑上整理照片</h2>
      <p className="mt-3 leading-7 text-white/60">在项目目录运行下面的命令，打开终端显示的本地管理地址，使用终端中的临时密码登录。</p>
      <pre className="my-4 overflow-x-auto rounded-xl bg-black/30 p-4">pnpm studio</pre>
      <p className="leading-7 text-white/60">支持批量导入、自动读取拍摄信息、编辑和删除。新照片不会自动上传到 GitHub 或公开网站。</p>
      <p className="mt-3 leading-7 text-white/60">手机照片请先通过数据线、隔空投送或你已有的传文件工具传到电脑，再批量导入。当前线上网页和 APK 不支持远程上传到你的电脑。</p>
      <p className="mt-3 leading-7 text-white/60">已保留 Git 发布接口，以后需要同步时可先运行 <code>pnpm photos:sync</code> 查看待发布的改动，再明确确认发布。</p>
    </section>
    <Link href="/gallery" className="mt-8 inline-block text-white/60">返回画廊 →</Link>
  </div>;
  return <StudioManager />;
}

function StudioManager() {
  const state = usePhotoStore();
  const [photos, reload] = useEditedPhotos();
  const [password, setPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Photo | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    let alive = true;
    void refreshSession().catch(() => { if (alive) setError("暂时无法连接管理服务，请稍后重试"); }).finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);
  const signIn = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await login(password); setPassword(""); }
    catch (e) { setError(e instanceof Error ? e.message : "登录失败"); }
    finally { setBusy(false); }
  };
  return <div className="mx-auto min-h-screen max-w-6xl px-4 pb-12 pt-24">
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-bold">私人相册管理</h1><p className="mt-2 text-sm text-white/50">{LOCAL_STUDIO_ENABLED ? "保留每一帧的色彩，先在电脑上安心整理。" : "保留每一帧的色彩，让新作品同步到画廊。"}</p></div><Link href="/gallery" className="text-sm text-white/60">返回画廊 →</Link></div>
    {!ready ? <p className="text-white/50">正在连接管理服务…</p> : !state.authenticated ? <form onSubmit={signIn} className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="mb-3 text-xl">登录管理</h2>
      {!state.configured && <p className="mb-4 text-sm leading-6 text-amber-200">{LOCAL_STUDIO_ENABLED ? "请先启动本地上传服务。" : "云端上传服务尚未连接。站点管理员完成配置后，即可在此登录并批量上传。"}</p>}
      <label htmlFor="admin-password" className="mb-2 block text-sm text-white/60">{LOCAL_STUDIO_ENABLED ? "本地管理密码（见服务终端）" : "私人管理密码"}</label>
      <input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-3 outline-none focus:border-white/40" />
      <button type="submit" disabled={busy || !state.configured} className="mt-4 w-full rounded-full bg-white py-3 text-black disabled:opacity-40">{busy ? "正在登录…" : "登录并上传"}</button>
      <p className="mt-4 text-xs leading-5 text-white/40">{LOCAL_STUDIO_ENABLED ? "照片保存到本机硬盘，不自动同步到 Git。关闭并重新启动后，使用新的终端密码登录。" : "管理入口需要登录；发布后的照片会出现在公开画廊中。"}</p>
    </form> : <>
      <div className="mb-5 flex items-center justify-between"><p className="text-sm text-green-300">已登录{LOCAL_STUDIO_ENABLED ? " · 本地保存，发布需提交 Git" : " · 云端保存后立即同步网站"}</p><button type="button" onClick={() => { void logout().catch((e) => setError(String(e.message))); }} className="text-sm text-white/50">退出登录</button></div>
      <BatchUpload onUploaded={reload} />
      <section className="mt-8"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">管理作品 · {photos.length} 张</h2><input type="search" aria-label="搜索管理作品" placeholder="搜索标题或地点" value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2" /></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{photos.filter((p) => `${p.title} ${p.location.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((photo) => <button key={photo.id} type="button" onClick={() => setEditing(photo)} className="overflow-hidden rounded-xl border border-white/10 bg-white/5 text-left hover:border-white/30"><img src={photo.thumbnail} alt={photo.title} loading="lazy" className="aspect-[4/3] w-full object-cover" /><div className="p-3"><p className="truncate text-sm">{photo.title}</p><p className="mt-1 text-xs text-white/45">{photo.location.name} · 编辑 / 删除</p></div></button>)}</div>
      </section>
      {editing && <EditPanel key={editing.id} photo={editing} onClose={() => setEditing(null)} onChange={reload} />}
    </>}
    {error && <p role="alert" className="mt-4 text-center text-sm text-red-300">{error}</p>}
  </div>;
}
