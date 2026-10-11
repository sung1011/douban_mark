# 豆瓣看过角标

Chrome / Edge Manifest V3 扩展。在 `movie.douban.com` 与 `search.douban.com/movie` 的电影**封面海报内左上角**显示只读状态 emoji（首页 / 榜单 / 搜索 / 条目详情都会打点）。不占用封面上方空白，也不挡标题。

角标文案 = **仅一个 statusEmoji**（不附加电影/剧集类型 emoji，不写中文状态词；`title` 仍用中文解释，例如 `想看`）。无底板、无色块。

### 状态映射

`/j/subject_abstract` 的 `subject.collection_status` 会返回英文码、单字母码或中文。统一归到四态：

| 原始值 | 归一 | 角标 |
| --- | --- | --- |
| 空 / `none` / 未知 | 未看 | 👀 |
| `wish` / `F` / `想看` | 想看 | ❤️ |
| `do` / `在看` | 在看 | 🟠 |
| `collect` / `P` / `看过` | 看过 | ✅ |

样例：`👀` `❤️` `🟠` `✅`。不显示 🎬 / 📺。

- **只读、点击穿透**：角标 `pointer-events: none`，点击会落到下方封面/海报，打开条目页，和没有角标时一样。**不会** `POST` 收藏，也不会打开豆瓣原生对话框。
- 搜索、分类榜等动态插入的封面靠 `MutationObserver` 补打点。

## 本地加载

本仓库是未打包源码，无构建步骤。用浏览器「加载已解压的扩展程序」即可。

### Chrome

1. 打开 `chrome://extensions`
2. 右上角打开「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选中本仓库根目录（含 `manifest.json` 的文件夹）

### Edge

1. 打开 `edge://extensions`
2. 左侧打开「开发人员模式」
3. 点击「加载解压缩的扩展」
4. 选中本仓库根目录

加载成功后，扩展列表里应出现「豆瓣看过角标」。需要 `host_permissions`：`https://movie.douban.com/*`（搜索页 `search.douban.com` 要跨域请求电影站接口）。

## 如何验证

1. 在浏览器里登录或不登录均可：角标只读，点上去应打开封面链接，不应出现「添加收藏」对话框，也不应改写看过状态。
2. 打开条目页，例如 `https://movie.douban.com/subject/1292052/`：封面内左上角有一个状态 emoji（叠在海报上、无底板），应为 `👀` / `❤️` / `🟠` / `✅` 之一。封面上方不应被 `padding-top` 撑出空白。
3. 打开剧集条目，例如 `https://movie.douban.com/subject/3016187/`：同样只显示状态 emoji，不应出现 🎬 / 📺。
4. 打开列表/首页/搜索，例如 `https://movie.douban.com/top250`、`https://movie.douban.com/`、`https://search.douban.com/movie/subject_search?search_text=肖申克`：海报封面内左上角同样有角标（叠在海报上、不挡标题）。
5. 点角标区域：应进入封面链接对应页面，角标文案不变。
6. 搜索页多滚几次、或打开分类榜 `https://movie.douban.com/typerank?...`：新插入的封面也应出现角标。

本地夹具：用浏览器打开 `test/coverFixture.html`（需允许该页加载同目录脚本）。夹具会拦截 `fetch`，角标应为单个状态 emoji 并叠在封面内左上角；`#autoResult` 里 `posted` 应为 `false`，`pointerEvents` 应为 `none`，`insideCover` 应全为 `true`。

命令行：`python3 test/verifyMark.py`

## 实现要点

- 仅内容脚本：`markCore.js` + `content.js` + `content.css`。没有 background / service worker，没有 MAIN world，没有 `pageBridge.js`。
- 读状态与类型：`GET https://movie.douban.com/j/subject_abstract?subject_id={id}`。状态看 `subject.collection_status`（`collect`/`P`/`看过`/`wish`/`F`/`想看`/`do`/`在看`/空）；类型优先 `subject.is_tv`，其次 `subject.subtype`（`Movie` / `TV`），并兼容 `type_name` / `media_type` 等字段。类型仅写入 `data-subject-type`，不进入角标文案。
- 类型回退：若接口没有类型，且当前是该条目的详情页，则从 DOM 提示推断（`og:type`、`#info` 里的「集数 / 单集片长」、标题里的「电视剧」等）。
- 角标为装饰 `span`，`pointer-events: none`，背景透明、无色块底板，不绑定点击、不读取 `ck`、不调用 `/j/subject/{id}/interest`。挂在封面 host 内左上角：host 仅 `position: relative`（无 `padding-top`），角标 `position: absolute; top/left`，叠在海报上。
- 封面：带海报图的 `/subject/{id}` 链接，以及条目页 `#mainpic`。不打点短评/剧照子页、也跳过宽高小于 50px 的搜索建议缩略图。

## 选择器与接口风险

豆瓣前端可能改版。当前依据公开页面 HTML / JSON 核对过的结构：

| 目标 | 特征 | 风险 |
| --- | --- | --- |
| 条目封面 | `#mainpic`，id 来自 URL `/subject/{id}/` | 改 id 后详情页角标会消失 |
| Top250 等列表 | `.pic > a[href*="/subject/"] > img` | 改 class 仍可退化为「带图的 subject 链接」 |
| 首页热映 | `li.poster > a > img` | 轮播动态插入，依赖 MutationObserver |
| 排行榜 | `a.nbg > img` | 封面较小（约 75px），需与搜索建议 40px 缩略图区分；角标叠在封面内左上角 |
| 搜索 SPA | `.item-root a.cover-link img.cover`，结果后插入 | 无 MutationObserver 会漏打点 |
| 分类榜 | `.movie-content img.movie-img`（懒加载 `data-original`） | 绝对定位角标叠在封面上，避免再包一层或用 padding 把布局撑乱 |
| 状态接口 | `/j/subject_abstract?subject_id=` 的 `collection_status` | 未映射的码会显示未看 👀 |
| 类型接口 | 同接口的 `is_tv` / `subtype` | 字段缺失时不写 `data-subject-type`，角标仍只显示状态 emoji |
