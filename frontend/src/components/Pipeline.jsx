import { useState, useEffect, useCallback } from 'react'

const card = {
  background: 'rgba(15,23,42,0.7)',
  border: '1px solid rgba(51,65,85,0.4)',
  borderRadius: 12,
  padding: '1.25rem 1.5rem',
}

const s = {
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' },
  kpiCard: { ...card, textAlign: 'center' },
  kpiLabel: { fontSize: '0.75rem', color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' },
  kpiValue: { fontSize: '2rem', fontWeight: 700, lineHeight: 1 },
  section: { ...card, marginBottom: '1.5rem' },
  sectionTitle: { fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid rgba(51,65,85,0.3)' },
  rowLast: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0' },
  label: { color: '#94a3b8', fontSize: '0.875rem' },
  value: { fontWeight: 600, fontSize: '0.9rem' },
  badge: (color) => ({
    padding: '0.2rem 0.6rem', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600,
    background: color === 'green' ? 'rgba(16,185,129,0.15)' : color === 'yellow' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
    color: color === 'green' ? '#34d399' : color === 'yellow' ? '#fbbf24' : '#f87171',
    border: `1px solid ${color === 'green' ? 'rgba(16,185,129,0.3)' : color === 'yellow' ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
  }),
  layerBar: { display: 'flex', gap: '0.75rem', marginTop: '0.5rem' },
  layer: (pct) => ({
    flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem',
  }),
  barTrack: { height: 6, background: 'rgba(51,65,85,0.5)', borderRadius: 3, overflow: 'hidden' },
  barFill: (pct, color) => ({
    height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 3,
    transition: 'width 0.8s ease',
  }),
  historyRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 80px', gap: '0.5rem', padding: '0.6rem 0', borderBottom: '1px solid rgba(51,65,85,0.2)', fontSize: '0.8rem', alignItems: 'center' },
  header: { color: '#64748b', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' },
  refreshBtn: {
    background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)',
    color: '#60a5fa', borderRadius: 8, padding: '0.4rem 1rem', cursor: 'pointer',
    fontSize: '0.8rem', fontWeight: 500,
  },
  topRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' },
  pageTitle: { fontSize: '1.5rem', fontWeight: 700 },
  pageSubtitle: { color: '#64748b', fontSize: '0.875rem', marginTop: '0.25rem' },
  qBar: { height: 8, background: 'rgba(51,65,85,0.5)', borderRadius: 4, overflow: 'hidden', marginTop: '0.5rem' },
}

const LAYER_COLORS = { bronze: '#b45309', silver: '#64748b', gold: '#ca8a04' }

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function fmtDur(s) {
  if (s == null) return '—'
  if (s < 60) return `${s.toFixed(1)}s`
  return `${(s / 60).toFixed(1)}m`
}

function fmtDate(dt) {
  if (!dt) return '—'
  try {
    return new Date(dt).toLocaleString()
  } catch {
    return dt
  }
}

function statusColor(status) {
  if (!status || status === 'not_run') return 'yellow'
  if (status === 'success' || status === 'completed') return 'green'
  if (status === 'running') return 'yellow'
  return 'red'
}

export default function Pipeline() {
  const [data, setData] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pRes, sRes] = await Promise.all([
        fetch('/api/pipeline/latest'),
        fetch('/api/stats'),
      ])
      if (pRes.ok) setData(await pRes.json())
      if (sRes.ok) setStats(await sRes.json())
      setLastRefresh(new Date().toLocaleTimeString())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [load])

  const run = data?.latest_run || {}
  const stages = run?.stages || {}
  const totalRecords = Object.values(stages).reduce((a, b) => a + (b?.records_out || 0), 0)

  return (
    <div>
      <div style={s.topRow}>
        <div>
          <h1 style={s.pageTitle}>Pipeline Status</h1>
          <p style={s.pageSubtitle}>Bronze → Silver → Gold · Spark + Delta Lake</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {lastRefresh && <span style={{ color: '#475569', fontSize: '0.75rem' }}>Updated {lastRefresh}</span>}
          <button style={s.refreshBtn} onClick={load} disabled={loading}>
            {loading ? '⟳ Loading…' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={s.grid4}>
        {[
          { label: 'Pipeline Status', value: stats?.pipeline_status || '—', type: 'badge' },
          { label: 'Claims Processed', value: fmt(stats?.total_claims_processed) },
          { label: 'Total Paid', value: stats?.total_paid_amount ? `$${(stats.total_paid_amount / 1e6).toFixed(1)}M` : '—' },
          { label: 'Quality Score', value: stats?.quality_score || `${data?.quality_passed || 0}/${data?.quality_total || 48}` },
        ].map(k => (
          <div key={k.label} style={s.kpiCard}>
            <div style={s.kpiLabel}>{k.label}</div>
            {k.type === 'badge'
              ? <span style={{ ...s.badge(statusColor(k.value)), fontSize: '0.9rem', display: 'inline-block' }}>{k.value}</span>
              : <div style={{ ...s.kpiValue, color: '#60a5fa' }}>{k.value}</div>
            }
          </div>
        ))}
      </div>

      {/* Layer metrics */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Layer Throughput</div>
        <div style={s.layerBar}>
          {['bronze', 'silver', 'gold'].map(layer => {
            const st = Object.values(stages).find(s => s?.stage === layer) || {}
            const maxRec = Math.max(...Object.values(stages).map(s => s?.records_out || 0), 1)
            return (
              <div key={layer} style={s.layer()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ fontWeight: 600, color: LAYER_COLORS[layer], textTransform: 'capitalize' }}>{layer}</span>
                  <span style={{ color: '#94a3b8' }}>{fmt(st.records_out)} records · {fmtDur(st.duration_seconds)}</span>
                </div>
                <div style={s.barTrack}>
                  <div style={s.barFill((st.records_out || 0) / maxRec * 100, LAYER_COLORS[layer])} />
                </div>
                {st.records_in != null && (
                  <span style={{ fontSize: '0.7rem', color: '#475569' }}>In: {fmt(st.records_in)} · Out: {fmt(st.records_out)}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Quality checks */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Data Quality</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.4rem' }}>
              <span style={{ color: '#94a3b8' }}>Great Expectations checks</span>
              <span style={{ fontWeight: 600, color: '#34d399' }}>{data?.quality_passed || 0} / {data?.quality_total || 48} passed</span>
            </div>
            <div style={s.qBar}>
              <div style={{
                height: '100%',
                width: `${((data?.quality_passed || 0) / (data?.quality_total || 48)) * 100}%`,
                background: '#3b82f6',
                borderRadius: 4,
                transition: 'width 0.8s ease',
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* Latest run details */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Latest Run</div>
        {Object.keys(run).length === 0
          ? <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No runs recorded yet. Trigger the pipeline via Airflow.</p>
          : <>
              <div style={s.row}><span style={s.label}>Started</span><span style={s.value}>{fmtDate(run.started_at)}</span></div>
              <div style={s.row}><span style={s.label}>Finished</span><span style={s.value}>{fmtDate(run.finished_at)}</span></div>
              <div style={s.row}><span style={s.label}>Status</span><span style={s.badge(statusColor(run.status))}>{run.status}</span></div>
              <div style={s.rowLast}><span style={s.label}>Total Duration</span>
                <span style={s.value}>{fmtDur(Object.values(stages).reduce((a, b) => a + (b?.duration_seconds || 0), 0))}</span>
              </div>
            </>
        }
      </div>

      {/* Run history */}
      {data?.history?.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Run History</div>
          <div style={{ ...s.historyRow, ...s.header }}>
            <span>Started</span><span>Status</span><span>Records</span><span>Duration</span>
          </div>
          {data.history.slice(-10).reverse().map((h, i) => (
            <div key={i} style={s.historyRow}>
              <span style={{ color: '#94a3b8' }}>{fmtDate(h.started_at)}</span>
              <span style={s.badge(statusColor(h.status))}>{h.status || '—'}</span>
              <span>{fmt(h.records_processed)}</span>
              <span style={{ color: '#64748b' }}>{fmtDur(h.duration_seconds)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
