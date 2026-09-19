# AIReadBook — AI 深度阅读助手

AI 驱动的深度阅读 Web 应用。**AI 作为阅读助手，部分或完全替代"读"的过程，让你聚焦于理解和吸收。**

## 功能概览

系统分两个独立的库：**读书**（一本一本读，兴趣驱动）和 **文献**（多篇文献之间建立联系，科研驱动）。两者共用同一套 AI 底座（分块、向量、知识图谱、后台任务），但各有自己的知识库和图谱。

### 📖 读书
- EPUB 上传、解析并持久化到 MySQL；导入后在后台自动分块并建立语义索引
- 阅读器：桌面为三栏，手机上 AI 面板是可拖拽的底部抽屉（半屏时正文仍可阅读），支持触屏选词、左右滑动翻章
- 自动记住阅读位置（章节 + 滚动位置，跨设备同步）；阅读页内直接调整字号、行距、字体、主题
- 每章末尾在正文里给出「看摘要 / 生成知识卡片 / 加入知识图谱」

### 🤖 AI 阅读

| 模式 | 功能 |
|------|------|
| **伴读** | 对话式提问。服务端按 **选中的句子 → 本章 → 全书 → 联网** 逐层检索，证据不足才扩大范围；需要背景或评价时联网搜索书评与背景知识 |
| **摘要** | 先生成本章摘要（只生成一次，之后秒开），再就本章内容针对性追问；要点可一键追问 |

- 检索是「ngram 全文索引 + bge-m3 语义向量」的混合检索，在调用模型之前由服务端确定性地完成，不依赖模型的工具调用能力
- 交给模型的每段原文都带标记，回答里的 `[c481]` 会渲染成可点击的出处，点击跳回原文并高亮该段；联网资料单独标为「补充背景」
- **生成知识卡片**：AI 从本章提炼若干知识条目，每张卡片带一句原文，只有在正文中真的找到这句话才会得到「回到原文」的链接
- **加入知识图谱**：抽取本章的人物、概念、事件及其关系，自动并入你的全局知识图谱（同名、别名或语义高度相近的节点自动合并，可手动合并/删除）

### 📄 文献
- 上传 PDF 后**立即可读**：浏览器渲染的是原版 PDF（pdf.js，按需分段加载，支持查找、缩放、双指捏合）；页码、缩放、位置自动记住
- 文字提取只在上传时做**一次**（poppler，扫描件自动走 OCR），连同每一行的页面坐标一起存库；此后搜索、AI 问答、引用高亮都读库，不再解析 PDF
- 自动识别标题、作者、期刊、年份、DOI（Crossref / arXiv），识别章节结构，跳过参考文献
- **AI 精读**：研究问题、方法、数据、主要发现、局限、关键词，每条都能点回所在页
- **文献间关联**：相同的方法 / 数据 / 关键词、结论一致或相左（AI 比对双方结论并给出原句）、谁引用了谁、内容相近；可手动添加或否决
- **文献图谱**：「文献关系」视图（文献为节点，一致为绿、相左为红色虚线，点连线看证据）与「知识网络」视图（文献、关键词、方法、数据、结论）
- 问 AI 时的检索阶梯：**选中的句子 → 当前页附近 → 全文 → 整个文献库 → 联网**；引用直接跳到对应页并画出高亮
- 管理：集合、标签、阅读状态、评分、笔记、搜索与筛选；通过 DOI / arXiv 编号添加，BibTeX 导入导出；先导入条目、后补 PDF 会自动挂接

### 📝 知识管理
- **划线批注**：书和 PDF 都支持 5 色划线 + 笔记
- **知识卡片**：保存在服务器，按类型（概念/论点/论据/案例/问题）管理，可加入间隔复习
- **知识图谱**：Cytoscape 交互式可视化，按书 / 类型筛选，点节点看所有出处并跳回原文
- **间隔复习**：SM-2 算法（Anki 同款），翻转卡片动画

### 🔍 发现书籍
- OpenLibrary + Google Books 双源搜索
- AI 基于阅读内容推荐相关书籍

### ⚙️ 设置与管理
- AI 配置：任意 OpenAI 兼容接口；模型列表从服务商实时获取；API Key 加密存储在服务器，不回传浏览器
- 管理员：用户的新建 / 编辑 / 停用 / 删除 / 重置密码，注册开关（默认关闭），联网搜索服务（博查 / Tavily）配置
- 个人资料、阅读偏好、账号安全

