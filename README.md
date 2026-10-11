# 豆瓣收藏角标

Chrome / Edge Manifest V3 扩展。在豆瓣电影**条目详情页**（`/subject/{id}/`）的封面左上角显示小角标；点击后**不会**静默 POST「看过」，而是程序化地点击页面上已有的「看过 / 修改」入口，打开豆瓣自己的「添加收藏：修改」对话框。评分、短评、想看/看过状态都在豆瓣原生 UI 里完成。

列表、搜索、首页等页面**不会**注入可点击角标，也不会代发 `/j/subject/{id}/interest`。

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

加载成功后，扩展列表里应出现「豆瓣收藏角标」，无需额外权限。

## 如何验证

1. 先在浏览器里登录豆瓣（未登录时角标仍可点，会走豆瓣自己的登录流程，扩展不会代发收藏请求）。
2. 打开任意电影条目页，例如 `https://movie.douban.com/subject/1292052/`。
3. 封面海报左上角应出现绿色角标：未收藏时为「收藏」，已有标记时为「修改」。
4. 点击角标，应弹出豆瓣原生收藏对话框（标题类似「添加收藏：修改」），可打分、写短评、改状态后由豆瓣自己保存。
5. 对照：打开 `https://movie.douban.com/top250` 或 `https://search.douban.com/movie/subject_search?search_text=肖申克`，封面或条目上**不应**出现本扩展的可点击角标。

## 实现要点

- 仅内容脚本。条目页额外注入 MAIN world 脚本，调用页面里的 jQuery 点击；没有 background / service worker，也没有 `host_permissions`。
- 优先点击 `#interest_sect_level` 里文本为「修改」的链接；否则点 `name` 以 `-collect` 结尾的「看过」按钮（未登录时通常是 `a.a_show_login.colbutt`）。
- 豆瓣页面脚本本身会执行 `$('.collect_btn', '#interest_sect_level').each(function () { Douban.init_collect_btn(this); })`。扩展只复用这个入口，不复制收藏 POST。

## 选择器风险

豆瓣前端可能改版。当前依据公开条目页 HTML（含 Wayback 快照）核对过的结构：

| 目标 | 选择器 / 特征 | 风险 |
| --- | --- | --- |
| 封面容器 | `#mainpic` | 改 id 后面包角标会消失（不会退化为列表页打点） |
| 收藏区域 | `#interest_sect_level` | 与右侧评分盒 `#interest_sectl` 只差一个字母，改版时容易漏看 |
| 未收藏「看过」 | `a[name$="-collect"]`，常见 class：`colbutt` / `a_show_login` / `collect_btn` / `a_collect_btn` | 登录前后 class 不一致，因此以 `name` 和按钮文案为主 |
| 已收藏 | 链接文案「修改」 | 文案或改成图标时需要更新 |
| 必须排除 | 「删除」、`pbtn-{id}-1`～`5` 星级、`name` 以 `-wish` 结尾的「想看」 | 点错会变成删收藏或只开「想看」 |
| 弹层 | `#dialog` / `#overlay` | 若改成新前端组件，角标仍会点原生按钮，只是「是否已打开」的检测会失效 |

未登录时条目页上的「看过」往往带 `a_show_login`，点击后由豆瓣弹出登录，扩展不会改走接口。
