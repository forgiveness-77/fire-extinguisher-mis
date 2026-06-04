import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getExtinguishers, createExtinguisher, updateExtinguisher, deleteExtinguisher, assignExtinguisher, unassignExtinguisher, getUsers } from '../api';
import { useAuth } from '../context/AuthContext';
import { useEntityMaps } from '../hooks/useEntityMaps';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import Pagination from '../components/Pagination';

const TYPES = ['Water', 'CO2', 'Foam', 'DryChemical'];
const BLANK = { serialNumber: '', location: '', type: 'CO2', size: '', installationDate: '', expiryDate: '' };

export default function Extinguishers() {
  const { can, isAdmin } = useAuth();
  const canWrite = can(['admin', 'inspector']);
  const { userMap } = useEntityMaps(isAdmin);

  const [data, setData]           = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [filters, setFilters]     = useState({ status: '', type: '', search: '', page: 1, limit: 10 });

  const [modal, setModal]         = useState(null);
  const [selected, setSelected]   = useState(null);
  const [form, setForm]           = useState(BLANK);
  const [assignUserId, setAssignUserId] = useState('');
  const [users, setUsers]         = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
      const r = await getExtinguishers(params);
      setData(r.data.data);
      setPagination(r.data.pagination);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  // Load users for assign dropdown (admin only)
  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    try { const r = await getUsers({ role: 'user', limit: 100 }); setUsers(r.data.data); } catch {}
  }, [isAdmin]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (modal === 'create') { await createExtinguisher(form); toast.success('Extinguisher registered'); }
      else { await updateExtinguisher(selected.id, form); toast.success('Updated'); }
      setModal(null); load();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try { await deleteExtinguisher(selected.id); toast.success('Deleted'); setModal(null); load(); }
    catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const handleAssign = async () => {
    if (!assignUserId) { toast.error('Select a user'); return; }
    setSubmitting(true);
    try { await assignExtinguisher(selected.id, { userId: assignUserId }); toast.success('Extinguisher assigned'); setModal(null); load(); }
    catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const handleUnassign = async () => {
    setSubmitting(true);
    try { await unassignExtinguisher(selected.id); toast.success('Extinguisher unassigned'); setModal(null); load(); }
    catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const openAssign = async (row) => {
    setSelected(row); setAssignUserId('');
    await loadUsers();
    setModal('assign');
  };

  const statusDot = { active: 'bg-green-500', inactive: 'bg-gray-400', expired: 'bg-red-500', maintenance: 'bg-amber-500' };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Extinguishers</h1>
          <p className="page-subtitle">Fire extinguisher inventory — status is computed automatically</p>
        </div>
        {canWrite && <button onClick={() => { setForm(BLANK); setModal('create'); }} className="btn-crimson shrink-0">+ Register Extinguisher</button>}
      </div>

      {/* Status legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        {[['active','Assigned to user, not expired'],['inactive','Not assigned'],['expired','Past expiry date']].map(([s, desc]) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${statusDot[s]}`} />
            <strong className="capitalize">{s}</strong> — {desc}
          </span>
        ))}
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <input className="input" placeholder="Search serial / location..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))} />
          <select className="input" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}>
            <option value="">All statuses</option>
            {['active','inactive','expired'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input" value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value, page: 1 }))}>
            <option value="">All types</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="input" value={filters.limit} onChange={e => setFilters(f => ({ ...f, limit: e.target.value, page: 1 }))}>
            {[10,20,50].map(n => <option key={n} value={n}>{n} per page</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="table-head">
              <tr>
                {['Serial No.','Location','Type','Size (lbs)','Installed','Expires','Status','Assigned To','Actions'].map(h => (
                  <th key={h} className="table-head-cell">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-14 text-center"><div className="flex justify-center"><div className="w-6 h-6 border-4 border-crimson-200 border-t-crimson-700 rounded-full animate-spin" /></div></td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={9} className="py-14 text-center text-gray-400 text-sm">No extinguishers found</td></tr>
              ) : data.map(row => (
                <tr key={row.id} className="table-row">
                  <td className="table-cell font-mono text-xs font-semibold text-gray-800">{row.serialNumber}</td>
                  <td className="table-cell text-sm">{row.location}</td>
                  <td className="table-cell text-sm">{row.type}</td>
                  <td className="table-cell text-sm">{row.size}</td>
                  <td className="table-cell text-xs text-gray-500">{row.installationDate?.split('T')[0]}</td>
                  <td className="table-cell text-xs">{row.expiryDate?.split('T')[0]}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot[row.status] || 'bg-gray-400'}`} />
                      <Badge value={row.status} />
                    </div>
                  </td>
                  <td className="table-cell text-sm">
                    {row.assignedUserId
                      ? <span className="text-green-700 font-medium">{userMap[row.assignedUserId] || 'User'}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1 flex-wrap">
                      <button onClick={() => { setSelected(row); setModal('view'); }} className="btn-ghost btn-sm">View</button>
                      {canWrite && <button onClick={() => { setSelected(row); setForm({ ...row, installationDate: row.installationDate?.split('T')[0], expiryDate: row.expiryDate?.split('T')[0] }); setModal('edit'); }} className="btn-outline btn-sm">Edit</button>}
                      {isAdmin && <button onClick={() => openAssign(row)} className="btn-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 px-2.5 py-1 text-xs">{row.assignedUserId ? 'Reassign' : 'Assign'}</button>}
                      {isAdmin && row.assignedUserId && <button onClick={() => { setSelected(row); setModal('unassign'); }} className="btn-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 px-2.5 py-1 text-xs">Unassign</button>}
                      {isAdmin && <button onClick={() => { setSelected(row); setModal('delete'); }} className="btn-danger btn-sm">Del</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4"><Pagination pagination={pagination} onChange={p => setFilters(f => ({ ...f, page: p }))} /></div>
      </div>

      {/* Create / Edit Modal */}
      <Modal open={modal === 'create' || modal === 'edit'} onClose={() => setModal(null)} title={modal === 'create' ? 'Register Extinguisher' : 'Edit Extinguisher'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Serial Number</label><input className="input" value={form.serialNumber} onChange={set('serialNumber')} required placeholder="FE-001" disabled={modal === 'edit'} /></div>
            <div><label className="label">Type</label><select className="input" value={form.type} onChange={set('type')}>{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          </div>
          <div><label className="label">Location</label><input className="input" value={form.location} onChange={set('location')} required placeholder="Floor 1 - Reception" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Size (lbs)</label><input className="input" type="number" step="0.5" min="0.5" value={form.size} onChange={set('size')} required placeholder="5" /></div>
            <div><label className="label">Installation Date</label><input className="input" type="date" value={form.installationDate} onChange={set('installationDate')} required /></div>
          </div>
          <div><label className="label">Expiry Date</label><input className="input" type="date" value={form.expiryDate} onChange={set('expiryDate')} required /></div>
          <p className="text-xs text-gray-400 bg-cream-100 rounded-lg px-3 py-2">Status is computed automatically based on expiry date and user assignment. No manual status selection needed.</p>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-crimson">{submitting ? 'Saving...' : modal === 'create' ? 'Register' : 'Save Changes'}</button>
          </div>
        </form>
      </Modal>

      {/* View Modal */}
      <Modal open={modal === 'view'} onClose={() => setModal(null)} title="Extinguisher Details">
        {selected && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            {[['Serial No.', selected.serialNumber],['Location', selected.location],['Type', selected.type],['Size', `${selected.size} lbs`],['Status', <Badge key="s" value={selected.status} />],['Installed', selected.installationDate?.split('T')[0]],['Expires', selected.expiryDate?.split('T')[0]],['Assigned', selected.assignedUserId ? `User ID: ${selected.assignedUserId.slice(0,8)}…` : 'Unassigned']].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{k}</dt>
                <dd className="text-gray-800 font-medium mt-0.5">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Modal>

      {/* Assign Modal */}
      <Modal open={modal === 'assign'} onClose={() => setModal(null)} title={`Assign ${selected?.serialNumber}`} size="sm">
        <p className="text-sm text-gray-600 mb-4">Assign this extinguisher to a user. They will receive an email notification and it will appear in their dashboard.</p>
        <div>
          <label className="label">Select User</label>
          <select className="input" value={assignUserId} onChange={e => setAssignUserId(e.target.value)}>
            <option value="">Choose a user...</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={handleAssign} disabled={submitting || !assignUserId} className="btn-crimson">{submitting ? 'Assigning...' : 'Assign'}</button>
        </div>
      </Modal>

      {/* Unassign Modal */}
      <Modal open={modal === 'unassign'} onClose={() => setModal(null)} title="Unassign Extinguisher" size="sm">
        <p className="text-sm text-gray-600">Unassign <strong>{selected?.serialNumber}</strong>? The status will become inactive and the user will be notified.</p>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={handleUnassign} disabled={submitting} className="btn-danger">{submitting ? 'Unassigning...' : 'Unassign'}</button>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={modal === 'delete'} onClose={() => setModal(null)} title="Delete Extinguisher" size="sm">
        <p className="text-sm text-gray-600">Delete <strong>{selected?.serialNumber}</strong>? This cannot be undone.</p>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={handleDelete} disabled={submitting} className="btn-danger">{submitting ? 'Deleting...' : 'Delete'}</button>
        </div>
      </Modal>
    </div>
  );
}
