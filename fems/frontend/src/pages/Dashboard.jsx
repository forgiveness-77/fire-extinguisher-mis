import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { getReportSummary, getExtinguisherReport, getExpiredReport, getInspections, getMaintenanceLogs, getExtinguishers } from '../api';
import { useAuth } from '../context/AuthContext';
import Badge from '../components/Badge';
import { PageSpinner } from '../components/Spinner';

const COLORS = ['#DC143C','#f43f5e','#fda4af','#fecdd3','#be123c'];

function StatCard({ label, value, sub, accent = false }) {
  return (
    <div className={`card ${accent ? 'border-crimson-200 bg-crimson-50' : 'border-gray-100 bg-white'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${accent ? 'text-crimson-700' : 'text-gray-800'}`}>{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── ADMIN DASHBOARD ─────────────────────────────────────────────────────────
function AdminDashboard() {
  const [summary,  setSummary]  = useState(null);
  const [extRpt,   setExtRpt]   = useState(null);
  const [expired,  setExpired]  = useState(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([getReportSummary(), getExtinguisherReport({ period:'monthly', limit:100 }), getExpiredReport({ within:30 })])
      .then(([s, e, ex]) => { setSummary(s.data); setExtRpt(e.data); setExpired(ex.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSpinner />;

  const byType = extRpt?.summary?.byType ? Object.entries(extRpt.summary.byType).map(([name,value]) => ({ name, value })) : [];
  const grouped = extRpt?.grouped?.slice(-8) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Admin Dashboard</h1>
        <p className="page-subtitle">{new Date().toLocaleDateString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
      </div>

      {/* Pending inspectors alert */}
      {summary?.users?.pendingInspectors > 0 && (
        <div className="card border border-amber-200 bg-amber-50 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-amber-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 20h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v11a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">{summary.users.pendingInspectors} inspector(s) awaiting approval</p>
            <p className="text-xs text-amber-700 mt-0.5">Review and approve or reject pending registrations.</p>
          </div>
          <Link to="/users" className="btn-sm btn bg-amber-600 text-white hover:bg-amber-700 shrink-0">Review</Link>
        </div>
      )}

      {/* Stat grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Extinguishers" value={summary?.extinguishers?.total}    sub={`${summary?.extinguishers?.active} active`} accent />
        <StatCard label="Inactive"             value={summary?.extinguishers?.inactive} sub="Unassigned" />
        <StatCard label="Expired"              value={summary?.extinguishers?.expired}  sub="Needs replacement" />
        <StatCard label="Expiring (30 days)"   value={summary?.extinguishers?.expiringSoon} sub="Act soon" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Inspections"  value={summary?.inspections?.total}     sub={`${summary?.inspections?.scheduled} scheduled`} />
        <StatCard label="Confirmed"          value={summary?.inspections?.confirmed} />
        <StatCard label="Maintenance Logs"   value={summary?.maintenance?.total} />
        <StatCard label="Total Users"        value={summary?.users?.total} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-semibold text-gray-800 text-sm">Monthly Registrations</p>
              <p className="text-xs text-gray-400">Extinguisher registrations by month</p>
            </div>
            <Link to="/reports" className="text-xs text-crimson-700 font-medium hover:underline">Full report</Link>
          </div>
          {grouped.length > 0 ? (
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={grouped} barSize={28}>
                <XAxis dataKey="period" tick={{ fontSize:10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize:10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius:8, border:'1px solid #fecdd3', fontSize:12 }} cursor={{ fill:'#fff1f2' }} />
                <Bar dataKey="count" fill="#DC143C" radius={[4,4,0,0]} name="Registered" />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-44 flex items-center justify-center text-gray-400 text-sm">No data yet</div>}
        </div>

        <div className="card">
          <p className="font-semibold text-gray-800 text-sm mb-1">By Type</p>
          <p className="text-xs text-gray-400 mb-3">Extinguisher distribution</p>
          {byType.length > 0 ? (
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={byType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={68} innerRadius={32}>
                  {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend iconSize={9} iconType="circle" formatter={v => <span style={{ fontSize:10 }}>{v}</span>} />
                <Tooltip contentStyle={{ borderRadius:8, fontSize:11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="h-44 flex items-center justify-center text-gray-400 text-sm">No data yet</div>}
        </div>
      </div>

      {/* Expired alert */}
      {expired && (expired.expired.count > 0 || expired.expiringSoon.count > 0) && (
        <div className="card border border-red-200 bg-red-50 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-semibold text-red-800 text-sm">Attention Required</p>
            <p className="text-sm text-red-700 mt-0.5">
              {expired.expired.count > 0 && <><strong>{expired.expired.count}</strong> extinguisher(s) have expired. </>}
              {expired.expiringSoon.count > 0 && <><strong>{expired.expiringSoon.count}</strong> expire within 30 days.</>}
            </p>
          </div>
          <Link to="/reports" className="btn btn-sm bg-red-600 text-white hover:bg-red-700 shrink-0">View Report</Link>
        </div>
      )}
    </div>
  );
}

// ─── INSPECTOR DASHBOARD ─────────────────────────────────────────────────────
function InspectorDashboard() {
  const { user } = useAuth();
  const [inspections, setInspections] = useState([]);
  const [myLogs,      setMyLogs]      = useState([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([
      getInspections({ status: 'scheduled', limit: 5 }),
      getMaintenanceLogs({ limit: 5 }),
    ]).then(([i, m]) => {
      setInspections(i.data.data);
      setMyLogs(m.data.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Welcome, {user?.firstName}</h1>
        <p className="page-subtitle">Your inspection and maintenance overview</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Pending Inspections" value={inspections.length} sub="Awaiting your action" accent />
        <StatCard label="My Maintenance Logs" value={myLogs.length} sub="Recent activities" />
      </div>

      {/* Pending inspections */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-gray-800 text-sm">Pending Inspections</p>
          <Link to="/inspections" className="text-xs text-crimson-700 font-medium hover:underline">View all</Link>
        </div>
        {inspections.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No pending inspections</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {inspections.map(i => (
              <div key={i.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-800">Extinguisher: {i.extinguisherId.slice(0,8)}…</p>
                  <p className="text-xs text-gray-400 mt-0.5">{i.scheduledDate?.split('T')[0]} at {i.scheduledTime}</p>
                </div>
                <Badge value={i.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent maintenance */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-gray-800 text-sm">Recent Maintenance</p>
          <Link to="/maintenance" className="text-xs text-crimson-700 font-medium hover:underline">View all</Link>
        </div>
        {myLogs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No maintenance logs yet</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {myLogs.map(m => (
              <div key={m.id} className="py-3">
                <p className="text-sm font-medium text-gray-800 truncate">{m.actionsTaken}</p>
                <p className="text-xs text-gray-400 mt-0.5">{m.dateOfAction?.split('T')[0]} — Ext: {m.extinguisherId.slice(0,8)}…</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── USER DASHBOARD ───────────────────────────────────────────────────────────
function UserDashboard() {
  const { user } = useAuth();
  const [myExt,     setMyExt]     = useState(null);
  const [myInspections, setMyInsp] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      getExtinguishers(),
      getInspections({ limit: 5 }),
    ]).then(([e, i]) => {
      setMyExt(e.data.data?.[0] || null);
      setMyInsp(i.data.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSpinner />;

  const statusColor = { active: 'text-green-700', inactive: 'text-gray-500', expired: 'text-red-600' };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Welcome, {user?.firstName}</h1>
        <p className="page-subtitle">Your fire safety overview</p>
      </div>

      {/* Assigned extinguisher */}
      {myExt ? (
        <div className="card border border-crimson-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Your Assigned Extinguisher</p>
              <p className="text-lg font-bold text-gray-800">{myExt.serialNumber}</p>
              <p className="text-sm text-gray-500 mt-1">{myExt.location}</p>
              <div className="flex items-center gap-3 mt-3">
                <span className="text-xs text-gray-400">Type: <strong>{myExt.type}</strong></span>
                <span className="text-xs text-gray-400">Size: <strong>{myExt.size} lbs</strong></span>
                <span className={`text-xs font-semibold ${statusColor[myExt.status]}`}>{myExt.status?.toUpperCase()}</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">Expires: <strong>{myExt.expiryDate?.split('T')[0]}</strong></p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-crimson-100 flex items-center justify-center shrink-0">
              <svg className="w-7 h-7 text-crimson-700" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
          </div>
          {myExt.status === 'expired' && (
            <div className="mt-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              Your extinguisher has expired. Schedule an inspection immediately.
            </div>
          )}
          <div className="mt-4">
            <Link to="/inspections" className="btn-crimson btn-sm">Schedule Inspection</Link>
          </div>
        </div>
      ) : (
        <div className="card border border-dashed border-gray-300 text-center py-10">
          <p className="text-gray-400 text-sm">No extinguisher assigned to you yet.</p>
          <p className="text-xs text-gray-300 mt-1">Contact your administrator to get one assigned.</p>
        </div>
      )}

      {/* My inspections */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-gray-800 text-sm">My Inspections</p>
          <Link to="/inspections" className="text-xs text-crimson-700 font-medium hover:underline">Schedule new</Link>
        </div>
        {myInspections.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No inspections scheduled yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {myInspections.map(i => (
              <div key={i.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-800">{i.scheduledDate?.split('T')[0]} at {i.scheduledTime}</p>
                  {i.notes && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{i.notes}</p>}
                </div>
                <Badge value={i.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  if (user?.role === 'admin')     return <AdminDashboard />;
  if (user?.role === 'inspector') return <InspectorDashboard />;
  return <UserDashboard />;
}
