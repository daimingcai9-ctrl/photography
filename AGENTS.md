# Repository workflow

- Run all project commands from `/Users/cdm/vscode/personal-photograph-show`.
- Use `pnpm dev` for local development. Do not use `pnpm dev:turbo` unless the user explicitly requests Turbopack debugging; this machine has experienced severe Turbopack memory growth.
- After any requested code or content change, run `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm audit --prod`, and `pnpm build` as appropriate.
- When the user requested a change (not a read-only review), commit the completed task to Git and push `main` after the checks pass. Do not leave verified task changes only in the local worktree.
- The production site is `https://photography-hhs.pages.dev/` and deploys from the GitHub `main` branch through Cloudflare Pages.
- After pushing, wait for Cloudflare Pages and verify `/`, `/gallery`, `/map`, `/analytics`, one `/photo/[id]` route, and the static JS/CSS assets referenced by the gallery. Report deployment success only after the new build marker or headers are visible and those checks return HTTP 200.
- Public builds must keep local-only editing controls disabled. Mobile uploads must use an authenticated HTTPS API; never expose `scripts/upload-server.ts` publicly.
- After changing Android UI assets, run `pnpm android:publish-ui --notes "..."` before checks/commit. It signs a UI-only package for the fixed HTTPS update endpoint. Never commit or rotate `source-photos/ui-update-private.pem`; losing/changing that key requires restoring it or distributing a new APK. `pnpm build` rejects unsigned/stale UI packages. Native/bridge-incompatible changes still require a new APK/protocol, not a UI-only update.
