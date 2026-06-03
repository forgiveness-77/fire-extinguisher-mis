import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getReportSummary, getExpiredReport, getMaintenanceHistory, getInspectionReport, exportPDF, exportCSV } from '../api';

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const EXPORT_TYPES = ['extinguishers', 'inspections', 'expired', 'maintenance', 'users'];

export default function Reports() {
  const [summary,  setSummary]  = useState(null);
  const [expired,  setExpired]  = useState(null);
  const [history,  setHistory]  = useState(null);
  const [inspRpt,  setInspRpt]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [exporting, setExporting] = useState('');
  const [period, setPeriod]     = useState('monthly');

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
      download(new Blob([res.data], { type: 'application/pdf' }), `fems-${type}-report.pdf`);
      toast.success('PDF downloaded');
    } catch (err) { toast.error(err.message); }
    finally { setExporting(''); }
  };

  const handleCSV = async (type) => {
    setExporting(`csv-${type}`);
    try {
      const res = await exportCSV(type);
      download(new Blob([res.data], { type: 'text/csv' }), `fems-${type}.csv`);
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
  const inspStatusData = insp
    ? Object.entries(insp.byStatus || {}).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">Real-time analytics and data exports — generated {new Date().toLocaleString()}</p>
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Extinguishers', value: summary?.extinguishers?.total, color: 'text-crimson-700' },
          { label: 'Active',              value: summary?.extinguishers?.active, color: 'text-green-700' },
          { label: 'Expired',             value: summary?.extinguishers?.expired, color: 'text-red-600' },
          { label: 'Expiring (30 days)',  value: summary?.extinguishers?.expiringSoon, color: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="card text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{s.label}</p>
            <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value ?? '—'}</p>
          </div>
        ))}
      </div>

      {/* Inspection status + Maintenance history charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Inspection by status */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-800 text-sm">Inspection Status</h3>
              <p className="text-xs text-gray-400">Total: {insp?.total ?? 0} | Upcoming: {insp?.upcoming ?? 0}</p>
            </div>
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
          ) : <p className="h-40 flex items-center justify-center text-gray-400 text-sm">No data</p>}
        </div>

        {/* Maintenance history */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-800 text-sm">Maintenance Activity</h3>
              <p className="text-xs text-gray-400">Total logs: {history?.summary?.total ?? 0}</p>
            </div>
            <select className="input w-32 text-xs" value={period} onChange={e => setPeriod(e.target.value)}>
              {['daily', 'monthly', 'yearly'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {history?.summary?.grouped?.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={history.summary.grouped.slice(-8)} barSize={28}>
                <XAxis dataKey="period" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} cursor={{ fill: '#fff1f2' }} />
                <Bar dataKey="count" fill="#be123c" radius={[4, 4, 0, 0]} name="Activities" />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No data</div>}
        </div>
      </div>

      {/* Expired table */}
      {expired && (expired.expired.count > 0 || expired.expiringSoon.count > 0) && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-800 text-sm">Expired / Expiring Extinguishers</h3>
              <p className="text-xs text-gray-400">{expired.expired.count} expired · {expired.expiringSoon.count} expiring within 60 days</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-sm">
              <thead className="table-head">
                <tr>
                  {['Serial No.', 'Location', 'Type', 'Expiry Date', 'Status'].map(h => <th key={h} className="table-head-cell">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...expired.expired.data, ...expired.expiringSoon.data].slice(0, 10).map(e => (
                  <tr key={e.id} className="table-row">
                    <td className="table-cell font-mono text-xs font-semibold">{e.serialNumber}</td>
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

      {/* Export section */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 text-sm mb-1">Export Data</h3>
        <p className="text-xs text-gray-400 mb-4">Download reports as PDF or CSV files</p>
        <div className="divide-y divide-gray-100">
          {EXPORT_TYPES.filter(t => t !== 'users' || true).map(type => (
            <div key={type} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-gray-700 capitalize">{type === 'expired' ? 'Expired Extinguishers' : type}</p>
                <p className="text-xs text-gray-400">
                  {type === 'extinguishers' ? 'Full inventory list'
                    : type === 'inspections' ? 'All inspection records'
                    : type === 'expired' ? 'Expired extinguisher data'
                    : type === 'maintenance' ? 'All maintenance logs'
                    : 'System user list (Admin only)'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {type !== 'users' && (
                  <button
                    onClick={() => handlePDF(type)}
                    disabled={!!exporting}
                    className="btn-outline btn-sm"
                  >
                    {exporting === `pdf-${type}` ? 'Generating...' : 'PDF'}
                  </button>
                )}
                <button
                  onClick={() => handleCSV(type)}
                  disabled={!!exporting}
                  className="btn-crimson btn-sm"
                >
                  {exporting === `csv-${type}` ? 'Exporting...' : 'CSV'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
