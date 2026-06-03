import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getMaintenanceLogs, createMaintenanceLog, updateMaintenanceLog, deleteMaintenanceLog } from '../api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';

const BLANK = { extinguisherId: '', actionsTaken: '', dateOfAction: '', conditionsNoted: '' };

export default function Maintenance() {
  const { isAdmin } = useAuth();

  const [data, setData]           = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [filters, setFilters]     = useState({ extinguisherId: '', from: '', to: '', page: 1, limit: 10 });

  const [modal, setModal]         = useState(null);
  const [selected, setSelected]   = useState(null);
  const [form, setForm]           = useState(BLANK);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
      const res = await getMaintenanceLogs(params);
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
      const payload = { ...form, extinguisherId: Number(form.extinguisherId) };
      if (modal === 'create') {
        await createMaintenanceLog(payload);
        toast.success('Maintenance log created');
      } else {
        await updateMaintenanceLog(selected.id, payload);
        toast.success('Log updated');
      }
      setModal(null);
      load();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await deleteMaintenanceLog(selected.id);
      toast.success('Log deleted');
      setModal(null);
      load();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const openCreate = () => { setForm(BLANK); setModal('create'); };
  const openEdit   = (row) => { setSelected(row); setForm({ extinguisherId: row.extinguisherId, actionsTaken: row.actionsTaken, dateOfAction: row.dateOfAction?.split('T')[0], conditionsNoted: row.conditionsNoted }); setModal('edit'); };
  const openView   = (row) => { setSelected(row); setModal('view'); };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Maintenance Logs</h1>
          <p className="page-subtitle">Record and review maintenance activities</p>
        </div>
        <button onClick={openCreate} className="btn-crimson shrink-0">+ Log Activity</button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <input className="input" type="number" min={1} placeholder="Extinguisher ID" value={filters.extinguisherId} onChange={e => setFilters(f => ({ ...f, extinguisherId: e.target.value, page: 1 }))} />
          <input className="input" type="date" placeholder="From date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value, page: 1 }))} />
          <input className="input" type="date" placeholder="To date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value, page: 1 }))} />
          <select className="input" value={filters.limit} onChange={e => setFilters(f => ({ ...f, limit: e.target.value, page: 1 }))}>
            {[10, 20, 50].map(n => <option key={n} value={n}>{n} / page</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="table-head">
              <tr>
                {['ID', 'Extinguisher', 'Date', 'Actions Taken', 'Conditions Noted', 'Actions'].map(h => (
                  <th key={h} className="table-head-cell">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-16 text-center"><div className="flex justify-center"><div className="w-6 h-6 border-4 border-crimson-200 border-t-crimson-700 rounded-full animate-spin" /></div></td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={6} className="py-16 text-center text-gray-400 text-sm">No maintenance logs found</td></tr>
              ) : data.map(row => (
                <tr key={row.id} className="table-row">
                  <td className="table-cell text-xs text-gray-500">#{row.id}</td>
                  <td className="table-cell font-medium">#{row.extinguisherId}</td>
                  <td className="table-cell text-xs">{row.dateOfAction?.split('T')[0]}</td>
                  <td className="table-cell text-sm max-w-[200px]">
                    <span className="block truncate" title={row.actionsTaken}>{row.actionsTaken}</span>
                  </td>
                  <td className="table-cell text-sm max-w-[200px]">
                    <span className="block truncate" title={row.conditionsNoted}>{row.conditionsNoted}</span>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openView(row)} className="btn-ghost btn-sm">View</button>
                      <button onClick={() => openEdit(row)} className="btn-outline btn-sm">Edit</button>
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
        title={modal === 'create' ? 'Log Maintenance Activity' : 'Edit Maintenance Log'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Extinguisher ID</label>
              <input className="input" type="number" min={1} value={form.extinguisherId} onChange={set('extinguisherId')} required placeholder="e.g. 1" />
            </div>
            <div>
              <label className="label">Date of Action</label>
              <input className="input" type="date" value={form.dateOfAction} onChange={set('dateOfAction')} required max={new Date().toISOString().split('T')[0]} />
            </div>
          </div>
          <div>
            <label className="label">Actions Taken</label>
            <textarea className="input resize-none" rows={3} value={form.actionsTaken} onChange={set('actionsTaken')} required placeholder="Describe the maintenance actions performed..." />
          </div>
          <div>
            <label className="label">Conditions Noted</label>
            <textarea className="input resize-none" rows={3} value={form.conditionsNoted} onChange={set('conditionsNoted')} required placeholder="Describe the condition of the extinguisher..." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-crimson">
              {submitting ? 'Saving...' : modal === 'create' ? 'Log Activity' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Modal */}
      <Modal open={modal === 'view'} onClose={() => setModal(null)} title="Maintenance Log Details">
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Log ID</p><p className="font-semibold mt-0.5">#{selected.id}</p></div>
              <div><p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Extinguisher</p><p className="font-semibold mt-0.5">#{selected.extinguisherId}</p></div>
              <div><p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Date</p><p className="font-semibold mt-0.5">{selected.dateOfAction?.split('T')[0]}</p></div>
              <div><p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Inspector ID</p><p className="font-semibold mt-0.5">#{selected.inspectorId}</p></div>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Actions Taken</p>
              <p className="bg-cream-100 rounded-lg px-3 py-2 text-gray-700 leading-relaxed">{selected.actionsTaken}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Conditions Noted</p>
              <p className="bg-cream-100 rounded-lg px-3 py-2 text-gray-700 leading-relaxed">{selected.conditionsNoted}</p>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete */}
      <Modal open={modal === 'delete'} onClose={() => setModal(null)} title="Delete Log" size="sm">
        <p className="text-sm text-gray-600">Delete maintenance log <strong>#{selected?.id}</strong>? This cannot be undone.</p>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={handleDelete} disabled={submitting} className="btn-danger">{submitting ? 'Deleting...' : 'Delete'}</button>
        </div>
      </Modal>
    </div>
  );
}
