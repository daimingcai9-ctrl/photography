# 光影视界

个人摄影作品展示站。保留色彩画廊、地点地图、照片详情、摄影统计；电脑和安卓手机各有**独立的本地相册**，按需通过 Git 发布，不需要 R2 或支付卡。

## 最简单的使用方式

在项目目录打开终端（首次使用先 `pnpm install`，需要 Node 22.13+）：

```bash
pnpm studio
```

打开 <http://127.0.0.1:3000/studio>，输入终端显示的临时管理密码。一个命令同时启动网页和本地上传服务，无需修改 `.env.local`。按 Ctrl+C 同时停止；重新启动会换密码，但已保存的照片和信息仍在硬盘上。可通过仅本机环境变量 `PHOTO_ADMIN_PASSWORD` 设置固定密码，不要把密码提交到 Git。

- 电脑可以多选文件或拖拽，每批最多 100 张；逐张处理，支持暂停和失败重试，避免同时解码整批照片。
- 自动读取现有 EXIF 的日期、设备、镜头、ISO、光圈、快门、GPS，并生成色板；缺失的信息不能凭空恢复，可在管理页编辑。
- 安卓手机使用下方独立离线 APK，在手机上多选导入、保存和查看，不需要电脑。电脑相册与手机相册独立，不提供自动跨设备同步；手机以后可导出 Git 包合并到电脑。
- 单张原文件最多 25MB / 6400 万像素，支持 JPG、PNG、WebP、HEIC、AVIF。展示图最长边 2560px，缩略图最长边 400px。
- 新生成的展示图移除 EXIF；GPS 只保存城市或约 1 公里精度。保存的是展示图，**不是原片备份**，请另行保管原片。
- 上传、编辑和删除写到本机硬盘，不是浏览器 localStorage；不会自动提交 Git、上传 GitHub 或修改线上相册。局域网和公网不能访问此管理服务。

线上入口 <https://photography-hhs.pages.dev/studio> 显示本地管理说明，不再显示需要开通云端存储的登录表单。公开版本不加载本地编辑功能，也不轮询云端相册。

## 保存位置与备份

| 位置 | 内容 |
| --- | --- |
| `public/photos/` | 本机保存的展示图，以及原有公开照片 |
| `public/thumbnails/` | 缩略图 |
| `data/photos.json` | 拍摄信息、色板、标签等 |
| `data/removed-photos.json` | 删除标记 |
| `source-photos/` | 最近一次管理前的元数据备份、移除照片和失败写入的恢复文件；不提交、不部署 |

删除会把图片移入 `source-photos/removed/`，而非直接彻底擦除。请定期备份图片和元数据；项目文件夹丢失不会由网页自动恢复。`public/` 不是私有保险箱：本地模式仅绑定回环地址，但以后主动发布其中的照片就会公开。

补录旧图片、更新缩略图和色板的原有接口仍然保留：`pnpm extract-colors`，会先备份元数据并保留旧 ID、标题、日期、设备、标签和地点。

## 保留的 Git 同步接口

```bash
# 默认只预览相册变更，不写 Git、不联网、不上传
pnpm photos:sync

# 以后确认所有待发布照片都能公开，再主动执行
pnpm photos:sync --publish
```

发布接口仅处理 `data/photos.json`、删除标记、展示图和缩略图，不提交原片备份、密码或其他代码文件。要求 main 分支、暂存区为空、没有其他改动、HEAD 与 origin/main 一致；不会自动合并、强制推送或连带发布已有本地提交。

明确指定 `--publish` 后才会检查数据、执行 lint、类型检查、测试、生产依赖审计和公开版本构建，再提交并推送到 GitHub main。Cloudflare Pages 随后构建；接口会等待并验证新构建标记、各页面及 JS/CSS，最多等待 10 分钟。也可运行 `node --import tsx scripts/verify-deployment.ts` 单独检查。请先停止 `pnpm studio` 再发布，启动器未关闭时发布接口会拒绝继续，避免开发与生产构建同时操作 `.next`。

**Git 历史会保留已经提交的照片旧版本，删除照片也不等于清除历史。** 当前站点是公开作品网站，不是私密云相册。只有准备公开的照片才能使用发布接口。

## 开发与检查

```bash
pnpm dev
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm audit --prod
pnpm build
```

`pnpm dev` 是普通展示开发；`pnpm studio` 才自动启用本机管理。均使用 Webpack。仅在明确排查 Turbopack 时才运行 `pnpm dev:turbo`：这台机器曾出现严重的 Turbopack 内存增长。本地管理启动器在没有自定义限制时设置 Node 堆上限 2GB（不是整个系统/所有进程的总内存上限），并忽略备份及测试产物的文件监听。

生产部署项目名 `photography`，域名 <https://photography-hhs.pages.dev/>，从 GitHub main 自动构建。`pnpm start` 是静态导出的本地 Pages 预览，不是本机照片管理。

## 将来扩展云端存储

Cloudflare 的 `/api/*` 身份验证及存储实现保留，但 `PHOTO_STORAGE_MODE=local` 明确关闭云端读取和写入。已有专用 D1 配置保留，不需要创建 R2 桶或开通付费服务，也不会因为本地导入而访问这些云资源。

将来若选择云端方案，需要独立配置可用的图片存储、服务端凭据，以及 `PHOTO_STORAGE_MODE=cloud` 和 `NEXT_PUBLIC_ENABLE_REMOTE_STUDIO=true`。密码、Git 令牌和会话密钥不能放在网页、APK 或 NEXT_PUBLIC 环境变量里。手机直传必须使用经过身份验证的 HTTPS API；**绝不能把 `scripts/upload-server.ts` 暴露到公网或局域网。** `pnpm cf:dev` 保留为将来的本地云端模拟入口，并非当前日常使用方式。