### 🛠 运维
- `deploy/deploy.sh`：备份数据库 → 安装依赖 → 同步表结构 → 类型检查与单测 → 旁路构建 → 冒烟测试 → 切换 → 健康检查，失败自动回滚
- systemd 服务 `aireadbook`（崩溃与开机自动拉起），健康检查 `/api/health`
- 后台任务（建索引、图谱抽取、PDF 处理、AI 精读）由进程内 worker 执行，任务表持久化，重启后自动续跑

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 15 + React 19 + TypeScript |
| 样式 | Tailwind CSS v4 |
| 状态管理 | Zustand |
| AI | Vercel AI SDK + 任意 OpenAI 兼容接口（默认 DeepSeek） |
| 语义向量 | Ollama `bge-m3`（本机，备用主机可选；不可用时退化为关键词检索） |
| EPUB / PDF | JSZip；poppler (`pdftotext -bbox-layout`) + tesseract OCR；pdf.js 阅读器 |
| 可视化 | Cytoscape.js + fcose（知识图谱、文献图谱） |
| 数据库 | Prisma + MySQL 8（ngram 全文索引） |
| 测试 | Vitest（104 个单测）+ `scripts/e2e-*.sh` 端到端脚本 |
| 认证 | bcrypt + 签名的 HTTP-only 会话 Cookie |
| PWA | Web App Manifest + 独立窗口模式 |

## 快速开始

### 前置条件

- Node.js 22+
- DeepSeek API Key（[获取](https://platform.deepseek.com/api_keys)）

### 安装

```bash
git clone git@github.com:hyphenzhao/AIReadBook.git
cd AIReadBook

npm install

# 配置 MySQL、会话密钥和可选的服务器 AI Key
cp .env.local.example .env.local
# 编辑 .env.local

npx prisma generate
npx prisma db push

npm run build
npm start
```

打开 http://localhost:3000

### 使用流程

1. **配置 AI**：`/settings` → AI 设置，填入 API Key 和选择模型
2. **导入书籍**：`/library/import`，拖拽或选择 EPUB 文件
3. **开始阅读**：自动跳转阅读页，左侧目录选择章节
4. **AI 互动**：选中文字点击"问 AI"，或右侧面板切换模式提问
5. **知识管理**：划线做笔记 → `/read/[id]/knowledge` 查看知识卡片
6. **间隔复习**：`/review` 翻转卡片自测

## 项目结构

```
src/
├── app/                           # Next.js App Router
│   ├── api/chat/                  # AI 流式聊天（支持自定义 API Key）
│   ├── api/books/                 # EPUB 上传解析
│   ├── api/search/external/       # 外部书源搜索
│   ├── api/recommendations/       # AI 书籍推荐
│   ├── library/                   # 书库 + 导入
│   ├── read/[bookId]/             # 三栏阅读器 + 知识面板
│   ├── search/                    # 书籍发现
│   ├── review/                    # 间隔复习
│   ├── mind-maps/                 # 思维导图
│   ├── settings/                  # 设置页（AI/个人/偏好/安全）
│   └── login/ + register/         # 认证
├── components/
│   ├── reader/                    # 阅读器（三栏布局 + 选中工具栏）
│   ├── reader/ai/                 # AI 面板 + 4 模式切换
│   ├── reader/panels/             # 左侧面板（目录/批注/知识）
│   ├── mind-map/                  # D3.js 思维导图
│   └── shared/                    # Toast, ErrorBoundary, UserMenu
├── lib/
│   ├── ai/                        # DeepSeek 客户端 + 4 套 Prompts
│   ├── epub/                      # EPUB 解析器
│   ├── search/                    # 外部搜索 API
│   └── spaced-repetition/         # SM-2 算法
├── stores/                        # Zustand 状态管理
│   ├── user-store.ts              # 用户 + AI 设置 + 偏好
│   ├── library-store.ts           # 书库
│   ├── reading-store.ts           # 阅读状态
│   ├── annotation-store.ts        # 划线批注
│   ├── knowledge-store.ts         # 知识卡片 + 思维导图
│   ├── review-store.ts            # 复习卡片 + SM-2
│   └── ui-store.ts                # UI 布局偏好
└── types/index.ts                 # TypeScript 类型定义
```

## 环境变量

```bash
# 必需
DEEPSEEK_API_KEY=sk-xxx            # DeepSeek API Key
DEEPSEEK_BASE_URL=https://api.deepseek.com

DATABASE_URL=mysql://user:password@localhost:3306/aireadbook
AUTH_SECRET=use-a-long-random-value
AUTH_COOKIE_SECURE=false       # HTTPS 部署时设为 true
```

## 路线图

- [x] EPUB 导入/解析/阅读
- [x] 三栏布局阅读器
- [x] 4 种 AI 阅读模式 + DeepSeek 流式对话
- [x] 划线批注 + 知识卡片管理
- [x] D3.js 思维导图
- [x] SM-2 间隔复习
- [x] 外部书源搜索（OpenLibrary + Google Books）
- [x] AI 书籍推荐
- [x] PWA 支持 + 移动端适配
- [x] 设置页面（AI/个人/偏好/安全）
- [ ] LightRAG 知识图谱检索
- [ ] 多书跨库搜索
- [ ] 协作阅读

## License

MIT
