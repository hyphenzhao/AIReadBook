# AIReadBook — AI 深度阅读助手

AI 驱动的深度阅读 Web 应用。**AI 作为阅读助手，部分或完全替代"读"的过程，让你聚焦于理解和吸收。**

## 功能概览

### 📖 智能阅读
- EPUB 电子书上传、自动解析（元数据、目录、章节纯文本）
- 三栏布局阅读器：左侧导航 | 中间阅读 | 右侧 AI 面板
- 章节导航、字体/主题设置
- 移动端适配 + PWA 可安装

### 🤖 四种 AI 阅读模式

| 模式 | 功能 |
|------|------|
| **伴读** | 选中文字即可向 AI 提问，基于全书上下文回答 |
| **摘要** | AI 生成三级摘要（一句话/段落式/关键要点） |
| **提取** | AI 提取核心概念、论点、论据，生成结构化知识卡片 |
| **教学** | 苏格拉底式提问，引导用户深入理解 |

### 📝 知识管理
- **划线批注**：5 色划线 + 笔记，AI 自动分类标签
- **知识卡片**：按类型（概念/论点/论据/案例/问题）管理，支持搜索过滤
- **思维导图**：AI 生成 + D3.js 交互式可视化，支持缩放拖拽
- **间隔复习**：SM-2 算法（Anki 同款），翻转卡片动画

### 🔍 发现书籍
- OpenLibrary + Google Books 双源搜索
- AI 基于阅读内容推荐相关书籍

### ⚙️ 设置页面
- AI 配置：API Key、Base URL、模型选择（支持 DeepSeek V4 Flash/Pro）
- 个人资料管理
- 阅读偏好（字体、主题）
- 账号安全

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 15 + React 19 + TypeScript |
| 样式 | Tailwind CSS v4 |
| 状态管理 | Zustand (7 stores, localStorage 持久化) |
| AI | DeepSeek API + Vercel AI SDK |
| 支持模型 | deepseek-v4-flash / deepseek-v4-pro |
| EPUB 解析 | JSZip |
| 可视化 | D3.js (思维导图) |
| 数据库 | Prisma + PostgreSQL (可选) |
| 认证 | Supabase Auth (可选) |
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

# 配置环境变量
cp .env.local.example .env.local
# 编辑 .env.local 填入 DEEPSEEK_API_KEY

npm run dev
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

# 可选（Auth）
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# 可选（DB）
DATABASE_URL=postgresql://...
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
