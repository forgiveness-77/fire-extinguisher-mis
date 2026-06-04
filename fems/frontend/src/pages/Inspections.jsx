import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getInspections, createInspection, updateInspection, deleteInspection } from '../api';
import { useAuth } from '../context/AuthContext';
import { useEntityMaps } from '../hooks/useEntityMaps';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import Pagination from '../components/Pagination';

const STATUSES = ['scheduled', 'confirmed', 'completed', 'cancelled'];

const BLANK = {
  extinguisherId: '',
  scheduledDate: '',
  scheduledTime: '09:00',
  notes: '',
  notifyPersonnel: '',
};

export default function Inspections() {
  const { can, isAdmin, user } = useAuth();
  const canManage = can(['admin', 'inspector']);

  // Entity maps for name resolution and dropdown
  const { extList, resolveExt, resolveUser, userMap, loading: loadingEntities } = useEntityMaps(canManage);

  const [data, setData]           = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [filters, setFilters]     = useState({ status: '', page: 1, limit: 10 });

  const [modal, setModal]         = useState(null);
  const [selected, setSelected]   = useState(null);
  const [form, setForm]           = useState(BLANK);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
      const r = await getInspections(params);
      setData(r.data.data);
      setPagination(r.data.pagination);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const openCreate = () => {
    // Pre-select user's own extinguisher if they're a regular user
    const myExt = !canManage && extList.length === 1 ? extList[0].id : '';
    setForm({ ...BLANK, extinguisherId: myExt });
    setModal('create');
  };

  useEffect(() => {
    if (modal === 'create' && !canManage && extList.length === 1 && !form.extinguisherId) {
      setForm(f => ({ ...f, extinguisherId: extList[0].id }));
    }
  }, [modal, canManage, extList, form.extinguisherId]);

  const openEdit = (row) => {
    setSelected(row);
    setForm({
      extinguisherId: row.extinguisherId,
      scheduledDate: row.scheduledDate?.split('T')[0],
      scheduledTime: row.scheduledTime,
      notes: row.notes || '',
      notifyPersonnel: (row.notifyPersonnel || []).join(', '),
      status: row.status,
      inspectorId: row.inspectorId || '',
    });
    setModal('edit');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        notifyPersonnel: form.notifyPersonnel
          ? form.notifyPersonnel.split(',').map(s => s.trim()).filter(Boolean)
          : [],
      };
      if (modal === 'create') {
        await createInspection(payload);
        toast.success('Inspection scheduled successfully');
      } else {
        await updateInspection(selected.id, payload);
        toast.success('Inspection updated');
      }
      setModal(null);
      load();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await deleteInspection(selected.id);
      toast.success('Inspection deleted');
      setModal(null);
      load();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const isOverdue = (row) =>
    ['scheduled', 'confirmed'].includes(row.status) && new Date(row.scheduledDate) < new Date();

  // Available extinguishers for dropdown (non-expired)
  const availableExt = extList.filter(e => e.status !== 'expired');
  const dropdownExts = availableExt.length > 0 ? availableExt : extList;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Inspections</h1>
          <p className="page-subtitle">
            {can(['user']) ? 'Schedule and track inspections for your extinguisher' : 'Manage and confirm inspection schedules'}
          </p>
        </div>
        <button onClick={openCreate} className="btn-crimson shrink-0">+ Schedule Inspection</button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-3">
          <select className="input w-48" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}>
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input w-36" value={filters.limit} onChange={e => setFilters(f => ({ ...f, limit: e.target.value, page: 1 }))}>
            {[10, 20, 50].map(n => <option key={n} value={n}>{n} / page</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="table-head">
              <tr>
                {['Extinguisher', 'Scheduled By', 'Inspector', 'Date', 'Time', 'Status', 'Notes', 'Actions'].map(h => (
                  <th key={h} className="table-head-cell">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-14 text-center">
                  <div className="flex justify-center"><div className="w-6 h-6 border-4 border-crimson-200 border-t-crimson-700 rounded-full animate-spin" /></div>
                </td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={8} className="py-14 text-center text-gray-400 text-sm">No inspections found</td></tr>
              ) : data.map(row => (
                <tr key={row.id} className={`table-row ${isOverdue(row) ? 'bg-red-50' : ''}`}>
                  <td className="table-cell">
                    <div>
                      <p className="font-semibold text-sm font-mono text-gray-800">
                        {extList.find(e => e.id === row.extinguisherId)?.serialNumber || row.extinguisherId.slice(0,8)+'…'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {extList.find(e => e.id === row.extinguisherId)?.location || ''}
                      </p>
                    </div>
                  </td>
                  <td className="table-cell text-sm text-gray-700">{resolveUser(row.scheduledById)}</td>
                  <td className="table-cell text-sm text-gray-500">
                    {row.inspectorId ? resolveUser(row.inspectorId) : <span className="text-gray-300">Unassigned</span>}
                  </td>
                  <td className="table-cell">
                    <div>
                      <p className="text-sm">{row.scheduledDate?.split('T')[0]}</p>
                      {isOverdue(row) && <p className="text-[10px] text-red-600 font-semibold">OVERDUE</p>}
                    </div>
                  </td>
                  <td className="table-cell text-sm">{row.scheduledTime}</td>
                  <td className="table-cell"><Badge value={row.status} /></td>
                  <td className="table-cell text-xs text-gray-500 max-w-[140px] truncate">{row.notes || '—'}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1">
                      {canManage && <button onClick={() => openEdit(row)} className="btn-outline btn-sm">Edit</button>}
                      {isAdmin && <button onClick={() => { setSelected(row); setModal('delete'); }} className="btn-danger btn-sm">Del</button>}
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

      {/* Create / Edit Modal */}
      <Modal
        open={modal === 'create' || modal === 'edit'}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'Schedule Inspection' : 'Update Inspection'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Extinguisher dropdown */}
          <div>
            <label className="label">Fire Extinguisher</label>
            {modal === 'create' ? (
              <select
                className="input"
                value={form.extinguisherId}
                onChange={set('extinguisherId')}
                required
                disabled={!canManage && availableExt.length === 1}
              >
                <option value="">
                  {loadingEntities && extList.length === 0
                    ? 'Loading extinguishers...'
                    : extList.length === 0
                      ? 'No extinguishers available'
                      : 'Select an extinguisher...'}
                </option>
                {dropdownExts.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.serialNumber} — {e.location} ({e.type})
                  </option>
                ))}
              </select>
            ) : (
              <div className="input bg-gray-50 text-gray-600 cursor-not-allowed">
                {resolveExt(form.extinguisherId)}
              </div>
            )}
              {availableExt.length === 0 && extList.length > 0 && (
                <p className="text-xs text-gray-400 mt-1">Showing all extinguishers because none are currently active.</p>
              )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Inspection Date</label>
              <input className="input" type="date" value={form.scheduledDate} onChange={set('scheduledDate')} required min={new Date().toISOString().split('T')[0]} />
            </div>
            <div>
              <label className="label">Time (HH:MM)</label>
              <input className="input" type="time" value={form.scheduledTime} onChange={set('scheduledTime')} required />
            </div>
          </div>

          {/* Status update (admin/inspector edit only) */}
          {modal === 'edit' && canManage && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status || 'pending'} onChange={set('status')}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Assign Inspector</label>
                <select className="input" value={form.inspectorId || ''} onChange={set('inspectorId')}>
                  <option value="">No inspector assigned</option>
                  {Object.entries(userMap)
                    .filter(([id]) => {
                      const u = user; // simplify - show all active users
                      return true;
                    })
                    .map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="label">Notes (optional)</label>
            <textarea
              className="input resize-none"
              rows={3}
              value={form.notes}
              onChange={set('notes')}
              placeholder="Describe what should be inspected, any concerns..."
            />
          </div>

          <div>
            <label className="label">Notify Personnel</label>
            <input
              className="input"
              value={form.notifyPersonnel}
              onChange={set('notifyPersonnel')}
              placeholder="Email addresses (comma-separated) — they will receive a notification"
            />
            <p className="text-xs text-gray-400 mt-1">Optional. Inspectors are automatically notified in-app.</p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-crimson">
              {submitting ? 'Saving...' : modal === 'create' ? 'Schedule Inspection' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* View detail modal */}
      <Modal open={modal === 'view'} onClose={() => setModal(null)} title="Inspection Details">
        {selected && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div><dt className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Extinguisher</dt><dd className="font-medium mt-0.5">{resolveExt(selected.extinguisherId)}</dd></div>
            <div><dt className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Scheduled By</dt><dd className="font-medium mt-0.5">{resolveUser(selected.scheduledById)}</dd></div>
            <div><dt className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Inspector</dt><dd className="font-medium mt-0.5">{selected.inspectorId ? resolveUser(selected.inspectorId) : '—'}</dd></div>
            <div><dt className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Status</dt><dd className="mt-0.5"><Badge value={selected.status} /></dd></div>
            <div><dt className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Date</dt><dd className="font-medium mt-0.5">{selected.scheduledDate?.split('T')[0]}</dd></div>
            <div><dt className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Time</dt><dd className="font-medium mt-0.5">{selected.scheduledTime}</dd></div>
            <div className="col-span-2"><dt className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Notes</dt><dd className="mt-1 bg-cream-100 rounded-lg px-3 py-2 text-gray-600">{selected.notes || '—'}</dd></div>
          </dl>
        )}
      </Modal>

      {/* Delete Modal */}
      <Modal open={modal === 'delete'} onClose={() => setModal(null)} title="Delete Inspection" size="sm">
        <p className="text-sm text-gray-600">
          Delete inspection for <strong>{resolveExt(selected?.extinguisherId)}</strong> on <strong>{selected?.scheduledDate?.split('T')[0]}</strong>? This cannot be undone.
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={handleDelete} disabled={submitting} className="btn-danger">{submitting ? 'Deleting...' : 'Delete'}</button>
        </div>
      </Modal>
    </div>
  );
}
