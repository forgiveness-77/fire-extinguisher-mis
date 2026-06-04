import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { getReportSummary, getExpiredReport, getMaintenanceHistory, getInspectionReport, exportPDF, exportCSV } from '../api';
import { useAuth } from '../context/AuthContext';

const COLORS = ['#DC143C', '#f43f5e', '#fda4af', '#fecdd3'];

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const EXPORT_TYPES = [
  { key: 'extinguishers', label: 'Extinguisher Inventory',    desc: 'Full inventory with computed status',     hasPdf: true },
  { key: 'inspections',   label: 'Inspection Records',         desc: 'All inspection schedules and statuses',   hasPdf: true },
  { key: 'expired',       label: 'Expired Extinguishers',      desc: 'Extinguishers past their expiry date',    hasPdf: true },
  { key: 'maintenance',   label: 'Maintenance History',        desc: 'All maintenance logs with issues/notes',  hasPdf: true },
  { key: 'users',         label: 'User Accounts',              desc: 'System users (Admin only)',               hasPdf: false },
];

function SectionHeader({ title, sub }) {
  return (
    <div className="mb-4">
      <h2 className="font-semibold text-gray-800">{title}</h2>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function MetricCard({ label, value, color = 'gray', sub }) {
  const colors = {
    red:    'bg-red-50   border-red-200   text-red-700',
    green:  'bg-green-50 border-green-200 text-green-700',
    amber:  'bg-amber-50 border-amber-200 text-amber-700',
    blue:   'bg-blue-50  border-blue-200  text-blue-700',
    crimson:'bg-crimson-50 border-crimson-200 text-crimson-700',
    gray:   'bg-gray-50  border-gray-200  text-gray-700',
  };
  return (
    <div className={`card border text-center ${colors[color]}`}>
      <p className="text-[11px] uppercase tracking-wider font-semibold opacity-70">{label}</p>
      <p className="text-3xl font-bold mt-1">{value ?? '—'}</p>
      {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
    </div>
  );
}

export default function Reports() {
  const { isAdmin } = useAuth();
  const [summary,  setSummary]  = useState(null);
  const [expired,  setExpired]  = useState(null);
  const [history,  setHistory]  = useState(null);
  const [inspRpt,  setInspRpt]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [exporting, setExporting] = useState('');
  const [period,   setPeriod]   = useState('monthly');

  useEffect(() => {
    Promise.all([
      getReportSummary(),
      getExpiredReport({ within: 60 }),
      getMaintenanceHistory({ period }),
      getInspectionReport(),
    ]).then(([s, e, h, i]) => {
      setSummary(s.data);
      setExpired(e.data);
      setHistory(h.data);
      setInspRpt(i.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [period]);

  const handlePDF = async (type) => {
    setExporting(`pdf-${type}`);
    try {
      const res = await exportPDF(type);
      download(new Blob([res.data], { type: 'application/pdf' }), `fems-${type}-${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('PDF downloaded');
    } catch (err) { toast.error(err.message); }
    finally { setExporting(''); }
  };

  const handleCSV = async (type) => {
    setExporting(`csv-${type}`);
    try {
      const res = await exportCSV(type);
      download(new Blob([res.data], { type: 'text/csv' }), `fems-${type}-${new Date().toISOString().split('T')[0]}.csv`);
      toast.success('CSV downloaded');
    } catch (err) { toast.error(err.message); }
    finally { setExporting(''); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-crimson-200 border-t-crimson-700 rounded-full animate-spin" />
    </div>
  );

  const insp = inspRpt?.summary;
  const inspStatusData = insp?.byStatus
    ? Object.entries(insp.byStatus).map(([name, value]) => ({ name, value }))
    : [];
  const grouped = history?.summary?.grouped?.slice(-8) || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">Real-time analytics — {new Date().toLocaleString()}</p>
      </div>

      {/* ── INVENTORY REPORTS ─────────────────────────────────── */}
      <section>
        <SectionHeader title="Inventory Report" sub="Fire extinguisher stock overview" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Total Stock"    value={summary?.extinguishers?.total}       color="crimson" sub="All registered" />
          <MetricCard label="Active"         value={summary?.extinguishers?.active}       color="green"   sub="Assigned & valid" />
          <MetricCard label="Inactive"       value={summary?.extinguishers?.inactive}     color="gray"    sub="Unassigned" />
          <MetricCard label="Expired"        value={summary?.extinguishers?.expired}      color="red"     sub="Past expiry date" />
        </div>
      </section>

      {/* ── INSPECTION REPORTS ────────────────────────────────── */}
      <section>
        <SectionHeader title="Inspection Report" sub="Schedule and completion tracking" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <MetricCard label="Total Inspections" value={insp?.total}                 color="blue" />
          <MetricCard label="Pending"           value={summary?.inspections?.pending}   color="amber" sub="Awaiting confirmation" />
          <MetricCard label="Completed"         value={summary?.inspections?.completed} color="green" />
          <MetricCard label="Overdue"           value={summary?.inspections?.overdue}   color="red"   sub="Past date, not done" />
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm text-gray-700">Inspections by Status</p>
            <p className="text-xs text-gray-400">Upcoming: {insp?.upcoming ?? 0}</p>
          </div>
          {inspStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={inspStatusData} barSize={36}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} cursor={{ fill: '#fff1f2' }} />
                <Bar dataKey="value" fill="#DC143C" radius={[4, 4, 0, 0]} name="Count" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-sm text-gray-400 py-8">No inspection data</p>}
        </div>
      </section>

      {/* ── COMPLIANCE REPORTS ───────────────────────────────── */}
      <section>
        <SectionHeader title="Compliance Report" sub="Safety and regulatory status" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <MetricCard label="Compliant"          value={summary?.compliance?.compliant}         color="green" sub="Valid & not expiring" />
          <MetricCard label="Expired"            value={summary?.compliance?.expired}           color="red"   sub="Requires immediate action" />
          <MetricCard label="Expiring (60 days)" value={summary?.extinguishers?.expiringSoon}   color="amber" sub="Schedule renewal" />
          <MetricCard label="Overdue Inspections" value={summary?.compliance?.overdueInspections} color="red" sub="Unattended inspections" />
        </div>

        {/* Expired extinguishers table */}
        {expired && (expired.expired.count > 0 || expired.expiringSoon.count > 0) && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <p className="font-semibold text-sm text-gray-700">
                Non-Compliant Extinguishers
                <span className="ml-2 text-xs text-red-600 font-normal">
                  ({expired.expired.count} expired, {expired.expiringSoon.count} expiring soon)
                </span>
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead className="table-head">
                  <tr>
                    {['Serial No.', 'Location', 'Type', 'Expiry Date', 'Compliance Status'].map(h => (
                      <th key={h} className="table-head-cell">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...expired.expired.data, ...expired.expiringSoon.data].slice(0, 10).map(e => (
                    <tr key={e.id} className="table-row">
                      <td className="table-cell font-mono font-semibold text-xs">{e.serialNumber}</td>
                      <td className="table-cell">{e.location}</td>
                      <td className="table-cell">{e.type}</td>
                      <td className="table-cell text-xs">{e.expiryDate?.split('T')[0]}</td>
                      <td className="table-cell">
                        <span className={`badge ${new Date(e.expiryDate) < new Date() ? 'badge-expired' : 'badge-maintenance'}`}>
                          {new Date(e.expiryDate) < new Date() ? 'Expired' : 'Expiring Soon'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── MAINTENANCE REPORTS ───────────────────────────────── */}
      <section>
        <SectionHeader title="Maintenance Report" sub="Activity frequency and history" />
        <div className="grid grid-cols-2 gap-4 mb-4">
          <MetricCard label="Total Logs"        value={summary?.maintenance?.total}           color="blue" />
          <MetricCard label="Last 30 Days"      value={summary?.maintenance?.lastThirtyDays}  color="green" sub="Recent activity" />
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-semibold text-sm text-gray-700">Maintenance Frequency</p>
              <p className="text-xs text-gray-400">Activities over time</p>
            </div>
            <select className="input w-32 text-xs" value={period} onChange={e => setPeriod(e.target.value)}>
              {['daily', 'monthly', 'yearly'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {grouped.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={grouped} barSize={28}>
                <XAxis dataKey="period" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} cursor={{ fill: '#fff1f2' }} />
                <Bar dataKey="count" fill="#be123c" radius={[4, 4, 0, 0]} name="Activities" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-sm text-gray-400 py-8">No maintenance data yet</p>}
        </div>
      </section>

      {/* ── EXPORT ───────────────────────────────────────────── */}
      <section>
        <SectionHeader title="Export Reports" sub="Download reports in PDF or CSV format" />
        <div className="card divide-y divide-gray-100">
          {EXPORT_TYPES.filter(t => t.key !== 'users' || isAdmin).map(({ key, label, desc, hasPdf }) => (
            <div key={key} className="flex items-center justify-between py-3.5 gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {hasPdf && (
                  <button
                    onClick={() => handlePDF(key)}
                    disabled={!!exporting}
                    className="btn-outline btn-sm"
                  >
                    {exporting === `pdf-${key}` ? (
                      <><span className="w-3 h-3 border-2 border-crimson-400 border-t-crimson-700 rounded-full animate-spin" /> Generating...</>
                    ) : 'PDF'}
                  </button>
                )}
                <button
                  onClick={() => handleCSV(key)}
                  disabled={!!exporting}
                  className="btn-crimson btn-sm"
                >
                  {exporting === `csv-${key}` ? (
                    <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Exporting...</>
                  ) : 'CSV'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
