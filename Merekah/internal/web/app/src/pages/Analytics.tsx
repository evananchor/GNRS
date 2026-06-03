import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useAnalytics } from '@/api/hooks'
import { Card, CardBody, CardHeader, Spinner } from '@/components/ui'
import { PlatformTile, platformMeta } from '@/components/platform'

const COLORS = ['#e5446d', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#06b6d4']

export function Analytics() {
  const analytics = useAnalytics()
  const a = analytics.data

  return (
    <>
      <div className="mb-5">
        <h2 className="text-h1 font-extrabold tracking-[-0.4px]">Analytics</h2>
        <p className="mt-0.5 text-ui text-ink-muted">Cross-platform performance at a glance.</p>
      </div>

      {analytics.isLoading && (
        <Card>
          <Spinner />
        </Card>
      )}

      {a && (
        <>
          <div className="mb-[18px] grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Metric label="Followers" value={a.followers} />
            <Metric label="Reach" value={a.reach} />
            <Metric label="Engagement" value={a.engagement} />
            <Metric label="Published posts" value={String(a.posts)} />
          </div>

          <div className="grid items-start gap-[18px] lg:grid-cols-2">
            <Card>
              <CardHeader title="Audience by platform" />
              <CardBody>
                {a.platformShare.length === 0 ? (
                  <p className="py-8 text-center text-body text-ink-dim">No data yet.</p>
                ) : (
                  <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                    <div className="size-[180px] flex-none">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={a.platformShare} dataKey="percent" nameKey="platform" innerRadius={48} outerRadius={80} paddingAngle={2}>
                            {a.platformShare.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => `${value as number}%`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-2">
                      {a.platformShare.map((s, i) => (
                        <div key={s.platform} className="flex items-center gap-2.5">
                          <span className="size-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          <PlatformTile platform={s.platform} size={20} />
                          <span className="text-body font-medium">{platformMeta(s.platform).label}</span>
                          <span className="ml-auto text-body font-bold tabular-nums">{s.percent}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Top posts" />
              <CardBody className="py-2">
                {a.topPosts.length === 0 ? (
                  <p className="py-8 text-center text-body text-ink-dim">No published posts yet.</p>
                ) : (
                  a.topPosts.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 border-b border-dashed border-line py-2.5 last:border-0">
                      <PlatformTile platform={p.platform} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-body font-semibold">{p.caption}</div>
                        <div className="text-meta text-ink-dim">{p.client}</div>
                      </div>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-[17px]">
      <div className="text-display font-extrabold tracking-[-0.6px]">{value}</div>
      <div className="text-body font-medium text-ink-muted">{label}</div>
    </Card>
  )
}
