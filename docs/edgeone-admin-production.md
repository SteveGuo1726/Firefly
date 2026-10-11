# EdgeOne 正式后台接入（blog.casto.top）

此项目直接由 **EdgeOne Pages / Makers** 关联 GitHub `SteveGuo1726/Firefly` 的 `master` 分支自动发布。不要用 GitHub Actions 或 Vercel 覆盖正式域名。

## 已接入功能（无需新密钥）

- `/admin/`：正式后台入口。使用 GitHub Fine-grained PAT 登录。
- 浏览器验证 GitHub 本人和仓库写权限；正式站还会将 PAT 一次性提交到同源 `POST /api/admin/auth/pat-login`。EdgeOne Cloud Function 再次验证 GitHub 身份、写权限，创建 8 小时 **Secure / HttpOnly / SameSite=Lax** 会话；服务端只存储哈希会话标识，不存储 PAT。
- 后台文章、动态、归档、撤销及私有索引通过该会话访问 `firefly-auth-live` 和 `firefly-content-live` Blob。未登录不能写入。
- GitHub 源码、站点配置等直接写仓库的操作仍使用当前浏览器标签页中的 Fine-grained PAT；关闭标签页后不会从 localStorage 恢复凭证。
- `/api/live-content/health` 应返回 200；`/api/admin/auth/me` 在匿名状态应返回 200 与 `authenticated: false`，不再因为没配置 OAuth 而整体返回 503。

GitHub PAT 必须由 **SteveGuo1726** 持有且具备 `SteveGuo1726/Firefly` 仓库 Contents **Read and write** 权限。不要把 PAT 放进 GitHub 仓库、Issue 或聊天消息。服务端的 PAT 登录接口仅接受 `https://blog.casto.top` 同源 HTTPS 请求。

## 可选的 GitHub OAuth 免输 PAT 登录

若希望直接点击 GitHub 授权登录，需要在 GitHub 设置中创建 OAuth App，Homepage URL 填 `https://blog.casto.top`，Authorization callback URL **准确**填 `https://blog.casto.top/api/admin/auth/callback`。在 **EdgeOne Pages 当前项目的环境变量（正式环境）** 配置：

| 名称 | 值 |
| --- | --- |
| `FIREFLY_OAUTH_CLIENT_ID` | OAuth App Client ID |
| `FIREFLY_OAUTH_CLIENT_SECRET` | OAuth App Client Secret（保密） |
| `FIREFLY_OAUTH_CALLBACK_URL` | `https://blog.casto.top/api/admin/auth/callback` |
| `FIREFLY_ADMIN_LOGIN` | `SteveGuo1726`（可省略，默认此账号） |

三项 OAuth 配齐后将使用原有 GitHub OAuth + PKCE 通路，不会覆盖 PAT 会话登录端点。OAuth 会话**不包含仓库写入 Token**；涉及直接提交 GitHub 源码/配置的功能需用有 Contents 写权限的 PAT，日常实时内容编辑可以使用 OAuth Cookie。

## 可选的相册/图床管理代理

相册/图床服务与博客的 Blob 是**两个独立系统**，不能凭博客 GitHub Token 绕过图床权限。启用管理代理须在 EdgeOne Pages 项目环境变量中配置：

- `FIREFLY_GALLERY_SERVICE_SECRET`：必须与当前 `gallery-api.casto.top` 上游管理 Worker 的服务到服务 Secret 保持相同，长度至少 32 字符；**不得提交到仓库**。
- `FIREFLY_GALLERY_API_ORIGIN`：可省略，默认 `https://gallery-api.casto.top`。

服务端验证 HttpOnly 管理会话后才会携带服务密钥访问独立的图集管理服务。未配置服务密钥时相册管理代理保持 503 **关闭**，公开相册正常访问，不影响图库原图。

## 可选的私有文章内容索引

若访问私有仓库或 GitHub API 访问量较高，可在 EdgeOne 设置：

- `FIREFLY_GITHUB_OWNER=SteveGuo1726`（默认）
- `FIREFLY_GITHUB_REPO=Firefly`（默认）
- `FIREFLY_GITHUB_BRANCH=master`（默认；正式环境不要指向实验分支）
- `FIREFLY_GITHUB_CONTENT_READ_TOKEN`：具有 Contents read 权限的服务端 Token，仅需要时配置，**不在浏览器侧暴露**。

## 正式上线后验收

1. 不登录打开 `https://blog.casto.top/api/admin/auth/me`，应返回 `{"authenticated":false,"user":null}`（响应可能包含其他无敏感信息的字段）。
2. 不登录访问 `/api/admin/private-index`，应返回 **401**；`/api/live-content/health` 返回 **200**。
3. 登录 `https://blog.casto.top/admin/`，检查账号和分支为 `SteveGuo1726` / `master`；刷新后 `/api/admin/auth/me` 应返回 `authenticated:true`。
4. 保存一条测试动态、刷新页面确认仍存在，再删除测试数据；检查退出后 `/api/admin/auth/me` 重新返回匿名。
5. 若需图床管理，先配置上游服务密钥，再执行相册/文件管理读写验收。不要对正式图库执行破坏性测试。

环境变量更新通常要在 EdgeOne 项目中触发新部署才会生效。GitHub Actions 仓库 Secrets 不会自动注入 EdgeOne 项目。不要将密钥加入 `edgeone.json`。
