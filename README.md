# 光影视界

个人摄影作品展示站，使用 Next.js App Router 构建并静态导出。网站包含色彩画廊、拍摄地点地图、照片详情和摄影数据分析。

## 本地运行

```bash
pnpm install
pnpm dev
```

打开 <http://localhost:3000>。

默认开发命令使用 Webpack，避免这台机器上曾出现的 Turbopack 多 worker 内存持续增长。只有明确需要排查 Turbopack 时才运行 `pnpm dev:turbo`，并在使用后及时停止。

常用检查（测试需要 Node 22.13+；Cloudflare 构建不运行 SQLite 测试）：

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm audit --prod
pnpm build
```

## 照片数据

- `public/photos/`：已有公开照片，保留原有文件与地址
- `public/thumbnails/`：400px 缩略图
- `data/photos.json`：网站使用的照片元数据
- `source-photos/`：本地源文件备份，不提交、不部署

安全更新缩略图和色板，补录未入库的照片（旧 ID、标题、日期、设备、标签、地点保持不变；先备份元数据）：

```bash
pnpm extract-colors
```

## 本地管理模式

公开画廊不提供本地编辑按钮。网站的“上传”入口进入 `/studio`，所有管理写入必须登录。需要本地整理照片时：

1. 复制 `.env.example` 为 `.env.local`。
2. 设置 `NEXT_PUBLIC_ENABLE_LOCAL_STUDIO=true`。
3. 分别运行 `pnpm dev` 和 `pnpm upload-server`。
4. 在 `/studio` 输入服务终端的本地管理密码，批量选择照片；服务写入去除 EXIF 的展示图、缩略图和 `photos.json`。
5. 检查改动，构建通过后提交 Git，由 Cloudflare Pages 发布。

本地上传服务只绑定 `127.0.0.1`，限制允许来源和请求体大小，不能直接作为公网手机上传接口使用。

## 电脑 / 手机云端批量上传

打开 <https://photography-hhs.pages.dev/studio>，输入个人管理密码：

- 电脑：文件多选或拖拽；手机：系统相册多选（浏览器/相册提供者需要支持多选）。不强制打开摄像头。
- 每批最多 100 张、单张原文件不超过 25MB / 6400 万像素。逐张处理，避免一次解码整批大图；支持暂停和失败项重试。
- 读取现存 EXIF 的拍摄日期、设备、镜头、ISO、光圈、快门、GPS，并生成色板。没有 EXIF 的照片不能恢复被删除的信息；日期回退到文件日期，设备/位置标记未知，可手动修改。
- 展示图最长边 2560px、缩略图最长边 400px。上传的是清除 EXIF 的 JPEG，**不是原片备份**；请自行保管原片。GPS 自动转换为城市或约 1 公里精度。
- 点击“开始批量上传”即发布到公开画廊，其他设备刷新页面或保持前台约 30 秒即可看到；失败不会伪装成成功或退回浏览器草稿。
- 上传重试使用同一请求 ID，避免网络中断后重复入库。编辑和删除保存在云端，不依赖 localStorage。
- 所有新照片的详情使用 `/photo?id=...`，原有 `/photo/[id]` 地址继续有效；远程照片分享的预览卡片目前为网站通用卡片。

实现：同源 Cloudflare Pages Functions `/api/*`，R2 存展示图和缩略图，D1 存元数据、旧照片修改覆盖及删除标记。HTTPS、HttpOnly / SameSite=Strict 会话、来源校验、登录限流、请求体上限及 JPEG 元数据检查保护管理入口。密码不在网页、Git 或 APK 中。

### Cloudflare 配置与本地模拟

生产项目名是 `photography`，域名为 `photography-hhs.pages.dev`。专用 `PHOTO_DB` 已建立，账号目前尚未启用 R2，因此线上上传会明确显示未连接，原有展示功能正常。先在正确账号的控制台确认 R2 启用/计费条款，创建 `photography-photos` 桶，再在 `wrangler.jsonc` 添加 `r2_buckets: [{ "binding": "PHOTO_BUCKET", "bucket_name": "photography-photos" }]` 并重新部署。不能声明尚不存在的桶，否则整个新部署会失败。

数据库和 secrets 配置：

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 migrations apply PHOTO_DB --remote
pnpm exec wrangler pages secret put ADMIN_PASSWORD --project-name photography
pnpm exec wrangler pages secret put SESSION_SECRET --project-name photography
```

管理密码至少 12 字符；会话密钥至少 32 字符并使用随机值。修改密钥会使所有会话失效。部署从 GitHub `main` 自动构建，无需每次上传都提交 Git。

本地验证云端流程时，保持 `NEXT_PUBLIC_ENABLE_LOCAL_STUDIO=false`，在忽略提交的 `.dev.vars` 中配置两个测试凭据，然后：

```bash
pnpm build
pnpm exec wrangler d1 migrations apply PHOTO_DB --local
pnpm cf:dev
```

打开 <http://localhost:8788/studio>。`pnpm start` 也使用 Pages 模拟器，修复静态导出不支持 `next start` 的问题。不要把本地上传服务暴露到公网。

旧版浏览器 `photo-edits` / `custom-photos` 数据没有被清除，但不再作为公开内容自动加载；之前仅保存在该浏览器的草稿请先导出备份或重新选择原片上传。

## 私人 Android APK

`android/` 为原生 WebView 封装，默认打开线上 `/studio`。只有 INTERNET 权限；文件选择由系统 `ACTION_OPEN_DOCUMENT` 提供，支持多选，无整盘读取、相机权限或 JavaScript 原生桥接。外部链接在浏览器打开，仅允许 HTTPS 相册域名留在应用内，证书错误不能跳过。

GitHub Actions 的 **Private Android APK** 工作流在 Android 代码推到 `main` 后构建，或在 Actions 页面手动运行。下载 `photography-private-apk` artifact 中的 `app-debug.apk`，在自己的安卓手机允许该安装来源后侧载。它是个人测试安装包，不是应用商店发布版；目前没有持久签名密钥，后续替换不同构建的 debug APK 可能需要先卸载旧版。不会自动上传手机相册，仍需登录并主动选择照片；网站更新无需重装 APK。

本机编译需要 JDK 17、Gradle 8.13、Android SDK 36：`pnpm android:build`。尚无安卓真机自动化测试，首次安装请实测你手机的相册提供者多选和 HEIC 行为。

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_ENABLE_LOCAL_STUDIO` | 使用仅限本机的管理服务；生产必须为 false |
| `NEXT_PUBLIC_SITE_URL` | 生成照片分享卡片的绝对地址 |
| `ADMIN_PASSWORD` | Cloudflare 服务端管理密码（secret） |
| `SESSION_SECRET` | Cloudflare 服务端会话签名密钥（secret） |
