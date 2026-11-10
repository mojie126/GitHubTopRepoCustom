# GitHubTopRepositoriesCustom

当前脚本版本：`2.4.0`

用于自定义 GitHub 首页左侧 `Top repositories` 仓库列表的篡改猴用户脚本，支持添加、删除、拖拽排序，并让原有仓库搜索框继续过滤自定义列表。

## 功能

- 在 GitHub 首页左侧 `Top repositories` 中管理自定义仓库列表
- 添加仓库时支持 `owner/repository`、`https://github.com/owner/repository` 和 `github.com/owner/repository`
- 删除自定义列表中的仓库
- 拖拽调整仓库顺序
- 拖拽经过目标仓库时显示蓝色插入标记和“放到第 N 位”提示
- 使用上方 `Find a repository...` 搜索框过滤当前自定义列表
- 搜索框输入内容时右侧显示 `×` 清除按钮，按 `Esc` 也可清空搜索并恢复完整列表
- 自动保存列表与顺序，刷新页面或重新打开 GitHub 后仍然保留
- 首次启用时自动导入当时可见的原生仓库
- 自定义列表和 GitHub 原生列表均不显示“更多”入口
- 自定义仓库链接保留 GitHub 仓库悬停详情所需的页面属性
- 从 GitHub 官方“更多”中加载的仓库，即使当前不在初始 7 项中，也能正常显示仓库名和头像
- 兼容 GitHub 局部页面更新、搜索框重建和原生分页加载

## 安装

1. 在浏览器中安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 在 Tampermonkey 控制面板中新建用户脚本，或编辑已有脚本。
3. 把 [GitHubTopRepositoriesCustom.user.js](./GitHubTopRepositoriesCustom.user.js) 的全部内容复制到编辑器中并保存。
4. 打开或刷新 [GitHub 首页](https://github.com/)。

GitHub 原站点中的 `.user.js` 文件不会直接触发安装，复制源码到 Tampermonkey 是最稳定的安装方式。

## 使用方法

页面左侧显示 `Top repositories` 卡片后，搜索框下方显示仓库列表，列表下方显示唯一的“添加仓库”按钮。

- 点击“添加仓库”，在展开的输入框中填写仓库全名或 GitHub 仓库地址，按 `Enter` 或点击“加入”
- 每个仓库条目右侧都有始终可见的 `×` 删除按钮，删除前会弹出确认
- 按住仓库条目左侧的拖拽柄并上下移动，调整顺序
- 在上方 `Find a repository...` 输入文字，实时过滤自定义仓库
- 搜索框有内容时，点击右侧 `×` 或按 `Esc` 清空搜索并恢复完整列表
- 默认显示全部自定义仓库

如果希望清空整个自定义列表，打开 Tampermonkey 的管理面板，在脚本菜单中选择“清空 Top repositories 自定义列表”。

## 地址格式

以下输入都会规范化为 `mojie126/AssRocket`：

```text
mojie126/AssRocket
https://github.com/mojie126/AssRocket
https://github.com/mojie126/AssRocket.git
github.com/mojie126/AssRocket
```

仅接受 GitHub 仓库地址，其他网站地址、GitHub 系统页面和格式无效的输入不会加入列表。

## 数据保存

仓库列表和顺序通过 Tampermonkey 的 `GM_getValue`、`GM_setValue` 保存在脚本管理器中，不使用 GitHub 账户权限，也不会向仓库或第三方服务上传自定义数据。

2.4.0 使用以下存储键：

- `github-top-repositories-v2`：自定义仓库列表及顺序
- `github-top-repositories-initialized-v2`：是否已完成首次导入
- `github-top-repositories-search-v2`：上次使用的仓库搜索条件
- `github-top-repositories-row-templates-v1`：从 GitHub 原生列表缓存的仓库行模板

首次升级到 2.x 时，脚本会读取并迁移旧版仓库列表和初始化状态。完成迁移后，新版使用 v2 存储键。

清除脚本管理器的数据会同时清空自定义列表。

## 版本更新

如果已经在 Tampermonkey 中安装旧版，安装新版本时必须覆盖原脚本内容，而不是在页面里直接打开仓库中的脚本文件。更新后确认脚本版本为 2.4.0，再刷新 GitHub 首页。

安装后可看到以下变化：

- 页面中不再显示“Show more”和“Show less”
- 仓库行悬停时不会出现“拖拽调整顺序”和“删除仓库名”提示
- 删除按钮位于仓库行垂直居中位置，点击后先显示确认对话框
- 无论是否使用仓库搜索，页面只保留一个“添加仓库”按钮，重复操作区会被自动清理
- 拖拽时目标行显示蓝色插入标记和“放到第 N 位”提示

## 兼容说明

- GitHub 页面采用动态渲染，脚本会监听卡片与搜索框的局部更新并同步自定义列表
- 两处 `Show more` 均隐藏，列表直接显示当前自定义仓库
- 自定义仓库链接带有 `data-hovercard-type="repository"` 和 `data-hovercard-url` 属性，供 GitHub 浮层识别
- 自定义列表只作用于 GitHub 首页左侧的 `Top repositories` 卡片
- GitHub 修改页面结构后，脚本可能需要更新仓库定位规则

## 故障排查

如果启用后没有看到自定义操作：

1. 确认 Tampermonkey 中脚本已启用，且地址匹配规则为 `https://github.com/*`
2. 刷新 GitHub 首页
3. 检查浏览器控制台是否有 `GitHub Top repositories` 相关错误
4. 确认 GitHub 语言和页面布局中仍显示 `Top repositories` 卡片
5. 提交问题时附上浏览器版本、脚本版本、页面截图和浏览器控制台错误

如果添加按钮没有响应、拖拽时没有目标位置提示、官方更多中的仓库显示为空行、搜索框无法清空、搜索后出现重复操作区，或删除按钮不可见，请确认脚本版本为 2.4.0 或更高，重新复制当前源码并刷新页面。

## 项目文件

- [GitHubTopRepositoriesCustom.user.js](./GitHubTopRepositoriesCustom.user.js)：可安装的 Tampermonkey 用户脚本

## 更新脚本

使用 Tampermonkey 打开脚本管理面板，在对应脚本中粘贴最新版本源码并保存，然后刷新 GitHub 首页。
