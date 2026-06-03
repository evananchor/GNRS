import type { LucideIcon } from 'lucide-react'
import { CalendarClock, CheckCircle2, FolderKanban, Hourglass, TrendingDown, TrendingUp } from 'lucide-react'
import { useActivity, usePosts, useProjects, useStats } from '@/api/hooks'
import { Badge, Card, CardBody, CardHeader, ProgressBar, Spinner, statusTone } from '@/components/ui'
import { PlatformTile } from '@/components/platform'
import { fmtDateTime } from '@/lib/format'
import type { Stat } from '@/api/types'

const STAT_META: Record<string, { Icon: LucideIcon; bg: string }> = {
  projects: { Icon: FolderKanban, bg: '#e5446d' },
  scheduled: { Icon: CalendarClock, bg: '#8b5cf6' },
  published: { Icon: CheckCircle2, bg: '#10b981' },
  pending: { Icon: Hourglass, bg: '#f59e0b' },
}

function StatCard({ stat }: { stat: Stat }) {
  const meta = STAT_META[stat.key] ?? { Icon: TrendingUp, bg: '#8b8794' }
  const Trend = stat.trend === 'down' ? TrendingDown : TrendingUp
  return (
    <Card className="p-[17px]">
      <div className="flex items-start justify-between">
        <span className="grid size-[38px] place-items-center rounded-[11px] text-white" style={{ background: meta.bg }}>
          <meta.Icon className="size-[18px]" />
        </span>
        {stat.delta && (
          <span className={stat.trend === 'down' ? 'flex items-center gap-1 text-label font-bold text-danger' : 'flex items-center gap-1 text-label font-bold text-ok'}>
            <Trend className="size-3.5" />
            {stat.delta}
          </span>
        )}
      </div>
      <div className="mt-[11px] text-display font-extrabold tracking-[-0.6px]">{stat.value}</div>
      <div className="text-body font-medium text-ink-muted">{stat.label}</div>
    </Card>
  )
}

export function Dashboard() {
  const stats = useStats()
  const posts = usePosts()
  const activity = useActivity()
  const projects = useProjects()

  const queue = (posts.data ?? []).filter((p) => p.status !== 'published').slice(0, 7)

  return (
    <>
      <h2 className="text-h1 font-extrabold tracking-[-0.4px]">Selamat datang kembali 🌸</h2>
      <p className="mt-1 text-ui text-ink-muted">Here's what's happening across your clients today.</p>

      <div className="my-[22px] grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.isLoading && <Card className="col-span-full"><Spinner /></Card>}
        {stats.data?.map((s) => <StatCard key={s.key} stat={s} />)}
      </div>

      <div className="grid items-start gap-[18px] lg:grid-cols-[1.55fr_1fr]">
        <Card>
          <CardHeader title="Post queue" sub="Scheduled & awaiting publish" />
          <CardBody className="py-2">
            {posts.isLoading && <Spinner />}
            {posts.data && queue.length === 0 && <p className="py-6 text-center text-body text-ink-dim">Nothing in the queue.</p>}
            {queue.map((p) => (
              <div key={p.id} className="flex items-center gap-3 border-b border-dashed border-line py-3 last:border-0">
                <PlatformTile platform={p.platform} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-ui font-semibold">{p.caption || '—'}</div>
                  <div className="mt-0.5 text-meta text-ink-dim">
                    {p.client} · {fmtDateTime(p.scheduledAt)}
                  </div>
                </div>
                <Badge tone={statusTone(p.status)}>{p.status}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Team activity" />
          <CardBody className="py-2">
            {activity.isLoading && <Spinner />}
            {activity.data?.map((a, i) => (
              <div key={i} className="flex gap-3 border-b border-dashed border-line py-[11px] last:border-0">
                <span className="bg-bloom mt-1.5 size-2 flex-none rounded-full" />
                <div>
                  <div className="text-body leading-relaxed">
                    <b className="font-semibold">{a.actor}</b> {a.text}
                  </div>
                  <time className="text-meta text-ink-dim">{a.when}</time>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-[18px]">
        <CardHeader title="Project progress" />
        <CardBody className="py-2">
          {projects.isLoading && <Spinner />}
          {projects.data?.map((proj) => (
            <div key={proj.id} className="flex items-center gap-3.5 border-b border-dashed border-line py-3 last:border-0">
              <span className="bg-bloom grid size-9 flex-none place-items-center rounded-sm text-body font-bold text-white">
                {proj.name.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-ui font-semibold">{proj.name}</div>
                <div className="text-meta text-ink-dim">{proj.client}</div>
              </div>
              <div className="w-20 sm:w-[160px]">
                <ProgressBar value={proj.progress} />
              </div>
              <div className="w-9 text-right text-label font-bold tabular-nums">{proj.progress}%</div>
            </div>
          ))}
        </CardBody>
      </Card>
    </>
  )
}
