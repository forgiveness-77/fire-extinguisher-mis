import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getInspections, createInspection, updateInspection, deleteInspection } from '../api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import Pagination from '../components/Pagination';

const STATUSES = ['scheduled', 'completed', 'cancelled'];
const BLANK    = { extinguisherId: '', scheduledDate: '', scheduledTime: '09:00', notes: '', notifyPersonnel: '' };

export default function Inspections() {
  const { can, isAdmin } = useAuth();
  const canWrite = can(['admin', 'inspector']);

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
      const res = await getInspections(params);
      setData(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        extinguisherId: Number(form.extinguisherId),
        notifyPersonnel: form.notifyPersonnel
          ? form.notifyPersonnel.split(',').map(s => s.trim()).filter(Boolean)
          : [],
      };
      if (modal === 'create') {
        await createInspection(payload);
        toast.success('Inspection scheduled');
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

  const openCreate = () => { setForm(BLANK); setModal('create'); };
  const openEdit   = (row) => { setSelected(row); setForm({ extinguisherId: row.extinguisherId, scheduledDate: row.scheduledDate?.split('T')[0], scheduledTime: row.scheduledTime, notes: row.notes || '', notifyPersonnel: (row.notifyPersonnel || []).join(', ') }); setModal('edit'); };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Inspections</h1>
          <p className="page-subtitle">Schedule and track extinguisher inspections</p>
        </div>
        {canWrite && <button onClick={openCreate} className="btn-crimson shrink-0">+ Schedule Inspection</button>}
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
          <table className="w-full min-w-[650px]">
            <thead className="table-head">
              <tr>
                {['ID', 'Extinguisher', 'Inspector', 'Date', 'Time', 'Status', 'Notes', 'Actions'].map(h => (
                  <th key={h} className="table-head-cell">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-16 text-center"><div className="flex justify-center"><div className="w-6 h-6 border-4 border-crimson-200 border-t-crimson-700 rounded-full animate-spin" /></div></td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={8} className="py-16 text-center text-gray-400 text-sm">No inspections found</td></tr>
              ) : data.map(row => (
                <tr key={row.id} className="table-row">
                  <td className="table-cell text-xs text-gray-500">#{row.id}</td>
                  <td className="table-cell font-medium">#{row.extinguisherId}</td>
                  <td className="table-cell text-xs text-gray-500">#{row.inspectorId}</td>
                  <td className="table-cell text-xs">{row.scheduledDate?.split('T')[0]}</td>
                  <td className="table-cell text-xs">{row.scheduledTime}</td>
                  <td className="table-cell"><Badge value={row.status} /></td>
                  <td className="table-cell text-xs text-gray-500 max-w-[150px] truncate">{row.notes || '—'}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1">
                      {canWrite && <button onClick={() => openEdit(row)} className="btn-outline btn-sm">Edit</button>}
                      {isAdmin && <button onClick={() => { setSelected(row); setModal('delete'); }} className="btn-danger btn-sm">Delete</button>}
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
      <Modal open={modal === 'create' || modal === 'edit'} onClose={() => setModal(null)}
        title={modal === 'create' ? 'Schedule Inspection' : 'Edit Inspection'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Extinguisher ID</label>
            <input className="input" type="number" min={1} value={form.extinguisherId} onChange={set('extinguisherId')} required placeholder="e.g. 1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input className="input" type="date" value={form.scheduledDate} onChange={set('scheduledDate')} required />
            </div>
            <div>
              <label className="label">Time (HH:MM)</label>
              <input className="input" type="time" value={form.scheduledTime} onChange={set('scheduledTime')} required />
            </div>
          </div>
          {modal === 'edit' && (
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status || 'scheduled'} onChange={set('status')}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">Notes (optional)</label>
            <textarea className="input resize-none" rows={3} value={form.notes} onChange={set('notes')} placeholder="Any notes for this inspection..." />
          </div>
          <div>
            <label className="label">Notify Personnel (comma-separated emails)</label>
            <input className="input" value={form.notifyPersonnel} onChange={set('notifyPersonnel')} placeholder="person@example.com, other@example.com" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-crimson">
              {submitting ? 'Saving...' : modal === 'create' ? 'Schedule' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete */}
      <Modal open={modal === 'delete'} onClose={() => setModal(null)} title="Delete Inspection" size="sm">
        <p className="text-sm text-gray-600">Delete inspection <strong>#{selected?.id}</strong>? This cannot be undone.</p>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={handleDelete} disabled={submitting} className="btn-danger">{submitting ? 'Deleting...' : 'Delete'}</button>
        </div>
      </Modal>
    </div>
  );
}
