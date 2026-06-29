import { useState, useEffect, useCallback } from 'react'

const card = {
  background: 'rgba(15,23,42,0.7)',
  border: '1px solid rgba(51,65,85,0.4)',
  borderRadius: 12,
  padding: '1.25rem 1.5rem',
  marginBottom: '1.5rem',
}

const SEVERITY_COLORS = {
  CRITICAL: { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', text: '#f87171' },
  HIGH: { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', text: '#fbbf24' },
  MEDIUM: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.4)', text: '#60a5fa' },
}

const FRAUD_COLORS = {
  DUPLICATE_CLAIM: '#ef4444',
  HIGH_VOLUME_PROVIDER: '#f59e0b',
  AMOUNT_ANOMALY: '#8b5cf6',
}

const s = {
  pageTitle: { fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' },
  pageSubtitle: { color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' },
  kpi: { ...card, textAlign: 'center', marginBottom: 0 },
  kpiLabel: { fontSize: '0.7rem', color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' },
  kpiVal: (color) => ({ fontSize: '1.8rem', fontWeight: 700, color: color || '#60a5fa' }),
  sectionTitle: { fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' },
  filterRow: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' },
  filterBtn: (active) => ({
    background: active ? 'rgba(59,130,246,0.2)' : 'transparent',
    border: active ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(51,65,85,0.5)',
    color: active ? '#60a5fa' : '#64748b',
    borderRadius: 6, padding: '0.3rem 0.75rem',
    cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
  }),
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' },
  th: { color: '#64748b', fontWeight: 600, textAlign: 'left', padding: '0.5rem 0.5rem 0.5rem 0', borderBottom: '1px solid rgba(51,65,85,0.4)', fontSize: '0.72rem', textTransform: 'uppercase' },
  td: { padding: '0.6rem 0.5rem 0.6rem 0', borderBottom: '1px solid rgba(51,65,85,0.15)', color: '#94a3b8', verticalAlign: 'middle' },
  tdVal: { padding: '0.6rem 0.5rem 0.6rem 0', borderBottom: '1px solid rgba(51,65,85,0.15)', color: '#f1f5f9', fontWeight: 500, verticalAlign: 'middle' },
  empty: { color: '#475569', fontSize: '0.875rem', padding: '2rem', textAlign: 'center' },
  badge: (type) => {
    const c = SEVERITY_COLORS[type] || SEVERITY_COLORS.MEDIUM
    return { padding: '0.2rem 0.5rem', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600, background: c.bg, border: `1px solid ${c.border}`, color: c.text }
  },
  typeDot: (type) => ({
    display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
    background: FRAUD_COLORS[type] || '#64748b',
    marginRight: '0.4rem',
  }),
  summaryCard: { display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' },
  summaryItem: (type) => ({
    flex: 1, minWidth: 140, ...card, marginBottom: 0,
    borderLeft: `3px solid ${FRAUD_COLORS[type] || '#64748b'}`,
  }),
  summaryLabel: { fontSize: '0.72rem', color: '#64748b', fontWeight: 500, textTransform: 'uppercase', marginBottom: '0.3rem' },
  summaryVal: (type) => ({ fontSize: '1.4rem', fontWeight: 700, color: FRAUD_COLORS[type] || '#64748b' }),
}

function fmtAmount(n) {
  if (n == null) return '—'
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function truncate(str, n = 12) {
  if (!str) return '—'
  return String(str).length > n ? String(str).slice(0, n) + '…' : str
}

export default function Fraud() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 25

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/fraud')
      if (r.ok) setData(await r.json())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const summary = data?.summary || {}
  const total = data?.total || 0
  const allFlags = data?.flags || []
  const filtered = filter === 'ALL' ? allFlags : allFlags.filter(f => f.fraud_type === filter)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const pages = Math.ceil(filtered.length / PAGE_SIZE)

  const fraudTypes = ['DUPLICATE_CLAIM', 'HIGH_VOLUME_PROVIDER', 'AMOUNT_ANOMALY']

  return (
    <div>
      <h1 style={s.pageTitle}>Fraud Detection</h1>
      <p style={s.pageSubtitle}>DuckDB statistical anomaly detection · silver layer analysis</p>

      <div style={s.kpiRow}>
        <div style={s.kpi}>
          <div style={s.kpiLabel}>Total Flags</div>
          <div style={s.kpiVal(total > 0 ? '#f87171' : '#34d399')}>{total.toLocaleString()}</div>
        </div>
        {fraudTypes.map(t => (
          <div key={t} style={s.kpi}>
            <div style={s.kpiLabel}>{t.replace(/_/g, ' ')}</div>
            <div style={s.kpiVal(FRAUD_COLORS[t])}>{(summary[t] || 0).toLocaleString()}</div>
          </div>
        ))}
      </div>

      {allFlags.length === 0 && !loading
        ? <div style={{ ...card, ...s.empty }}>
            {data?.message || 'No fraud flags yet. Run the pipeline first via Airflow (port 8080).'}
          </div>
        : <>
            <div style={card}>
              <div style={s.sectionTitle}>Flag Distribution</div>
              <div style={s.summaryCard}>
                {fraudTypes.map(type => (
                  <div key={type} style={s.summaryItem(type)}>
                    <div style={s.summaryLabel}>{type.replace(/_/g, ' ')}</div>
                    <div style={s.summaryVal(type)}>{(summary[type] || 0).toLocaleString()}</div>
                    <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '0.2rem' }}>
                      {total > 0 ? `${((summary[type] || 0) / total * 100).toFixed(1)}% of total` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={s.sectionTitle}>Flag Details</div>
                <span style={{ fontSize: '0.75rem', color: '#475569' }}>{filtered.length} flags</span>
              </div>

              <div style={s.filterRow}>
                {['ALL', ...fraudTypes].map(f => (
                  <button key={f} style={s.filterBtn(filter === f)} onClick={() => { setFilter(f); setPage(0) }}>
                    {f === 'ALL' ? 'All Types' : f.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>

              {paged.length === 0
                ? <p style={s.empty}>No flags match filter.</p>
                : <>
                    <table style={s.table}>
                      <thead>
                        <tr>
                          {['Type', 'Severity', 'Claim ID', 'Member', 'Provider', 'Date', 'Billed'].map(h => (
                            <th key={h} style={s.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {paged.map((f, i) => (
                          <tr key={i}>
                            <td style={s.tdVal}>
                              <span style={s.typeDot(f.fraud_type)} />
                              {f.fraud_type?.replace(/_/g, ' ')}
                            </td>
                            <td style={s.td}><span style={s.badge(f.severity)}>{f.severity}</span></td>
                            <td style={s.td}><code style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{truncate(f.claim_id, 14)}</code></td>
                            <td style={s.td}>{truncate(f.member_id, 10)}</td>
                            <td style={s.td}>{truncate(f.provider_id, 10)}</td>
                            <td style={s.td}>{f.service_date ? String(f.service_date).slice(0, 10) : '—'}</td>
                            <td style={s.tdVal}>{fmtAmount(f.billed_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {pages > 1 && (
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1rem' }}>
                        <button style={s.filterBtn(false)} disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
                        <span style={{ color: '#64748b', fontSize: '0.8rem', alignSelf: 'center' }}>{page + 1} / {pages}</span>
                        <button style={s.filterBtn(false)} disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Next →</button>
                      </div>
                    )}
                  </>
              }
            </div>
          </>
      }
    </div>
  )
}
