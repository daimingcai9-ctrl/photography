# 光影视界

个人摄影作品展示站，使用 Next.js App Router 构建并静态导出。网站包含色彩画廊、拍摄地点地图、照片详情和摄影数据分析。

## 本地运行

```bash
pnpm install
pnpm dev
```

打开 <http://localhost:3000>。

默认开发命令使用 Webpack，避免这台机器上曾出现的 Turbopack 多 worker 内存持续增长。只有明确需要排查 Turbopack 时才运行 `pnpm dev:turbo`，并在使用后及时停止。

常用检查：

```bash
pnpm lint
pnpm build
```

## 照片数据

- `public/photos/`：公开原图
- `public/thumbnails/`：400px 缩略图
- `data/photos.json`：网站使用的照片元数据
- `source-photos/`：本地源文件备份，不提交、不部署

批量重新生成缩略图、色板和 EXIF 元数据：

```bash
pnpm extract-colors
```

## 本地管理模式

公开网站默认不显示添加和编辑按钮，因为浏览器本地修改不会自动发布。需要本地整理照片时：

1. 复制 `.env.example` 为 `.env.local`。
2. 设置 `NEXT_PUBLIC_ENABLE_LOCAL_STUDIO=true`。
3. 分别运行 `pnpm dev` 和 `pnpm upload-server`。
4. 在图库中添加照片；本地服务会写入原图、缩略图和 `photos.json`。
5. 检查改动，构建通过后提交 Git，由 Cloudflare Pages 发布。

本地上传服务只绑定 `127.0.0.1`，限制允许来源和请求体大小，不能直接作为公网手机上传接口使用。

## 未来手机上传

上传界面通过 `NEXT_PUBLIC_PHOTO_UPLOAD_ENDPOINT` 与上传服务解耦。以后增加手机上传时，建议保持现有前端，新增一个带登录验证的 HTTPS 接口，并使用：

- Cloudflare Access 或一次性登录链接进行身份验证
- R2 保存原图和派生图片
- D1 保存照片元数据和发布状态
- 服务端校验文件类型、大小和 EXIF 隐私信息
- `draft → published` 发布流程，避免上传后直接公开

部署远程接口后，还需要把接口域名加入 `public/_headers` 的 CSP `connect-src`。

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_ENABLE_LOCAL_STUDIO` | 显示本地添加和编辑入口 |
| `NEXT_PUBLIC_PHOTO_UPLOAD_ENDPOINT` | 本地或未来远程上传接口 |
| `NEXT_PUBLIC_SITE_URL` | 生成照片分享卡片的绝对地址 |
