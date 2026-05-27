# Competitor Screenshot Hub｜实施计划

- 日期：2026-05-19
- 对应 PRD：`docs/plans/2026-05-19-competitor-screenshot-hub-prd-final.md`
- 项目名：`competitor-screenshot-hub`
- 目标：新建独立 GitHub Pages 项目，实现竞品截图库、流程库、搜索筛选、采集任务入口、任务状态页，并预留 Cloudflare Worker/D1 + 本地执行器闭环。

## 0. 执行原则

1. 先做可展示、可查阅的静态工具站。
2. 再接任务提交与状态页。
3. 最后接轻量任务 API 和本地执行器。
4. 所有截图资产先建立 metadata，避免直接做图片墙。
5. 高风险采集节点只做暂停和原因说明，不自动推进。
6. 每个阶段都要有可验证结果：本地启动、页面可见、数据可查、构建通过。

## 1. 阶段 V0.1：项目初始化 + 静态站骨架

### 任务 1.1 新建项目目录

目标：创建独立项目 `competitor-screenshot-hub`。

操作：
- 使用 Vite + React + TypeScript 初始化。
- 接入 Tailwind CSS。
- 配置 GitHub Pages 静态构建基础。
- 建立基础目录：`src/`、`data/`、`public/screenshots/`、`docs/`、`scripts/`。

验收：
- `npm install` 成功。
- `npm run dev` 可启动。
- `npm run build` 通过。

### 任务 1.2 建立基础路由和布局

目标：完成网站骨架。

页面：
- `/` 首页
- `/library` 截图库
- `/flows` 流程库
- `/search` 搜索页
- `/request` 采集需求页
- `/tasks` 任务状态页

验收：
- 每个页面可访问。
- 顶部导航可跳转。
- 首页展示项目定位、统计卡片、快捷入口。

## 2. 阶段 V0.2：数据模型 + 现有资产导入

### 任务 2.1 定义静态数据 schema

目标：建立第一版 JSON 数据结构。

文件：
- `data/competitors.json`
- `data/screenshots.json`
- `data/flows.json`
- `data/tags.json`
- `data/supported-capabilities.json`

验收：
- JSON 可被前端读取。
- 类型定义在 `src/types.ts` 中。
- 数据字段覆盖 PRD final 的 Screenshot / Flow / SupportedCapability。

### 任务 2.2 编写资产导入脚本初版

目标：从已有目录生成截图 metadata 草稿。

输入：
- `/Users/owinliu/Desktop/竞品分析`
- `outputs/per-image-ledger/`
- `radar/golden-flow-radar/`

输出：
- `data/screenshots.json`
- `data/flows.json`
- `public/screenshots/...` 图片副本或占位路径

验收：
- 至少导入 5 个竞品的截图索引。
- 每张截图有 id、competitor、appKey、imagePath、sourcePath、status、sensitiveStatus。
- 导入结果可被前端页面展示。

### 任务 2.3 建立 8 个 APP 支持能力清单

目标：写入第一版 `supported-capabilities.json`。

APP：
- 小赢卡贷
- 度小满
- 安逸花
- 奇富借条
- 分期乐
- 拍拍贷
- 京东金融
- 马上金融

验收：
- 每个 APP 有 appKey、appName、installed、supportedFlows、lowRiskActions、stopPoints。
- stopPoints 覆盖身份证、人脸、银行卡、协议签署、授信/借款提交、支付/提现/还款/转账、验证码/密码。

## 3. 阶段 V0.3：截图库 + 搜索筛选

### 任务 3.1 截图库卡片视图

目标：展示所有截图卡片。

能力：
- 缩略图/原图展示。
- 展示竞品、流程、节点、标签、状态。
- 空状态和加载状态。

验收：
- `/library` 可以看到导入截图。
- 图片路径正确。
- 卡片信息来自 metadata。

### 任务 3.2 筛选能力

目标：支持多维筛选。

筛选项：
- 竞品
- 流程
- 业务模块
- 标签
- 敏感状态/复核状态

验收：
- 多筛选组合可用。
- 清空筛选可恢复全部。

### 任务 3.3 搜索页

目标：支持关键词搜索。

技术：Fuse.js 或 MiniSearch。

搜索字段：
- 竞品名
- 流程名
- 页面节点
- 页面说明
- 可见关键文案
- 标签

验收：
- 搜索“度小满”“客服入口”“借钱”等能返回相关结果。
- 搜索结果可跳转详情页。

## 4. 阶段 V0.4：流程库 + 截图详情页

