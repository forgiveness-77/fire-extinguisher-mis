import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getExtinguishers, getMaintenanceLogs } from '../api';
import Badge from '../components/Badge';
import { PageSpinner } from '../components/Spinner';

export default function MyExtinguisher() {
  const [ext,    setExt]    = useState(null);
  const [logs,   setLogs]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getExtinguishers(), getMaintenanceLogs({ limit: 10 })])
      .then(([e, m]) => {
        setExt(e.data.data?.[0] || null);
        setLogs(m.data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSpinner />;

  if (!ext) return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">My Extinguisher</h1>
        <p className="page-subtitle">Your assigned fire extinguisher</p>
      </div>
      <div className="card border border-dashed border-gray-200 text-center py-16">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
        </div>
        <p className="text-gray-500 font-medium">No extinguisher assigned</p>
        <p className="text-gray-400 text-sm mt-1">Contact your administrator to have one assigned to you.</p>
      </div>
    </div>
  );

  const daysToExpiry = Math.ceil((new Date(ext.expiryDate) - new Date()) / 86400000);
  const urgency = daysToExpiry < 0 ? 'expired' : daysToExpiry <= 30 ? 'warning' : 'ok';

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="page-title">My Extinguisher</h1>
        <p className="page-subtitle">Your assigned fire extinguisher and maintenance history</p>
      </div>

      {/* Main card */}
      <div className="card border border-crimson-200">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-1">Serial Number</p>
            <p className="text-2xl font-bold font-mono text-gray-800">{ext.serialNumber}</p>
          </div>
          <Badge value={ext.status} />
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            ['Location',  ext.location],
            ['Type',      ext.type],
            ['Size',      `${ext.size} lbs`],
            ['Installed', ext.installationDate?.split('T')[0]],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{k}</p>
              <p className="font-medium text-gray-700 mt-0.5">{v}</p>
            </div>
          ))}
        </div>

        {/* Expiry bar */}
        <div className={`mt-5 px-4 py-3 rounded-xl ${urgency === 'expired' ? 'bg-red-50 border border-red-200' : urgency === 'warning' ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
          <div className="flex items-center justify-between">
            <p className={`text-sm font-semibold ${urgency === 'expired' ? 'text-red-700' : urgency === 'warning' ? 'text-amber-700' : 'text-green-700'}`}>
              {urgency === 'expired' ? 'Expired' : `Expires in ${daysToExpiry} days`}
            </p>
            <p className="text-xs text-gray-500">{ext.expiryDate?.split('T')[0]}</p>
          </div>
          {urgency !== 'ok' && (
            <p className="text-xs mt-1 text-gray-500">
              {urgency === 'expired' ? 'This extinguisher has expired. Schedule an inspection immediately.' : 'This extinguisher is expiring soon. Schedule an inspection.'}
            </p>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <Link to="/inspections" className="btn-crimson">Schedule Inspection</Link>
        </div>
      </div>

      {/* Maintenance history */}
      <div className="card">
        <p className="font-semibold text-gray-800 text-sm mb-4">Maintenance History</p>
        {logs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No maintenance records yet</p>
        ) : (
          <div className="space-y-3">
            {logs.map(m => (
              <div key={m.id} className="p-3 rounded-xl bg-cream-100 border border-cream-200">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-gray-600">{m.dateOfAction?.split('T')[0]}</p>
                </div>
                <p className="text-sm text-gray-700 font-medium">{m.actionsTaken}</p>
                <p className="text-xs text-gray-500 mt-1">{m.conditionsNoted}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
