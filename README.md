# 一起去旅行 · travel-discuss

给朋友圈用的旅行协作网站（手机优先，可"添加到主屏幕"）。

- **出发前**：每个人提建议（地点卡片 + 评论 + 点「想去」），大家一起把建议排进按天的行程；也可以让 AI 先出一份候选方案，采纳后再手动调整。
- **旅途中**：首页自动变成「当前 / 下一站」，一键跳转高德或苹果地图导航，显示交通方式和今晚住哪；任何人点「完成」，全队的下一站一起前进。没网时可以看最后一次打开的行程快照。
- **旅途中/后**：照片视频按地点上传，原图保存在私有 COS 存储桶里。

另外还有：全局讨论区、简单记账、行程历史版本与回滚、打印版行程单。

## 技术栈

Next.js 16（App Router，前后端一体）· TypeScript · Tailwind CSS 4 · Drizzle ORM + PostgreSQL · SWR + SSE 实时同步 · S3 兼容存储（腾讯云 COS）· 高德 Web 服务 API · OpenAI 兼容大模型接口（DeepSeek / 通义千问）

## 本地开发

需要 Node 22+、pnpm、PostgreSQL。

```bash
pnpm install
createdb travel_discuss
cp .env.example .env.local   # 按需填写，见下文
pnpm dev                     # 启动时会自动执行数据库迁移
```

打开 http://localhost:3000 。

| 命令 | 作用 |
| --- | --- |
| `pnpm test` | 单元 + 数据库集成测试（使用 `travel_discuss_test` 库，会被清空重建） |
| `pnpm typecheck` / `pnpm lint` | 类型检查 / 代码检查 |
| `pnpm db:generate` | 修改 `src/db/schema.ts` 后生成新的迁移文件 |

## 配置

所有配置都通过环境变量提供（见 [.env.example](.env.example)）。高德、AI、存储这三项都是可选的：没配置时，对应功能会给出提示并降级，不影响其他功能。

### 高德地图（地点搜索）

在[高德开放平台](https://console.amap.com/)创建一个 **「Web 服务」** 类型的 Key，填到 `AMAP_WEB_SERVICE_KEY`。上线后把这个 Key 的 IP 白名单设为服务器公网 IP。

导航用的是高德/苹果地图的跳转链接，不需要 JS API Key。

### AI 候选方案

任何 OpenAI 兼容接口都可以：

- DeepSeek：`AI_BASE_URL=https://api.deepseek.com`，`AI_MODEL=deepseek-chat`
- 通义千问：`AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`，`AI_MODEL=qwen-plus`

AI 只会生成候选方案，必须有人点「采纳」才会替换当前计划，替换前还会自动保存一个版本。

### 腾讯云 COS（照片视频）

1. 创建存储桶，访问权限选 **私有读写**。
2. 在「访问管理 → API 密钥」创建子账号密钥，只授予这个桶的读写权限，填到 `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`。
3. `S3_ENDPOINT` 填 `https://cos.<地域>.myqcloud.com`，`S3_REGION` 填地域（如 `ap-shanghai`），`S3_BUCKET` 填完整桶名（如 `travel-1250000000`）。
4. **配置跨域（CORS）**，否则浏览器直传会失败。存储桶 → 安全管理 → 跨域访问 CORS 设置：
   - 来源 Origin：`https://你的域名`（本地调试可以再加 `http://localhost:3000`）
   - 操作 Methods：`PUT`、`GET`、`HEAD`
   - Allow-Headers：`*`
   - Expose-Headers：`ETag`
   - 超时 Max-Age：`600`

文件由浏览器直接上传到 COS（服务端只负责签发 1 小时有效的上传链接），查看时签发 6 小时有效的临时链接。

## 部署（Docker Compose）

```bash
cp .env.example .env    # 填写 POSTGRES_PASSWORD 和各项 Key
docker compose up -d --build
```

应用只监听 `127.0.0.1:3000`，前面需要用 Caddy 或 Nginx 做 HTTPS 反向代理。

- **挂在子路径下**（如 `https://example.com/travel`）：在 `.env` 里设置 `NEXT_PUBLIC_BASE_PATH=/travel` 后重新构建，反代时**保留**路径前缀，不要剥掉。
- **实时同步用的是 SSE**（`/api/trips/:id/events`）。Nginx 需要关闭缓冲（应用已经返回了 `X-Accel-Buffering: no`），并把 `proxy_read_timeout` 调大；Caddy 不需要额外配置。
- 实时推送和限流都只在单个进程内生效，所以只能跑**一个**应用实例。朋友规模完全够用。

Caddy 示例：

```
example.com {
  reverse_proxy 127.0.0.1:3000
}
```

## 线上部署（twincle）

- 地址：https://www.twincle.com.cn/travel （腾讯云上海 `124.223.185.175`，由共享 Caddy 容器 `a-share-web` 反代，不剥前缀）
- 容器：`travel-app`（Next.js，内存上限 512M）和 `travel-db`（postgres:17-alpine，内存上限 256M），都在 docker 网络 `a-share-net` 里，不映射宿主机端口
- 服务器目录 `/opt/travel-discuss/`：`app.env` 和 `db.env`（root 600，存放密钥和数据库密码，不要打印出来）、`pgdata/`（数据库数据）、`releases/<rev>/`（构建镜像用的源码）
- Caddy 配置段：在 `/opt/a-share-sector-pilot/deploy/Caddyfile` 里搜 `travel-discuss`；部署前的备份是 `Caddyfile.before-travel-20260926144202`

```bash
deploy/twincle.sh          # 在服务器上构建当前 HEAD 并替换 travel-app（数据库不动）
deploy/twincle.sh --keys   # 同时把 .env.local 里的高德/AI/COS Key 同步到服务器
ssh root@124.223.185.175 docker logs --tail 50 travel-app      # 查看日志
ssh root@124.223.185.175 docker images travel-discuss          # 旧镜像，用于回滚
```

回滚：`docker rm -f travel-app`，再用旧的 tag 按脚本里同样的 `docker run` 参数重新启动。

## 设计要点

- **身份**：邀请链接 + 昵称加入，每次旅行单独一个 httpOnly cookie。换设备时用「昵称 + 4 位 PIN」找回，连续错 5 次锁定 15 分钟。创建者是管理员，可以重置邀请链接、移出成员。
- **权限**：建议、评论、照片、账目只有作者本人和创建者能删；计划所有人都能改。
- **并发编辑**：以行程项为单位保存，后保存的覆盖先保存的；每次改动都会通过 SSE 通知其他人刷新。
- **版本**：编辑计划前，如果距上一个版本超过 30 分钟，会先自动存一个版本；采纳 AI 方案和回滚前也一定会先存一个。回滚时会保留原有的行程项 ID，照片的归属和打卡状态都不会丢。
- **离线**：Service Worker 只缓存行程信息和计划（网络优先，断网时才使用缓存），顶部会提示「离线快照」。
