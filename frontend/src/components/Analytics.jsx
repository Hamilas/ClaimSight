import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts'

const card = {
  background: 'rgba(15,23,42,0.7)',
  border: '1px solid rgba(51,65,85,0.4)',
  borderRadius: 12,
  padding: '1.25rem 1.5rem',
  marginBottom: '1.5rem',
}

const s = {
  pageTitle: { fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' },
  pageSubtitle: { color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' },
  sectionTitle: { fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' },
  empty: { color: '#475569', fontSize: '0.875rem', padding: '2rem', textAlign: 'center' },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' },
  kpi: { ...card, textAlign: 'center', marginBottom: 0 },
  kpiLabel: { fontSize: '0.7rem', color: '#64748b', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' },
  kpiVal: { fontSize: '1.6rem', fontWeight: 700, color: '#60a5fa' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' },
  th: { color: '#64748b', fontWeight: 600, textAlign: 'left', padding: '0.5rem 0', borderBottom: '1px solid rgba(51,65,85,0.4)', fontSize: '0.75rem', textTransform: 'uppercase' },
  td: { padding: '0.6rem 0', borderBottom: '1px solid rgba(51,65,85,0.2)', color: '#94a3b8' },
  tdVal: { padding: '0.6rem 0', borderBottom: '1px solid rgba(51,65,85,0.2)', color: '#f1f5f9', fontWeight: 500 },
}

const CHART_COLORS = ['#3b82f6', '#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#84cc16']

const TIP_STYLE = {
  background: 'rgba(15,23,42,0.95)',
  border: '1px solid rgba(51,65,85,0.6)',
  color: '#f1f5f9',
  borderRadius: 8,
  fontSize: '0.8rem',
}

function fmtM(n) {
  if (n == null || isNaN(n)) return '—'
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—'
  return `${(n * 100).toFixed(1)}%`
}

// Aggregate monthly-costs rows (per plan+state+month) into monthly totals
function buildMonthlySeries(rows) {
  const map = {}
  rows.forEach(r => {
    const month = (r.claim_month || '').slice(0, 7) // "YYYY-MM"
    if (!month) return
    if (!map[month]) map[month] = { month, billed: 0, paid: 0, claims: 0 }
    map[month].billed += r.total_billed_amount || 0
    map[month].paid += r.total_paid_amount || 0
    map[month].claims += r.total_claims || 0
  })
  return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).slice(0, 20)
}

// Aggregate by plan_id
function buildPlanPie(rows) {
  const map = {}
  rows.forEach(r => {
    const plan = r.plan_id || 'Unknown'
    if (!map[plan]) map[plan] = 0
    map[plan] += r.total_billed_amount || 0
  })
  return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

// Aggregate provider rows by specialty
function buildSpecialtyTable(rows) {
  const map = {}
  rows.forEach(r => {
    const spec = r.provider_specialty || 'Unknown'
    if (!map[spec]) map[spec] = { specialty: spec, providers: 0, claims: 0, paid: 0, billed: 0 }
    map[spec].providers = Math.max(map[spec].providers, r.distinct_providers || 0)
    map[spec].claims += r.total_claims || 0
    map[spec].paid += r.total_paid_amount || 0
    // derive billed: paid + patient_responsibility
    map[spec].billed += (r.total_paid_amount || 0) + (r.average_patient_responsibility || 0) * (r.total_claims || 0)
  })
  return Object.values(map)
    .map(r => ({
      ...r,
      avg_paid: r.claims > 0 ? r.paid / r.claims : 0,
      avg_billed: r.claims > 0 ? r.billed / r.claims : 0,
      approval_rate: r.billed > 0 ? r.paid / r.billed : 0,
    }))
    .sort((a, b) => b.claims - a.claims)
    .slice(0, 10)
}

export default function Analytics() {
  const [costs, setCosts] = useState([])
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cRes, pRes] = await Promise.all([
        fetch('/api/gold/monthly-costs'),
        fetch('/api/gold/providers'),
      ])
      if (cRes.ok) { const d = await cRes.json(); setCosts(d.data || []) }
      if (pRes.ok) { const d = await pRes.json(); setProviders(d.data || []) }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const monthlySeries = buildMonthlySeries(costs)
  const planPie = buildPlanPie(costs)
  const topProviders = buildSpecialtyTable(providers)

  // KPIs from raw rows
  const totalBilled = costs.reduce((a, b) => a + (b.total_billed_amount || 0), 0)
  const totalPaid = costs.reduce((a, b) => a + (b.total_paid_amount || 0), 0)
  const avgApproval = totalBilled > 0 ? totalPaid / totalBilled : 0
  const totalClaims = costs.reduce((a, b) => a + (b.total_claims || 0), 0)
  const distinctProviders = new Set(providers.map(r => r.provider_specialty)).size

  return (
    <div>
      <h1 style={s.pageTitle}>Analytics</h1>
      <p style={s.pageSubtitle}>Gold layer · monthly cost summaries + provider performance</p>

      <div style={s.kpiRow}>
        {[
          { label: 'Total Billed', val: fmtM(totalBilled) },
          { label: 'Total Paid', val: fmtM(totalPaid) },
          { label: 'Approval Rate', val: fmtPct(avgApproval) },
          { label: 'Total Claims', val: totalClaims.toLocaleString() },
          { label: 'Specialties', val: distinctProviders.toLocaleString() },
        ].map(k => (
          <div key={k.label} style={s.kpi}>
            <div style={s.kpiLabel}>{k.label}</div>
            <div style={s.kpiVal}>{k.val}</div>
          </div>
        ))}
      </div>

      {costs.length === 0
        ? <div style={{ ...card, ...s.empty }}>No gold-layer data yet. Run the pipeline first via Airflow (port 8080).</div>
        : <>
            <div style={s.grid2}>
              {/* Monthly cost trend */}
              <div style={card}>
                <div style={s.sectionTitle}>Monthly Costs, Billed vs Paid</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlySeries} margin={{ top: 4, right: 4, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.3)" />
                    <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10 }} angle={-30} textAnchor="end" />
                    <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}K`} tick={{ fill: '#64748b', fontSize: 10 }} />
                    <Tooltip contentStyle={TIP_STYLE} formatter={(v) => fmtM(v)} />
                    <Legend wrapperStyle={{ color: '#94a3b8', fontSize: '0.75rem' }} />
                    <Bar dataKey="billed" fill="#3b82f6" radius={[2, 2, 0, 0]} name="Billed" />
                    <Bar dataKey="paid" fill="#10b981" radius={[2, 2, 0, 0]} name="Paid" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Plan distribution */}
              <div style={card}>
                <div style={s.sectionTitle}>Billed Amount by Plan</div>
                {planPie.length > 0
                  ? <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={planPie}
                          cx="50%" cy="50%"
                          outerRadius={75}
                          dataKey="value"
                          label={({ name, percent }) => `${name.replace('PLAN_', '')} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                          fontSize={10}
                        >
                          {planPie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={TIP_STYLE} formatter={v => fmtM(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  : <p style={s.empty}>No plan data</p>
                }
              </div>
            </div>

            {/* Paid vs billed trend line */}
            {monthlySeries.length > 0 && (
              <div style={card}>
                <div style={s.sectionTitle}>Monthly Claims Volume</div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={monthlySeries} margin={{ top: 4, right: 16, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.3)" />
                    <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10 }} angle={-30} textAnchor="end" />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                    <Tooltip contentStyle={TIP_STYLE} />
                    <Line type="monotone" dataKey="claims" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Claims" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
      }

      {/* Provider table */}
      {topProviders.length > 0 && (
        <div style={card}>
          <div style={s.sectionTitle}>Top Specialties by Volume</div>
          <table style={s.table}>
            <thead>
              <tr>
                {['Specialty', 'Providers', 'Claims', 'Avg Billed', 'Avg Paid', 'Approval Rate'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topProviders.map((r, i) => (
                <tr key={i}>
                  <td style={s.tdVal}>{r.specialty}</td>
                  <td style={s.td}>{r.providers.toLocaleString()}</td>
                  <td style={s.td}>{r.claims.toLocaleString()}</td>
                  <td style={s.td}>{fmtM(r.avg_billed)}</td>
                  <td style={s.td}>{fmtM(r.avg_paid)}</td>
                  <td style={s.td}>{fmtPct(r.approval_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
