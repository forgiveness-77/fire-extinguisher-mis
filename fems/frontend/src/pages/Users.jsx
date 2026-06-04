import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getUsers, updateUser, deleteUser, getPendingInspectors, approveInspector, rejectInspector } from '../api';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import Pagination from '../components/Pagination';
import { useAuth } from '../context/AuthContext';

const ROLES = ['admin', 'inspector', 'user'];
const STATUSES = ['active', 'pending', 'suspended'];

function PendingTab() {
  const [data, setData]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null);
  const [selected, setSelected] = useState(null);
  const [reason, setReason]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await getPendingInspectors(); setData(r.data.data); }
    catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await approveInspector(selected.id);
      toast.success(`${selected.firstName} ${selected.lastName} approved`);
      setModal(null);
      load();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const handleReject = async () => {
    setSubmitting(true);
    try {
      await rejectInspector(selected.id, { reason });
      toast.success(`Registration declined`);
      setModal(null);
      load();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-crimson-200 border-t-crimson-700 rounded-full animate-spin" /></div>;

  if (data.length === 0) return (
    <div className="card text-center py-10 text-gray-400 text-sm">No pending inspector registrations</div>
  );

  return (
    <div className="space-y-3">
      {data.map(u => (
        <div key={u.id} className="card flex items-center justify-between gap-4 border border-amber-200 bg-amber-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-200 text-amber-800 flex items-center justify-center font-bold text-sm shrink-0">
              {u.firstName[0]}{u.lastName[0]}
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm">{u.firstName} {u.lastName}</p>
              <p className="text-xs text-gray-500">{u.email}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Registered {new Date(u.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => { setSelected(u); setModal('approve'); }} className="btn-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition px-3 py-1.5 text-xs font-medium">Approve</button>
            <button onClick={() => { setSelected(u); setReason(''); setModal('reject'); }} className="btn-danger btn-sm">Decline</button>
          </div>
        </div>
      ))}

      <Modal open={modal === 'approve'} onClose={() => setModal(null)} title="Approve Inspector" size="sm">
        <p className="text-sm text-gray-600">Approve <strong>{selected?.firstName} {selected?.lastName}</strong> as an inspector? They will receive an email and be able to login.</p>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={handleApprove} disabled={submitting} className="btn-sm bg-green-600 text-white rounded-lg hover:bg-green-700 px-4 py-2 text-sm font-medium">
            {submitting ? 'Approving...' : 'Approve'}
          </button>
        </div>
      </Modal>

      <Modal open={modal === 'reject'} onClose={() => setModal(null)} title="Decline Registration" size="sm">
        <p className="text-sm text-gray-600 mb-3">Decline <strong>{selected?.firstName} {selected?.lastName}</strong>'s registration? They will be notified.</p>
        <div>
          <label className="label">Reason (optional)</label>
          <textarea className="input resize-none" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Incomplete credentials..." />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={handleReject} disabled={submitting} className="btn-danger">{submitting ? 'Declining...' : 'Decline'}</button>
        </div>
      </Modal>
    </div>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const [tab, setTab]             = useState('all');
  const [data, setData]           = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [filters, setFilters]     = useState({ role: '', status: '', search: '', page: 1, limit: 10 });
  const [modal, setModal]         = useState(null);
  const [selected, setSelected]   = useState(null);
  const [form, setForm]           = useState({ firstName: '', lastName: '', role: '', status: '' });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
      const r = await getUsers(params);
      setData(r.data.data);
      setPagination(r.data.pagination);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { if (tab === 'all') load(); }, [tab, load]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await updateUser(selected.id, form);
      toast.success('User updated');
      setModal(null);
      load();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await deleteUser(selected.id);
      toast.success('User deleted');
      setModal(null);
      load();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">User Management</h1>
        <p className="page-subtitle">Manage accounts, roles, and inspector approvals</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {['all', 'pending'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab === t ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'all' ? 'All Users' : 'Pending Approvals'}
          </button>
        ))}
      </div>

      {tab === 'pending' ? <PendingTab /> : (
        <>
          {/* Filters */}
          <div className="card">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <input className="input" placeholder="Search name or email..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))} />
              <select className="input" value={filters.role} onChange={e => setFilters(f => ({ ...f, role: e.target.value, page: 1 }))}>
                <option value="">All roles</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select className="input" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}>
                <option value="">All statuses</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="input" value={filters.limit} onChange={e => setFilters(f => ({ ...f, limit: e.target.value, page: 1 }))}>
                {[10, 20, 50].map(n => <option key={n} value={n}>{n} / page</option>)}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead className="table-head">
                  <tr>{['Name','Email','Role','Status','Joined','Actions'].map(h => <th key={h} className="table-head-cell">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="py-16 text-center"><div className="flex justify-center"><div className="w-6 h-6 border-4 border-crimson-200 border-t-crimson-700 rounded-full animate-spin" /></div></td></tr>
                  ) : data.length === 0 ? (
                    <tr><td colSpan={6} className="py-16 text-center text-gray-400 text-sm">No users found</td></tr>
                  ) : data.map(row => (
                    <tr key={row.id} className="table-row">
                      <td className="table-cell">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-crimson-100 text-crimson-700 flex items-center justify-center text-xs font-bold shrink-0">
                            {row.firstName[0]}{row.lastName[0]}
                          </div>
                          <div>
                            <p className="font-medium text-sm text-gray-800">{row.firstName} {row.lastName}</p>
                            {row.id === me?.id && <p className="text-[10px] text-crimson-600 font-semibold">You</p>}
                          </div>
                        </div>
                      </td>
                      <td className="table-cell text-xs text-gray-500">{row.email}</td>
                      <td className="table-cell"><Badge value={row.role} /></td>
                      <td className="table-cell"><Badge value={row.status} /></td>
                      <td className="table-cell text-xs text-gray-400">{new Date(row.createdAt).toLocaleDateString()}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setSelected(row); setForm({ firstName: row.firstName, lastName: row.lastName, role: row.role, status: row.status }); setModal('edit'); }} className="btn-outline btn-sm">Edit</button>
                          {row.id !== me?.id && <button onClick={() => { setSelected(row); setModal('delete'); }} className="btn-danger btn-sm">Delete</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 pb-4">
              <Pagination pagination={pagination} onChange={p => setFilters(f => ({ ...f, page: p }))} />
            </div>
          </div>
        </>
      )}

      {/* Edit Modal */}
      <Modal open={modal === 'edit'} onClose={() => setModal(null)} title="Edit User" size="sm">
        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">First Name</label><input className="input" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} required /></div>
            <div><label className="label">Last Name</label><input className="input" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} required /></div>
          </div>
          <div><label className="label">Role</label>
            <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div><label className="label">Status</label>
            <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-crimson">{submitting ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'delete'} onClose={() => setModal(null)} title="Delete User" size="sm">
        <p className="text-sm text-gray-600">Delete <strong>{selected?.firstName} {selected?.lastName}</strong>? This cannot be undone.</p>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={handleDelete} disabled={submitting} className="btn-danger">{submitting ? 'Deleting...' : 'Delete'}</button>
        </div>
      </Modal>
    </div>
  );
}
