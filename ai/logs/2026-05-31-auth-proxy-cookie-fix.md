# 2026-05-31 Auth Proxy Cookie Fix

## Symptom

- 用户登录后访问工作区页面仍然看到 `Authentication is required.`
- 错误文案是英文，不符合当前中文产品方向。

## Root Cause

- Web 端默认把 API 地址硬编码为 `http://localhost:3001`。
- 在远程端口转发或非 `localhost:3000` 访问方式下，浏览器侧登录、页面数据请求和 cookie 归属不一定落在同一个站点语境里，导致后续页面请求被 API 判定为未认证。
- API 的未认证异常文案仍是英文，前端也会直接透传后端 `message`。

## Fix

- 新增 Next.js `/api/:path*` rewrite，默认代理到 `http://localhost:3001/:path*`。
- Web 端默认 API base 改为同源 `/api`，保留 `NEXT_PUBLIC_API_BASE_URL` 覆盖能力。
- 统一新增 API URL helper，避免后续继续硬编码 `localhost:3001`。
- API 未登录和登录失败文案改为中文。
- 前端增加 API 错误翻译兜底，旧英文错误也会显示中文。

## Guard Rails

- 新增 `api-base-url` 单测，要求默认 API base 是 `/api`。
- 更新登录、频道、流式事件、模型连接、新建同事等测试的请求地址断言。
- 保留 `API_PROXY_TARGET`，方便部署时把 `/api` 代理到不同 API 地址。

## Verification

- `pnpm --filter web exec vitest run --config vitest.config.ts src/lib/api-base-url.spec.tsx src/features/auth/auth-panel.spec.tsx src/features/chat/use-conversation-stream.spec.tsx src/features/channels/channel-shell.spec.tsx src/features/chat/chat-experience.spec.tsx src/features/settings/model-connections-panel.spec.tsx src/features/teammates/teammate-create-wizard.spec.tsx`
- `pnpm --filter api exec vitest run --config vitest.config.ts test/auth.contract-spec.ts`
- `pnpm --filter web build`
- `pnpm --filter api build`
- Manual proxy check:
  - `GET http://127.0.0.1:3000/api/health` returns `200`
  - unauthenticated `GET /api/conversations` returns Chinese `401`
  - `POST /api/auth/login` then authenticated `GET /api/conversations` returns `200`
