# 个人主页 · 独立栏目与液态玻璃控件

原生 HTML、CSS、JavaScript 的静态多页面网站。黑白极简视觉，小头像、独立插画封面；导航栏、栏目切换与部分操作按钮使用网页端玻璃效果；玻璃选中项具有滑动、轻微拉伸和高光动效。无第三方运行时依赖，无需安装 npm 包。

## 页面结构

- `/`：个人入口、栏目入口与最近三篇记录。
- `/library/`：全部内容，可搜索。
- `/notes/`、`/reports/`、`/projects/`：三个独立栏目。
- `/notes/rag-learning-notes/` 等：每篇笔记、报告与项目的独立正文页。
- `/about/`、`/contact/`：个人介绍和联系方式。

主导航为「首页、笔记与项目、关于」，联系单独作为操作入口。AI 笔记、学习报告和项目实践合并在「笔记与项目」父栏目下，仅在内容区域展示细分类目子导航。

所有页面均预先生成完整 HTML，可以直接刷新、分享、收藏。站内点击通过渐进增强的无刷新导航切换：顶栏保持不动，正文淡出与淡入，网址和页面标题同步更新。浏览器前进后退会恢复搜索条件与阅读位置；普通新标签页打开和手动刷新仍使用独立静态页面。请求失败、登录失效或部署版本变化时会回退到普通页面导航。没有单页应用的路由回退要求，支持 GitHub Pages 的根站点与仓库子路径。旧的 `/#entry=...`、`/#about` 等链接在 JavaScript 可用时自动跳转到对应新页面。

## 使用

需要 Node.js 22 或更新版本。

```sh
npm run build  # 从内容与模板生成 dist/
npm run dev    # 生成页面并在 http://127.0.0.1:4173 预览
npm run check  # 生成页面，检查链接并验证新增栏目
```

源码修改后重新执行 `npm run build`，浏览器刷新即可。页面不会自动热更新。

## 修改内容

所有内容集中在 `content/site.json`：

- `profile`：站点名称、姓名、个人介绍、兴趣、邮箱和社交链接。将 `demo` 改为 `false` 可移除个人资料的示例提示。
- `sections`：栏目配置，自动用于父栏目内的子导航、栏目入口和栏目列表页。
- `entries`：内容列表，自动生成卡片与独立正文。首页展示列表前 3 篇。

每篇内容的 `id` 使用唯一的小写英文、数字或连字符。`type` 对应一个栏目的 `type`。`sections` 填正文小节与段落，`tags` 填标签，`date` 留空不显示日期。`demo: true` 会保留明确的示例提示；换成真实内容后设为 `false`。

`visual` 选择卡片封面：`rag`（知识连接）、`report`（图表）、`project`（应用界面）、`prompt`（提示词）、`reading`（书页）、`garden`（网页布局）。项目的 `url` 与 `repository` 可填写演示和源码链接，仅接受 HTTP/HTTPS。

头像在 `public/assets/avatar.jpg`；插画在 `public/assets/wireframe.svg` 与 `src/covers.mjs`。修改源码而非 `dist/`，重新生成时 `dist/` 会被完整替换。

## 新增栏目

在 `sections` 数组增加一项，例如：

```json
{
  "id": "reading",
  "type": "reading",
  "label": "阅读",
  "title": "阅读记录",
  "eyebrow": "READING",
  "description": "整理阅读中的想法与问题。"
}
```

然后为新内容设置 `"type": "reading"`，执行构建。子导航、首页栏目入口、`/reading/` 列表页和 `/reading/内容id/` 正文页都会自动生成。不需要复制页面或手改子导航。主导航仍保持统一的父栏目入口。没有内容时，新栏目也会显示独立的空状态。

## 发布到 GitHub Pages

选择一种方式即可。

### 自动生成与发布

把源码上传到 `你的用户名.github.io` 仓库的 `main` 分支，包含 `.github/workflows/pages.yml`。在仓库 Settings → Pages → Source 选择 **GitHub Actions**。

