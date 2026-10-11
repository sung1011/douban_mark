# 豆瓣一键看过

Chrome / Edge Manifest V3 扩展。在 `movie.douban.com` 与 `search.douban.com/movie` 的电影**封面海报左上角**显示角标（首页 / 榜单 / 搜索 / 条目详情都会打点）。

- **未看**：点击后直接 `POST /j/subject/{id}/interest`（`interest=collect`），用 cookie 里的 `ck` 做 CSRF。**不会**打开豆瓣原生「添加收藏」对话框，也没有第二层弹窗。
- **已看**：角标样式不同；再点只给短暂「已看过」反馈，不重开修改对话框、不重复 POST。
- 未登录或接口失败：角标红色闪一下，文案为「失败」，**不会**假装成功。
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

加载成功后，扩展列表里应出现「豆瓣一键看过」。需要 `host_permissions`：`https://movie.douban.com/*`（搜索页 `search.douban.com` 要跨域请求电影站接口）。

## 如何验证

1. 在浏览器里登录豆瓣（未登录点「未看」应闪红「失败」，不能变成「已看」）。
2. 打开条目页，例如 `https://movie.douban.com/subject/1292052/`：封面左上角有角标。
3. 打开列表/首页/搜索，例如 `https://movie.douban.com/top250`、`https://movie.douban.com/`、`https://search.douban.com/movie/subject_search?search_text=肖申克`：海报封面同样有角标（不只详情页）。
4. 点一枚「未看」：页面上**不应**出现豆瓣「添加收藏：修改」对话框；角标应变为「已看」。到该电影条目页确认豆瓣侧已是「看过」。
5. 再点「已看」：只短暂显示「已看过」，不要弹出修改框。
6. 搜索页多滚几次、或打开分类榜 `https://movie.douban.com/typerank?...`：新插入的封面也应出现角标。

本地夹具：用浏览器打开 `test/coverFixture.html`（需允许该页加载同目录脚本）。夹具会拦截 `fetch`，点「未看」应变「已看」，`#dialog` 里不应出现原生收藏框。

命令行：`python3 test/verifyMark.py`

## 实现要点

- 仅内容脚本：`markCore.js` + `content.js` + `content.css`。没有 background / service worker，没有 MAIN world，没有 `pageBridge.js`。
- 读状态：`GET https://movie.douban.com/j/subject_abstract?subject_id={id}`，看 `subject.collection_status === "collect"`。
- 写状态：`POST https://movie.douban.com/j/subject/{id}/interest`，表单 `ck={cookie ck}&interest=collect&rating=&foldcollect=F&tags=&comment=`，`credentials: include`。只有响应 JSON `r === 0` 才算成功。
- `ck` 从 `document.cookie` 里名为 `ck` 的项读取（豆瓣 CSRF）。没有 `ck` 视为未登录。
- 封面：带海报图的 `/subject/{id}` 链接，以及条目页 `#mainpic`。不打点短评/剧照子页、也跳过宽高小于 50px 的搜索建议缩略图。

## 选择器与接口风险

豆瓣前端可能改版。当前依据公开页面 HTML 核对过的结构：

| 目标 | 特征 | 风险 |
| --- | --- | --- |
| 条目封面 | `#mainpic`，id 来自 URL `/subject/{id}/` | 改 id 后详情页角标会消失 |
| Top250 等列表 | `.pic > a[href*="/subject/"] > img` | 改 class 仍可退化为「带图的 subject 链接」 |
| 首页热映 | `li.poster > a > img` | 轮播动态插入，依赖 MutationObserver |
| 排行榜 | `a.nbg > img` | 封面较小（约 75px），需与搜索建议 40px 缩略图区分 |
| 搜索 SPA | `.item-root a.cover-link img.cover`，结果后插入 | 无 MutationObserver 会漏打点 |
| 分类榜 | `.movie-content img.movie-img`（懒加载 `data-original`） | 绝对定位角标，避免再包一层把布局撑乱 |
| 状态接口 | `/j/subject_abstract?subject_id=` 的 `collection_status` | 字段改名后会全部显示「未看」 |
| 写入接口 | `/j/subject/{id}/interest` + `ck` | 缺 `ck` 或未登录会失败，角标闪红 |