旧版浏览器 `photo-edits` / `custom-photos` 数据没有被清除，但不再自动加载为公开内容；仅在浏览器里保存的旧草稿请先导出或重新导入原片。

## 私人 Android APK

`android/` 现为原生**独立离线相册**，不是 WebView 壳。应用名“光影视界 · 离线相册”，新包名 `com.hhs.photography.offline`，可与原有在线壳并存，不要求卸载旧应用。

- 系统相册/文件选择器多选，每批最多 100 张；**新导入引用系统原图，不复制原片**，SQLite 保存元数据及长期读取 URI 授权。授权失败会提示改用文件选择器，不会暗中退回复制模式。可断网导入本地原图、浏览和编辑；云端照片依赖提供者，不保证离线读取。
- 自动读取可用的日期、设备、镜头、ISO、光圈、快门和 GPS，校正方向并生成缩略图、色板；支持色彩筛选、搜索、设备/地点及存储统计。没有 EXIF 的信息不能恢复，可编辑补录。
- 只保留最长边 2560px 的去 EXIF 展示缓存及 400px 缩略图，不保存原文件，仍有少量缓存占用。详情优先读取原图，原图删除/移动或授权失效时明确标记“仅显示缓存”；重新选择相同内容的原图可修复引用，保留编辑。系统可能隐藏 GPS，无法绕过；元数据 GPS 约 1 公里精度。无拍摄日期时用文件日期或导入日期。HEIC/AVIF 取决于系统解码，不支持或超限的照片提示失败。
- 升级保留旧版独立原片副本和所有编辑，不自动转换或删除已有照片；界面区分引用与旧副本。系统授权存在数量上限，失效时需重新选择原图。
- 同一原片按 SHA-256 去重。每次只处理一张，有限尺寸解码、12MB 缩略图缓存；导入期间保持应用打开。系统杀进程时未完成项需重新选择，已完成项保留。
- 删除先入回收站，可恢复。永久删除会二次确认，仅删除应用自己的副本，不会动系统相册原片。
- **更多 / 备份 → 导出完整备份**：仅这次操作会读取并复制原图进 ZIP，包含编辑及回收站。原图失联或内容校验不一致时中止并提示，未完成 ZIP 不可作备份，不用缓存冒充原图。ZIP 未加密，可能含精确 GPS，请选可信保存位置。恢复为合并、不覆盖已有编辑；恢复的原图作为应用私有副本保留，不尝试重建系统引用。限制最多 10000 张、单片 25MB、元数据 16MB；拒绝未知路径。
- **卸载或清除数据会删除引用、编辑、展示缓存和旧版/恢复副本，请先备份。** 不会删除手机系统相册的原图；系统原图被删除则无法靠引用找回。不依赖 Android 自动云备份，不自动上传到网站。
- 不申请 INTERNET、相机、整盘或整个相册权限，只读取用户在系统选择器中主动选择的文件。“打开公开网站”会交给系统浏览器；手机私有照片不会出现在网站。

Git 接口保留在 **更多 / 备份 → 导出 Git 发布包**：仅含当前照片的展示图、缩略图和网站兼容元数据，不含原片，不是完整备份。传到电脑后：

```bash
pnpm photos:import /你的路径/hhs-git-photos.zip          # 只预览
pnpm photos:import /你的路径/hhs-git-photos.zip --save   # 合并到电脑，保留旧照片，不发布
pnpm photos:sync                                      # 查看待发布的改动
pnpm photos:sync --publish                            # 以后确认可以公开才运行
```

导入重复 ID 或已有删除标记会跳过，不覆盖电脑上已有的编辑；新展示图再次验证和清除 EXIF。Git 包不能用来恢复原片。

GitHub Actions 的 **Private Android APK** 工作流构建并在断网 Android 模拟器上检查引用授权、无原片副本、失联/重新关联、旧数据库无损升级、EXIF、方向、去重、重启读取、回收站、备份恢复及原生启动，全部通过后才上传 artifact 中的 **`photography-offline.apk`**。侧载时允许该安装来源即可，无账号登录要求；仍需在你的真机验证系统相册多选和 HEIC。

使用固定个人签名，后续同签名、同包名 APK 可覆盖升级保留数据，不要为升级先卸载。签名备份在忽略提交的 `source-photos/offline-signing.p12` 与 `offline-signing-password.txt`，构建只用仓库加密 Secrets，务必另行安全备份。`pnpm android:signing` 只准备/验证本机签名，`--upload` 才设置该仓库的签名 Secrets。不是应用商店发布版。

本机调试编译需要 JDK 17、Gradle 8.13、Android SDK 36：`pnpm android:build`。调试签名与交付的固定私人签名不同，不要卸载已有离线相册来安装调试版。

## 环境变量

- `NEXT_PUBLIC_ENABLE_LOCAL_STUDIO`：仅本机管理；生产必须为 false，启动器自动设置，不需要修改文件。
- `NEXT_PUBLIC_ENABLE_REMOTE_STUDIO`：可选的未来云端管理；当前默认 false。
- `NEXT_PUBLIC_SITE_URL`：照片分享卡片的绝对站点地址。
- `PHOTO_ADMIN_PASSWORD`：可选本机管理密码，不提交。
- `PHOTO_STORAGE_MODE`：Cloudflare 服务端存储开关，当前 local。
- `ADMIN_PASSWORD` / `SESSION_SECRET`：保留的未来云端服务端 secrets，不能作为公开环境变量。