此后修改 `content/site.json` 并提交，已附的工作流会检查、生成并部署 `dist/`。无需手动修改生成的 HTML，也无需安装项目依赖。

### 直接上传静态文件

执行 `npm run build` 后，将 **dist 内的文件** 上传到仓库根目录。Settings → Pages → Source 选择 **Deploy from a branch**，使用 `main` 与 `/ (root)`。交付的 `github-pages-homepage.zip` 已是这种可上传的静态版本，解压上传即可。

这两种方式分别对应源码仓库与静态产物，不要混用其目录结构。静态版更新内容需要从源码重新生成。

## 实现与验证

`scripts/build.mjs` 负责静态页面生成，`src/client.js` 负责无刷新导航、玻璃滑块、历史与滚动恢复、外观、搜索和复制链接。搜索支持 `/` 快捷键，关键词保存在 URL 中。桌面正文提供页内目录；移动端使用单列布局。

玻璃效果使用 `backdrop-filter`、渐变高光与阴影，是网页端的近似实现。遵循减少动态、减少透明效果偏好，并为不支持背景模糊的浏览器提供不透明底色。

`npm run check` 会检查全部内部链接、静态资源、项目子路径、每页主标题，以及动态新增栏目和文章的生成行为。GitHub Actions 工作流需要在用户的 GitHub 仓库中实际运行后才能验证云端部署。

设计参考：[Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials)。静态内容结构参考过 AstroPaper 和 AstroWind；没有复制它们的源码。头像由用户提供，不含外部字体、统计、远程图片或第三方脚本。

## 玻璃折射、散射与过渡维护

导航外壳、分类栏、选中胶囊及部分控件使用圆角形状的位移贴图。Chromium 中通过 SVG 背景滤镜模拟边缘折射；蓝色通道提供边缘遮罩，仅在边缘混合柔化结果，中央保持清晰。动态高光同时跟随表面和选中胶囊。Safari、Firefox 使用 CSS 玻璃兼容效果；不保证与 Chromium 的背景畸变一致。

在 `src/styles.css` 末尾的 Optical material controls 中调整：

```css
:root {
  --glass-warp: 8px;       /* 折射位移上限，实际受控件尺寸限制 */
  --glass-rim: 14px;       /* 边缘畸变区域宽度 */
  --glass-scatter: .65px;  /* 边缘柔化，中央不使用这层模糊 */
  --lens-fill: rgba(255,255,255,.08);
  --lens-glint: rgba(255,255,255,.38);
}
```

`.nav-lens` 单独使用 `5px / 8px / .35px`，以适应较小的胶囊。深色模式的透镜底色和高光另有覆盖。普通 `:root` 中的 `--glass`、`--control` 控制白色底色的不透明度，值越大越实；当前浅色为 `.14 / .20`，深色为 `.22 / .20`。`--glass-blur` 是 CSS 兼容模式的模糊参数。

顶栏和分类栏使用独立的 `.glass-material` 背景层，避免嵌套背景滤镜阻断选中胶囊的采样。保留模板里的背景 span 和 `.nav-lens.clear-glass { position:absolute }`。不要给顶栏添加 `view-transition-name`，它会隔离顶栏的背景采样；也不要对整块控件使用 `filter` 或 `opacity` 来代替背景效果，以免影响文字。

页面通过正文临时叠层交接，真实顶栏始终保留，玻璃与滑块可持续渲染。时长和位移仍由 `--page-duration`、`--page-ease`、`--page-shift` 控制。减少动态时直接切换；减少透明或增强对比度时使用清晰底色。临时叠层和离开页面的滤镜会在完成后清理。

验证时在 Chrome 中滚动，让插画或文字经过顶栏后方，检查边缘的局部偏移与中央清晰度；同时检查主导航、子分类、快速连点、搜索返回、手机布局和深浅色。大幅增加不透明底色会遮住背景畸变，即使位移滤镜仍在工作。
