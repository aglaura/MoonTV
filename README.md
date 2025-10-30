# MoonTV

<div align="center">
  <img src="public/logo.png" alt="LibreTV Logo" width="120">
</div>

> 🎬 **MoonTV** 是一個開箱即用的、跨平台的影視聚合播放器。它基於 **Next.js 14** + **Tailwind&nbsp;CSS** + **TypeScript** 建構，支援多資源搜尋、線上播放、收藏同步、播放記錄、本地/雲端儲存，讓你可以隨時隨地暢享海量免費影視內容。

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-14-000?logo=nextdotjs)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3-38bdf8?logo=tailwindcss)
![TypeScript](https://img.shields.io/badge/TypeScript-4.x-3178c6?logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green)
![Docker Ready](https://img.shields.io/badge/Docker-ready-blue?logo=docker)

</div>

---

## ✨ 功能特性

- 🔍 **多源聚合搜尋**：內建數十個免費資源站點，一次搜尋立刻返回全源結果。
- 📄 **豐富詳情頁**：支援劇集列表、演員、年份、簡介等完整資訊展示。
- ▶️ **流暢線上播放**：整合 HLS.js & ArtPlayer。
- ❤️ **收藏 + 繼續觀看**：支援 Redis/D1 儲存，多端同步進度。
- 📱 **PWA**：離線快取、安裝到桌面/主畫面，行動端原生體驗。
- 🌗 **響應式佈局**：桌面側邊欄 + 行動裝置底部導覽，自適應各種螢幕尺寸。
- 🚀 **極簡部署**：一條 Docker 命令即可將完整服務跑起來，或免費部署到 Vercel 和 Cloudflare。
- 👿 **智慧去廣告**：自動跳過影片中的切片廣告（實驗性）

<details>
  <summary>點擊檢視專案截圖</summary>
  <img src="public/screenshot.png" alt="项目截图" style="max-width:600px">
</details>

## 🗺 目录

- [技术栈](#技术栈)
- [部署](#部署)
- [Docker Compose 最佳实践](#Docker-Compose-最佳实践)
- [环境变量](#环境变量)
- [配置说明](#配置说明)
- [管理员配置](#管理员配置)
- [AndroidTV 使用](#AndroidTV-使用)
- [Roadmap](#roadmap)
- [安全与隐私提醒](#安全与隐私提醒)
- [License](#license)
- [致谢](#致谢)

## 技术栈

| 分类       | 主要依赖                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| 前端框架   | [Next.js 14](https://nextjs.org/) · App Router                                                        |
| UI & 樣式  | [Tailwind&nbsp;CSS 3](https://tailwindcss.com/)                                                       |
| 語言       | TypeScript 4                                                                                          |
| 播放器     | [ArtPlayer](https://github.com/zhw2590582/ArtPlayer) · [HLS.js](https://github.com/video-dev/hls.js/) |
| 程式碼品質 | ESLint · Prettier · Jest                                                                              |
| 部署       | Docker · Vercel · CloudFlare pages                                                                    |

## 部署

本项目**支援 Vercel、Docker 和 Cloudflare** 部署。

### Vercel 部署

> 推薦使用，零維運成本，免費額度足夠個人使用。

1. **Fork** 本倉庫到你的 GitHub 帳戶。
2. 登入 Vercel，點選 **Add New → Project**，選擇 Fork 後的倉庫。
3. （強烈建議）設定 PASSWORD 環境變數。
4. 保持預設設定完成首次部署。
5. 如需自訂 `config.json`，請直接修改 Fork 後倉庫中該檔案。
6. 每次 Push 到 `main` 分支將自動觸發重新建構。

部署完成後即可透過分配的域名存取，也可以綁定自訂域名。

### Cloudflare 部署

**Cloudflare Pages 的環境變數盡量設定為金鑰而非文字**

#### 普通部署（localstorage）

1. **Fork** 本倉庫到你的 GitHub 帳戶。
2. 登入 Cloudflare，點選 **計算（Workers）-> Workers 和 Pages**，點選建立
3. 選擇 Pages，匯入現有的 Git 存放庫，選擇 Fork 後的倉庫
4. 建構命令填寫 **pnpm install --frozen-lockfile && pnpm run pages:build**，預設框架為無，建構輸出目錄為 `.vercel/output/static`
5. 保持預設設定完成首次部署。進入設定，將相容性標誌設定為 `nodejs_compat`
6. （強烈建議）首次部署完成後進入設定，新增 PASSWORD 金鑰（變數和機密下），而後重試部署。
7. 如需自訂 `config.json`，請直接修改 Fork 後倉庫中該檔案。
8. 每次 Push 到 `main` 分支將自動觸發重新建構。

#### D1 支持

1. 點選 **儲存和資料庫 -> D1 SQL 資料庫**，建立一個新的資料庫，名稱隨意
2. 進入剛建立的資料庫，點選左上角的 Explore Data，將 D1 初始化 中的內容貼到 Query 視窗後點選 Run All，等待執行完成
3. 返回你的 pages 專案，進入 **設定 -> 綁定**，新增綁定 D1 資料庫，選擇你剛建立的資料庫，變數名稱填 **DB**
4. 設定環境變數 NEXT_PUBLIC_STORAGE_TYPE，值為 d1；設定 USERNAME 和 PASSWORD 作為站長帳號
5. 重試部署

### Docker 部署

> 適用於自建伺服器 / NAS / 群暉等場景。

#### 1. 直接运行（最简单）

```bash
# 拉取預建構映像
docker pull ghcr.io/senshinya/moontv:latest

# 執行容器
# -d: 背景執行  -p: 映射埠 3000 -> 3000
docker run -d --name moontv -p 3000:3000 ghcr.io/senshinya/moontv:latest
```

访问 `http://服务器 IP:3000` 即可。（需自行到服务器控制台放通 `3000` 端口）

## Docker Compose 最佳实践

若你使用 docker compose 部署，以下是一些 compose 示例

### local storage 版本

```yaml
services:
  moontv:
    image: ghcr.io/senshinya/moontv:latest
    container_name: moontv
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      - PASSWORD=your_password
    # 如需自定义配置，可挂载文件
    # volumes:
    #   - ./config.json:/app/config.json:ro
```

### Redis 版本（推荐，多账户数据隔离，跨设备同步）

```yaml
services:
  moontv-core:
    image: ghcr.io/senshinya/moontv:latest
    container_name: moontv
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      - USERNAME=admin
      - PASSWORD=admin_password
      - NEXT_PUBLIC_STORAGE_TYPE=redis
      - REDIS_URL=redis://moontv-redis:6379
      - NEXT_PUBLIC_ENABLE_REGISTER=true
    networks:
      - moontv-network
    depends_on:
      - moontv-redis
    # 如需自定义配置，可挂载文件
    # volumes:
    #   - ./config.json:/app/config.json:ro
  moontv-redis:
    image: redis
    container_name: moontv-redis
    restart: unless-stopped
    networks:
      - moontv-network
    # 如需持久化
    # volumes:
    #   - ./data:/data
networks:
  moontv-network:
    driver: bridge
```

## 自动同步最近更改

建议在 fork 的仓库中启用本仓库自带的 GitHub Actions 自动同步功能（见 `.github/workflows/sync.yml`）。

如需手动同步主仓库更新，也可以使用 GitHub 官方的 [Sync fork](https://docs.github.com/cn/github/collaborating-with-issues-and-pull-requests/syncing-a-fork) 功能。

## 环境变量

| 变量                        | 说明                                                        | 可选值                                                  | 默认值                                                                                                                     |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| USERNAME                    | redis 部署时的管理员账号                                    | 任意字符串                                              | （空）                                                                                                                     |
| PASSWORD                    | 默认部署时为唯一访问密码，redis 部署时为管理员密码          | 任意字符串                                              | （空）                                                                                                                     |
| SITE_NAME                   | 站点名称                                                    | 任意字符串                                              | MoonTV                                                                                                                     |
| ANNOUNCEMENT                | 站点公告                                                    | 任意字符串                                              | 本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。 |
| NEXT_PUBLIC_STORAGE_TYPE    | 播放记录/收藏的存储方式                                     | localstorage（本地浏览器存储）、redis（仅 docker 支持） | localstorage                                                                                                               |
| REDIS_URL                   | redis 连接 url，若 NEXT_PUBLIC_STORAGE_TYPE 为 redis 则必填 | 连接 url                                                | 空                                                                                                                         |
| NEXT_PUBLIC_ENABLE_REGISTER | 是否开放注册，仅在 redis 部署时生效                         | true / false                                            | false                                                                                                                      |
| NEXT_PUBLIC_SEARCH_MAX_PAGE | 搜索接口可拉取的最大页数                                    | 1-50                                                    | 5                                                                                                                          |
| NEXT_PUBLIC_IMAGE_PROXY     | 默认的浏览器端图片代理                                      | url prefix                                              | (空)                                                                                                                       |

## 配置说明

所有可自定义项集中在根目录的 `config.json` 中：

```json
{
  "cache_time": 7200,
  "users": [
    {
      "username": "media-admin",
      "password": "MediaAdmin@123",
      "role": "admin"
    },
    {
      "username": "media-viewer",
      "password": "MediaViewer@123"
    },
    {
      "username": "esmee",
      "password": "Esmee@123",
      "role": "admin"
    }
  ],
  "api_site": {


- `cache_time`：接口缓存时间（秒）。
- `users`：可选，用于预置登录账户（仅 Redis / D1 存储模式生效），字段包括 `username`、`password` 以及可选的 `role`（`user` 或 `admin`）。
- `api_site`：你可以增删或替换任何资源站，字段说明：
  - `key`：唯一标识，保持小写字母/数字。
  - `api`：资源站提供的 `vod` JSON API 根地址。
  - `name`：在人机界面中展示的名称。
  - `detail`：（可选）部分无法通过 API 获取剧集详情的站点，需要提供网页详情根 URL，用于爬取。

MoonTV 支持标准的苹果 CMS V10 API 格式。

修改后 **无需重新构建**，服务会在启动时读取一次。

## 管理员配置

**该特性目前仅支持通过 Docker+Redis 或 Cloudflare+D1 的部署方式使用**

支持在运行时动态变更服务配置

设置环境变量 USERNAME 和 PASSWORD 即为站长用户，站长可设置用户为管理员

站长或管理员访问 `/admin` 即可进行管理员配置

## AndroidTV 使用

目前该项目可以配合 [OrionTV](https://github.com/zimplexing/OrionTV) 在 Android TV 上使用，可以直接作为 OrionTV 后端

暂时收藏夹与播放记录和网页端隔离，后续会支持同步用户数据

## Roadmap

- [x] 深色模式
- [x] 持久化存储
- [x] 多账户

## 安全与隐私提醒

### 强烈建议设置密码保护

为了您的安全和避免潜在的法律风险，我们**强烈建议**在部署时设置密码保护：

- **避免公开访问**：不设置密码的实例任何人都可以访问，可能被恶意利用
- **防范版权风险**：公开的视频搜索服务可能面临版权方的投诉举报
- **保护个人隐私**：设置密码可以限制访问范围，保护您的使用记录

### 部署建议

1. **设置环境变量 `PASSWORD`**：为您的实例设置一个强密码
2. **仅供个人使用**：请勿将您的实例链接公开分享或传播
3. **遵守当地法律**：请确保您的使用行为符合当地法律法规

### 重要声明

- 本项目仅供学习和个人使用
- 请勿将部署的实例用于商业用途或公开服务
- 如因公开分享导致的任何法律问题，用户需自行承担责任
- 项目开发者不对用户的使用行为承担任何法律责任

## License

[MIT](LICENSE) © 2025 MoonTV & Contributors

## 致谢

- [ts-nextjs-tailwind-starter](https://github.com/theodorusclarence/ts-nextjs-tailwind-starter) — 项目最初基于该脚手架。
- [LibreTV](https://github.com/LibreSpark/LibreTV) — 由此启发，站在巨人的肩膀上。
- [ArtPlayer](https://github.com/zhw2590582/ArtPlayer) — 提供强大的网页视频播放器。
- [HLS.js](https://github.com/video-dev/hls.js) — 实现 HLS 流媒体在浏览器中的播放支持。
- 感谢所有提供免费影视接口的站点。
```
