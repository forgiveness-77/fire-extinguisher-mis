import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { getReportSummary, getExtinguisherReport, getExpiredReport } from '../api';
import { PageSpinner } from '../components/Spinner';

const COLORS = ['#DC143C', '#f43f5e', '#fda4af', '#fecdd3'];

function StatCard({ label, value, sub, color = 'crimson' }) {
  const ring = color === 'crimson' ? 'border-crimson-200 bg-crimson-50'
    : color === 'green' ? 'border-green-200 bg-green-50'
    : color === 'amber' ? 'border-amber-200 bg-amber-50'
    : 'border-blue-200 bg-blue-50';
  const txt = color === 'crimson' ? 'text-crimson-700'
    : color === 'green' ? 'text-green-700'
    : color === 'amber' ? 'text-amber-700'
    : 'text-blue-700';

  return (
    <div className={`card border ${ring}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${txt}`}>{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary]   = useState(null);
  const [extReport, setExtReport] = useState(null);
  const [expired, setExpired]   = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      getReportSummary(),
      getExtinguisherReport({ period: 'monthly', limit: 100 }),
      getExpiredReport({ within: 30 }),
    ]).then(([s, e, ex]) => {
      setSummary(s.data);
      setExtReport(e.data);
      setExpired(ex.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSpinner />;

  const byType = extReport?.summary?.byType
    ? Object.entries(extReport.summary.byType).map(([name, value]) => ({ name, value }))
    : [];

  const grouped = extReport?.grouped?.slice(-8) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Live overview — {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Extinguishers" value={summary?.extinguishers?.total} sub={`${summary?.extinguishers?.active} active`} color="crimson" />
        <StatCard label="Expired"             value={summary?.extinguishers?.expired} sub="Requires attention" color="amber" />
        <StatCard label="Expiring (30 days)"  value={summary?.extinguishers?.expiringSoon} sub="Upcoming expiry" color="amber" />
        <StatCard label="Inspections"         value={summary?.inspections?.total} sub={`${summary?.inspections?.scheduled} scheduled`} color="blue" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Completed Inspections" value={summary?.inspections?.completed} color="green" />
        <StatCard label="Maintenance Logs"      value={summary?.maintenance?.total} color="blue" />
        <StatCard label="Total Users"           value={summary?.users?.total} color="crimson" />
        <StatCard label="Cancelled Inspections" value={summary?.inspections?.cancelled} color="amber" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly trend */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-800 text-sm">Extinguisher Registrations</h3>
              <p className="text-xs text-gray-400">Monthly trend</p>
            </div>
            <Link to="/reports" className="text-xs text-crimson-700 hover:underline font-medium">View reports</Link>
          </div>
          {grouped.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={grouped} barSize={28}>
                <XAxis dataKey="period" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #fecdd3', fontSize: 12 }}
                  cursor={{ fill: '#fff1f2' }}
                />
                <Bar dataKey="count" fill="#DC143C" radius={[4, 4, 0, 0]} name="Registered" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data yet</div>
          )}
        </div>

        {/* By type pie */}
        <div className="card">
          <div className="mb-4">
            <h3 className="font-semibold text-gray-800 text-sm">By Type</h3>
            <p className="text-xs text-gray-400">Extinguisher distribution</p>
          </div>
          {byType.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={byType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={35}>
                  {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend iconSize={10} iconType="circle" formatter={v => <span style={{ fontSize: 11 }}>{v}</span>} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data yet</div>
          )}
        </div>
      </div>

      {/* Expired alert */}
      {expired && (expired.expired.count > 0 || expired.expiringSoon.count > 0) && (
        <div className="card border border-red-200 bg-red-50">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-red-800 text-sm">Attention Required</h4>
              <p className="text-sm text-red-700 mt-0.5">
                {expired.expired.count > 0 && <span><strong>{expired.expired.count}</strong> extinguisher(s) have expired. </span>}
                {expired.expiringSoon.count > 0 && <span><strong>{expired.expiringSoon.count}</strong> expire within 30 days.</span>}
              </p>
            </div>
            <Link to="/reports" className="btn-danger btn-sm shrink-0">View Report</Link>
          </div>
        </div>
      )}
    </div>
  );
}
