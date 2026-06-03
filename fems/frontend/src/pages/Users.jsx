import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getUsers, updateUser, deleteUser } from '../api';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import Pagination from '../components/Pagination';
import { useAuth } from '../context/AuthContext';

const ROLES = ['admin', 'inspector', 'user'];

export default function Users() {
  const { user: me } = useAuth();

  const [data, setData]           = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [filters, setFilters]     = useState({ role: '', search: '', page: 1, limit: 10 });

  const [modal, setModal]         = useState(null);
  const [selected, setSelected]   = useState(null);
  const [form, setForm]           = useState({ firstName: '', lastName: '', role: '' });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
      const res = await getUsers(params);
      setData(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

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
        <p className="page-subtitle">Manage system accounts and roles</p>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <input className="input" placeholder="Search by name or email..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))} />
          <select className="input" value={filters.role} onChange={e => setFilters(f => ({ ...f, role: e.target.value, page: 1 }))}>
            <option value="">All roles</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
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
              <tr>
                {['Name', 'Email', 'Role', 'Joined', 'Actions'].map(h => (
                  <th key={h} className="table-head-cell">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-16 text-center"><div className="flex justify-center"><div className="w-6 h-6 border-4 border-crimson-200 border-t-crimson-700 rounded-full animate-spin" /></div></td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={5} className="py-16 text-center text-gray-400 text-sm">No users found</td></tr>
              ) : data.map(row => (
                <tr key={row.id} className="table-row">
                  <td className="table-cell">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-crimson-100 text-crimson-700 flex items-center justify-center text-xs font-bold shrink-0">
                        {row.firstName[0]}{row.lastName[0]}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{row.firstName} {row.lastName}</p>
                        {row.id === me?.id && <p className="text-xs text-crimson-600">You</p>}
                      </div>
                    </div>
                  </td>
                  <td className="table-cell text-xs text-gray-500">{row.email}</td>
                  <td className="table-cell"><Badge value={row.role} /></td>
                  <td className="table-cell text-xs text-gray-400">{new Date(row.createdAt).toLocaleDateString()}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setSelected(row); setForm({ firstName: row.firstName, lastName: row.lastName, role: row.role }); setModal('edit'); }}
                        className="btn-outline btn-sm"
                      >
                        Edit
                      </button>
                      {row.id !== me?.id && (
                        <button onClick={() => { setSelected(row); setModal('delete'); }} className="btn-danger btn-sm">Delete</button>
                      )}
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

      {/* Edit Modal */}
      <Modal open={modal === 'edit'} onClose={() => setModal(null)} title="Edit User" size="sm">
        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First Name</label>
              <input className="input" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input className="input" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} required />
            </div>
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-crimson">{submitting ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      </Modal>

      {/* Delete Modal */}
      <Modal open={modal === 'delete'} onClose={() => setModal(null)} title="Delete User" size="sm">
        <p className="text-sm text-gray-600">
          Delete <strong>{selected?.firstName} {selected?.lastName}</strong>? This cannot be undone.
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={handleDelete} disabled={submitting} className="btn-danger">{submitting ? 'Deleting...' : 'Delete'}</button>
        </div>
      </Modal>
    </div>
  );
}
