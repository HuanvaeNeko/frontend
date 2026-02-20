import { Bot, Shield, Users, Video } from 'lucide-react'
import DownloadCenter from '@/components/landing/DownloadCenter'
import HeroActions from '@/components/landing/HeroActions'

const inspirations = [
  {
    name: 'QQ',
    focus: '熟人关系与文件协同',
    description: '稳定联系人体系 + 多端同步，适配高频工作与日常沟通。',
  },
  {
    name: 'Discord',
    focus: '频道化社区与语音共创',
    description: '频道结构清晰，沉淀话题知识，适合团队长期协作。',
  },
  {
    name: '微信',
    focus: '轻量交互与触达效率',
    description: '简洁交互与高可达消息流，优先保障消息触达。',
  },
  {
    name: 'Telegram',
    focus: '开放生态与自动化扩展',
    description: '云端同步能力强，便于集成机器人和自动化工作流。',
  },
]

const features = [
  {
    icon: Users,
    title: '频道与群聊',
    description: '将组织沟通从单聊扩展到可管理的频道与群组结构。',
  },
  {
    icon: Bot,
    title: 'AI 助手协作',
    description: '在聊天上下文中直接调用 AI，减少跨工具切换。',
  },
  {
    icon: Video,
    title: '实时音视频',
    description: '会议与沟通一体化，文本、语音、视频可无缝切换。',
  },
  {
    icon: Shield,
    title: '多端与安全',
    description: '支持 Web/PWA/桌面端，结合权限与设备管理能力。',
  },
]

export default function LandingPage() {
  return (
    <main id="top" className="app-page-scroll app-screen relative overflow-x-hidden bg-slate-50 text-slate-900">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_8%_0%,rgba(56,189,248,0.22),transparent_35%),radial-gradient(circle_at_92%_6%,rgba(34,197,94,0.2),transparent_32%),radial-gradient(circle_at_50%_100%,rgba(59,130,246,0.16),transparent_42%)]" />

      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-16 sm:px-10">
        <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs tracking-[0.18em] text-slate-600 backdrop-blur">
          HUANVAE COMMUNICATION SUITE
        </div>

        <h1 className="mt-6 max-w-5xl text-4xl font-bold leading-tight sm:text-6xl">
          面向团队与社区的统一通信平台
          <span className="block bg-gradient-to-r from-sky-600 via-cyan-600 to-emerald-600 bg-clip-text text-transparent">
            聊天、AI、会议、下载一次到位
          </span>
        </h1>

        <p className="mt-6 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">
          吸收 QQ、Discord、微信、Telegram 的核心体验，把消息、协作和实时会议收敛到同一个工作入口。
          官网在 <code>/</code>，Web App 在 <code>/app</code>。
        </p>

        <HeroActions />
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-14 sm:px-10">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="text-3xl font-semibold sm:text-4xl">设计参考</h2>
          <span className="text-xs tracking-[0.14em] text-slate-500">INSPIRATION SYSTEM</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {inspirations.map((item) => (
            <article key={item.name} className="rounded-3xl border border-white/80 bg-white/70 p-6 backdrop-blur-sm">
              <p className="text-xs tracking-[0.18em] text-slate-500">{item.name}</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">{item.focus}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-14 sm:px-10">
        <div className="mb-8">
          <h2 className="text-3xl font-semibold sm:text-4xl">核心能力</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {features.map(({ icon: Icon, title, description }) => (
            <article key={title} className="rounded-3xl border border-slate-200 bg-white/80 p-6 backdrop-blur-sm">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                <Icon size={18} />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <DownloadCenter />
    </main>
  )
}
