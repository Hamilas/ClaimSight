import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import Pipeline from './components/Pipeline.jsx'
import Analytics from './components/Analytics.jsx'
import Fraud from './components/Fraud.jsx'

const ICON_SETTINGS = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
  </svg>
)
const ICON_CHART = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
)
const ICON_SHIELD = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z"/>
  </svg>
)

const TABS = [
  { path: '/pipeline',  label: 'Pipeline',        icon: ICON_SETTINGS },
  { path: '/analytics', label: 'Analytics',        icon: ICON_CHART },
  { path: '/fraud',     label: 'Fraud Detection',  icon: ICON_SHIELD },
]

const styles = {
  root: {
    minHeight: '100vh',
    background: '#0a0f1a',
    color: '#f1f5f9',
    fontFamily: "'Inter', sans-serif",
    margin: 0,
    padding: 0,
  },
  topBar: {
    height: 2,
    background: '#3b82f6',
  },
  header: {
    background: 'rgba(10,15,26,0.95)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(51,65,85,0.4)',
    padding: '0 2rem',
    display: 'flex',
    alignItems: 'center',
    gap: '2rem',
    height: 64,
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    textDecoration: 'none',
  },
  logoText: {
    fontSize: '1.2rem',
    fontWeight: 700,
    color: '#f1f5f9',
    letterSpacing: '-0.02em',
  },
  logoAccent: { color: '#3b82f6' },
  badge: {
    fontSize: '0.65rem',
    background: 'rgba(59,130,246,0.2)',
    border: '1px solid rgba(59,130,246,0.4)',
    color: '#60a5fa',
    borderRadius: 4,
    padding: '2px 6px',
    fontWeight: 600,
  },
  nav: { display: 'flex', gap: '0.25rem', marginLeft: 'auto' },
  main: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '2rem 1.5rem',
  },
  links: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
  },
  extLink: {
    color: '#475569',
    textDecoration: 'none',
    fontSize: '0.8rem',
    transition: 'color 0.2s',
  },
}

const navBtnStyle = (isActive) => ({
  background: isActive ? 'rgba(59,130,246,0.15)' : 'transparent',
  border: isActive ? '1px solid rgba(59,130,246,0.4)' : '1px solid transparent',
  color: isActive ? '#60a5fa' : '#64748b',
  padding: '0.4rem 1rem',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontWeight: 500,
  transition: 'all 0.2s',
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  textDecoration: 'none',
})

export default function App() {
  return (
    <BrowserRouter>
      <div style={styles.root}>
        <div style={styles.topBar} />
        <header style={styles.header}>
          <NavLink to="/pipeline" style={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="#1e40af"/>
              <polyline
                points="3,16 7,16 9,10 12,22 14.5,14 17,18 19,12 21,16 29,16"
                stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"
              />
              <circle cx="19" cy="12" r="2.5" fill="#38bdf8"/>
            </svg>
            <span style={styles.logoText}>
              Claim<span style={styles.logoAccent}>Sight</span>
            </span>
            <span style={styles.badge}>Analytics</span>
          </NavLink>

          <nav style={styles.nav}>
            {TABS.map(t => (
              <NavLink
                key={t.path}
                to={t.path}
                style={({ isActive }) => navBtnStyle(isActive)}
              >
                <span>{t.icon}</span>
                {t.label}
              </NavLink>
            ))}
          </nav>

          <div style={styles.links}>
            <a href="http://localhost:3100" target="_blank" rel="noreferrer" style={styles.extLink}>Grafana</a>
            <a href="http://localhost:9090" target="_blank" rel="noreferrer" style={styles.extLink}>Prometheus</a>
            <a href="http://localhost:8080" target="_blank" rel="noreferrer" style={styles.extLink}>Airflow</a>
            <a href="http://localhost:8200/docs" target="_blank" rel="noreferrer" style={styles.extLink}>API Docs</a>
          </div>
        </header>

        <main style={styles.main}>
          <Routes>
            <Route path="/" element={<Navigate to="/pipeline" replace />} />
            <Route path="/pipeline"  element={<Pipeline />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/fraud"     element={<Fraud />} />
            <Route path="*"          element={<Navigate to="/pipeline" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
