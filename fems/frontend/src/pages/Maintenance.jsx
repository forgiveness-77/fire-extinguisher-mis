import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getMaintenanceLogs, createMaintenanceLog, updateMaintenanceLog, deleteMaintenanceLog } from '../api';
import { useAuth } from '../context/AuthContext';
import { useEntityMaps } from '../hooks/useEntityMaps';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';

const BLANK = {
  extinguisherId: '',
  actionsTaken: '',
  dateOfAction: new Date().toISOString().split('T')[0],
  conditionsNoted: '',
  notes: '',
};

export default function Maintenance() {
  const { isAdmin } = useAuth();
  const { extList, resolveExt, resolveUser } = useEntityMaps(true);

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
      const r = await getMaintenanceLogs(params);
      setData(r.data.data);
      setPagination(r.data.pagination);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (modal === 'create') {
        await createMaintenanceLog(form);
        toast.success('Maintenance log created');
      } else {
        const { extinguisherId, ...updateFields } = form;
        await updateMaintenanceLog(selected.id, updateFields);
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
  const openEdit = (row) => {
    setSelected(row);
    setForm({
      extinguisherId: row.extinguisherId,
      actionsTaken: row.actionsTaken,
      dateOfAction: row.dateOfAction?.split('T')[0],
      conditionsNoted: row.conditionsNoted,
      notes: row.notes || '',
    });
    setModal('edit');
  };
  const openView = (row) => { setSelected(row); setModal('view'); };

  // Non-expired extinguishers for maintenance
  const maintExtList = extList.filter(e => e.status !== 'expired');

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Maintenance Logs</h1>
          <p className="page-subtitle">Record and track fire extinguisher maintenance activities</p>
        </div>
        <button onClick={openCreate} className="btn-crimson shrink-0">+ Log Activity</button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <select
            className="input"
            value={filters.extinguisherId}
            onChange={e => setFilters(f => ({ ...f, extinguisherId: e.target.value, page: 1 }))}
          >
            <option value="">All extinguishers</option>
            {extList.map(e => (
              <option key={e.id} value={e.id}>{e.serialNumber} — {e.location}</option>
            ))}
          </select>
          <input className="input" type="date" placeholder="From date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value, page: 1 }))} />
          <input className="input" type="date" placeholder="To date"   value={filters.to}   onChange={e => setFilters(f => ({ ...f, to: e.target.value, page: 1 }))} />
          <select className="input" value={filters.limit} onChange={e => setFilters(f => ({ ...f, limit: e.target.value, page: 1 }))}>
            {[10, 20, 50].map(n => <option key={n} value={n}>{n} / page</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="table-head">
              <tr>
                {['Extinguisher', 'Inspector', 'Date', 'Actions Taken', 'Conditions Noted', 'Notes', 'Actions'].map(h => (
                  <th key={h} className="table-head-cell">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-14 text-center">
                  <div className="flex justify-center"><div className="w-6 h-6 border-4 border-crimson-200 border-t-crimson-700 rounded-full animate-spin" /></div>
                </td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={7} className="py-14 text-center text-gray-400 text-sm">No maintenance logs found</td></tr>
              ) : data.map(row => (
                <tr key={row.id} className="table-row">
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
                  <td className="table-cell text-sm text-gray-700">{resolveUser(row.inspectorId)}</td>
                  <td className="table-cell text-sm">{row.dateOfAction?.split('T')[0]}</td>
                  <td className="table-cell text-sm max-w-[160px]">
                    <span className="block truncate" title={row.actionsTaken}>{row.actionsTaken}</span>
                  </td>
                  <td className="table-cell text-sm max-w-[160px]">
                    <span className="block truncate" title={row.conditionsNoted}>{row.conditionsNoted}</span>
                  </td>
                  <td className="table-cell text-xs text-gray-500 max-w-[120px] truncate">{row.notes || '—'}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openView(row)} className="btn-ghost btn-sm">View</button>
                      <button onClick={() => openEdit(row)} className="btn-outline btn-sm">Edit</button>
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
        title={modal === 'create' ? 'Log Maintenance Activity' : 'Edit Maintenance Log'}
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
              >
                <option value="">Select an extinguisher...</option>
                {maintExtList.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.serialNumber} — {e.location} ({e.type}, {e.status})
                  </option>
                ))}
              </select>
            ) : (
              <div className="input bg-gray-50 text-gray-600 cursor-not-allowed">
                {resolveExt(form.extinguisherId)}
              </div>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="label">Date of Maintenance</label>
            <input
              className="input"
              type="date"
              value={form.dateOfAction}
              onChange={set('dateOfAction')}
              required
              max={new Date().toISOString().split('T')[0]}
            />
          </div>

          {/* Actions taken */}
          <div>
            <label className="label">Actions Taken</label>
            <textarea
              className="input resize-none"
              rows={3}
              value={form.actionsTaken}
              onChange={set('actionsTaken')}
              required
              placeholder="Describe all maintenance actions performed (pressure check, pin replacement, recharge, etc.)"
            />
          </div>

          {/* Conditions noted */}
          <div>
            <label className="label">Conditions Noted</label>
            <textarea
              className="input resize-none"
              rows={3}
              value={form.conditionsNoted}
              onChange={set('conditionsNoted')}
              required
              placeholder="Describe the conditions observed during maintenance (e.g. pressure level, corrosion, seal integrity)"
            />
          </div>

          {/* Notes and recommendations */}
          <div>
            <label className="label">Notes and Recommendations <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              className="input resize-none"
              rows={2}
              value={form.notes}
              onChange={set('notes')}
              placeholder="Additional recommendations, follow-up actions required, or general notes"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-crimson">
              {submitting ? 'Saving...' : modal === 'create' ? 'Log Activity' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Modal */}
      <Modal open={modal === 'view'} onClose={() => setModal(null)} title="Maintenance Log Details" size="lg">
        {selected && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Extinguisher</p>
                <p className="font-semibold text-gray-800 font-mono">{extList.find(e => e.id === selected.extinguisherId)?.serialNumber || '—'}</p>
                <p className="text-xs text-gray-500">{extList.find(e => e.id === selected.extinguisherId)?.location || ''}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Inspector</p>
                <p className="font-medium text-gray-800">{resolveUser(selected.inspectorId)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Date of Maintenance</p>
                <p className="font-medium text-gray-800">{selected.dateOfAction?.split('T')[0]}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Logged</p>
                <p className="font-medium text-gray-800">{new Date(selected.createdAt).toLocaleDateString()}</p>
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Actions Taken</p>
              <div className="bg-cream-100 rounded-xl px-4 py-3 text-sm text-gray-700 leading-relaxed">
                {selected.actionsTaken}
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Conditions Noted</p>
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-gray-700 leading-relaxed">
                {selected.conditionsNoted || '—'}
              </div>
            </div>

            {selected.notes && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Notes and Recommendations</p>
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-gray-700 leading-relaxed">
                  {selected.notes}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Delete Modal */}
      <Modal open={modal === 'delete'} onClose={() => setModal(null)} title="Delete Maintenance Log" size="sm">
        <p className="text-sm text-gray-600">
          Delete maintenance log for <strong>{resolveExt(selected?.extinguisherId)}</strong>? This cannot be undone.
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={handleDelete} disabled={submitting} className="btn-danger">{submitting ? 'Deleting...' : 'Delete'}</button>
        </div>
      </Modal>
    </div>
  );
}