### 任务 4.1 截图详情页

目标：展示单张截图完整上下文。

字段：
- 原图
- 竞品
- 流程
- 页面节点
- 页面说明
- 可见关键文案
- 标签
- 截图时间/版本
- 来源文件名
- 敏感信息状态

验收：
- `/screenshots/:id` 可访问。
- 截图库和搜索结果可跳转。

### 任务 4.2 流程库

目标：展示流程列表和流程详情。

首批流程：
- 分期乐授信/激活额度流程
- 度小满查看额度/授信流程

验收：
- `/flows` 展示流程列表。
- 流程详情展示节点、截图、待补采/人工接管状态。

## 5. 阶段 V0.5：采集需求入口 + 任务状态页前端

### 任务 5.1 采集需求表单

目标：用户可提交采集需求。

字段：
- APP
- 流程
- 页面/问题
- 背景说明
- 联系方式，可选
- 优先级，可选

第一版前端先可写入 mock task 或调用占位 API。

验收：
- 表单校验可用。
- 提交后生成任务并跳转任务详情/任务列表。

### 任务 5.2 任务状态页

目标：展示任务列表与任务详情。

状态：
- 已收到
- 排队中
- 执行中
- 等待人工接管
- 已完成
- 复核入库完成
- 暂不支持
- 失败

验收：
- `/tasks` 展示任务列表。
- 任务详情展示已采集节点、暂停原因、结果截图。
- 支持“边采边展示”的数据结构。

## 6. 阶段 V0.6：Cloudflare Worker/D1 任务 API

### 任务 6.1 Worker 项目初始化

目标：建立任务 API。

API：
- `POST /api/tasks`
- `GET /api/tasks`
- `GET /api/tasks/:id`
- `POST /api/tasks/:id/events`
- `POST /api/tasks/:id/complete`
- `POST /api/tasks/:id/fallback-issue`

验收：
- 本地 wrangler dev 可运行。
- API 可返回 mock/真实 D1 数据。

### 任务 6.2 D1 数据表设计

目标：存储任务、任务事件、节点进度。

表：
- `tasks`
- `task_events`
- `task_nodes`

验收：
- 能创建任务。
- 能查询任务列表和详情。
- 能追加节点事件。

### 任务 6.3 前端接入任务 API

目标：采集需求页和任务状态页接入真实 API。

验收：
- 提交任务写入 D1。
- 任务状态页读取 D1。
- 任务事件可以展示。

## 7. 阶段 V0.7：本地执行器 MVP

### 任务 7.1 本地执行器框架

目标：建立 `scripts/local-executor.mjs`。

能力：
- 轮询 queued 任务。
- 判断 supported-capabilities。
- 标记 running。
- 写入事件。
- 遇到 unsupported 转状态。

验收：
- 可用测试任务跑通状态更新。

### 任务 7.2 低风险截图动作封装

目标：封装基础动作。

动作：
- 打开 APP。
- 当前页截图。
- 点击已知导航。
- 滚动只读页面。
- 保存截图。

验收：
- 至少一个 APP 的低风险页面可截图落盘。
- 截图路径回写任务事件。

### 任务 7.3 高风险暂停机制

目标：遇到 stopPoints 自动暂停。

验收：
- 检测到身份证/人脸/协议提交/借款提交等节点时，状态更新为 waiting-human。
- 任务页显示暂停原因和已采节点。

## 8. 阶段 V0.8：回流 GitHub + 发布

### 任务 8.1 采集结果回流

目标：将截图和 metadata 回流仓库。

路径：
- `public/screenshots/tasks/<taskId>/`
- `data/tasks-output.json` 或更新 `data/screenshots.json`

验收：
- 新截图可在任务页展示。
- 复核后可进入正式截图库。

### 任务 8.2 GitHub Pages 发布

目标：发布公开站点。

验收：
- GitHub Actions 构建通过。
- GitHub Pages URL 可访问。
- 首页、截图库、搜索、流程库、任务页可正常打开。

## 9. 质量检查

每个阶段至少执行：

- `npm run build`
- 关键页面手动检查
- 数据 JSON 校验
- 图片路径检查

发布前额外检查：

- 敏感字段检查。
- 图片是否缺失。
- 任务状态是否可读。
- 高风险节点说明是否明确。
- 免责声明是否存在。

## 10. 建议执行顺序

先执行 V0.1-V0.4，得到一个可展示的静态工具站；再执行 V0.5-V0.8 接采集任务闭环。

这样可以更快得到可看版本，也避免一开始卡在任务 API 和本地执行器上。
