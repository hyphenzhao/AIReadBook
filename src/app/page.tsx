import Link from "next/link";
import { BookOpen, Brain, MessageCircle, Search, Sparkles } from "lucide-react";

const features = [
  {
    icon: BookOpen,
    title: "智能阅读",
    desc: "导入 EPUB 电子书，AI 自动解析、索引、构建知识图谱，为深度学习做好准备。",
  },
  {
    icon: MessageCircle,
    title: "四种 AI 模式",
    desc: "伴读模式解答疑问，摘要模式快速把握要点，提取模式结构化知识，教学模式引导深度思考。",
  },
  {
    icon: Brain,
    title: "知识吸收",
    desc: "AI 自动生成思维导图、知识卡片和间隔复习卡片，让知识真正内化。",
  },
  {
    icon: Search,
    title: "全书检索",
    desc: "跨章节语义搜索，AI 理解全书内容，任何问题都能找到关联的上下文。",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Hero */}
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 text-xl font-bold">
            <Sparkles className="h-6 w-6 text-[var(--primary)]" />
            <span>AIReadBook</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              登录
            </Link>
            <Link
              href="/library"
              className="bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 rounded-md px-4 py-2 text-sm font-medium"
            >
              开始阅读
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero section */}
        <section className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h1 className="text-5xl font-bold tracking-tight">
            AI 驱动的
            <span className="text-[var(--primary)]"> 深度阅读</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-[var(--muted-foreground)]">
            AI 作为你的阅读助手，可以部分或完全替代"读"的过程，
            让你聚焦于理解和吸收。上传一本书，开始全新的阅读体验。
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/library"
              className="bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 rounded-md px-6 py-3 text-base font-medium"
            >
              立即体验
            </Link>
            <Link
              href="/library/import"
              className="border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--accent)] rounded-md px-6 py-3 text-base font-medium"
            >
              导入书籍
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-8 sm:grid-cols-2">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6"
              >
                <f.icon className="mb-3 h-8 w-8 text-[var(--primary)]" />
                <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
                <p className="text-sm text-[var(--muted-foreground)]">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="mb-12 text-center text-3xl font-bold">三步开始</h2>
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              { step: "01", title: "导入书籍", desc: "上传 EPUB 电子书，AI 自动解析和索引" },
              { step: "02", title: "开始阅读", desc: "选择 AI 模式，享受智能化的阅读体验" },
              { step: "03", title: "深度吸收", desc: "通过思维导图、知识卡片和间隔复习内化知识" },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div className="mb-3 text-3xl font-bold text-[var(--primary)]">{s.step}</div>
                <h3 className="mb-2 font-semibold">{s.title}</h3>
                <p className="text-sm text-[var(--muted-foreground)]">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] py-8 text-center text-sm text-[var(--muted-foreground)]">
        AIReadBook — AI-Powered Deep Reading Assistant
      </footer>
    </div>
  );
}
