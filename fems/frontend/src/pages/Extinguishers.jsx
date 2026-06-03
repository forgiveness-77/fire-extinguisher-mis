import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getExtinguishers, createExtinguisher, updateExtinguisher, deleteExtinguisher } from '../api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import Pagination from '../components/Pagination';
import { PageSpinner } from '../components/Spinner';

const TYPES    = ['Water', 'CO2', 'Foam', 'DryChemical'];
const STATUSES = ['active', 'inactive', 'expired', 'maintenance'];
const BLANK    = { serialNumber: '', location: '', type: 'CO2', size: '', installationDate: '', expiryDate: '', status: 'active' };

export default function Extinguishers() {
  const { can } = useAuth();
  const canWrite = can(['admin', 'inspector']);

  const [data, setData]       = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', type: '', search: '', page: 1, limit: 10 });

  const [modal, setModal]     = useState(null); // null | 'create' | 'edit' | 'delete' | 'view'
  const [selected, setSelected] = useState(null);
  const [form, setForm]       = useState(BLANK);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
      const res = await getExtinguishers(params);
      setData(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (k) => (e) => setFilters(f => ({ ...f, [k]: e.target.value, page: 1 }));
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const openCreate = () => { setForm(BLANK); setModal('create'); };
  const openEdit   = (row) => { setSelected(row); setForm({ ...row, installationDate: row.installationDate?.split('T')[0], expiryDate: row.expiryDate?.split('T')[0] }); setModal('edit'); };
  const openDelete = (row) => { setSelected(row); setModal('delete'); };
  const openView   = (row) => { setSelected(row); setModal('view'); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (modal === 'create') {
        await createExtinguisher(form);
        toast.success('Extinguisher registered');
      } else {
        await updateExtinguisher(selected.id, form);
        toast.success('Extinguisher updated');
      }
      setModal(null);
      load();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await deleteExtinguisher(selected.id);
      toast.success('Extinguisher deleted');
      setModal(null);
      load();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Extinguishers</h1>
          <p className="page-subtitle">Inventory of all registered fire extinguishers</p>
        </div>
        {canWrite && <button onClick={openCreate} className="btn-crimson shrink-0">+ Register Extinguisher</button>}
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <input className="input" placeholder="Search serial / location..." value={filters.search} onChange={setFilter('search')} />
          <select className="input" value={filters.status} onChange={setFilter('status')}>
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="input" value={filters.type} onChange={setFilter('type')}>
            <option value="">All types</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="input" value={filters.limit} onChange={e => setFilters(f => ({ ...f, limit: e.target.value, page: 1 }))}>
            {[10, 20, 50].map(n => <option key={n} value={n}>{n} per page</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="table-head">
              <tr>
                {['Serial No.', 'Location', 'Type', 'Size (lbs)', 'Installed', 'Expires', 'Status', 'Actions'].map(h => (
                  <th key={h} className="table-head-cell">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-16 text-center"><div className="flex justify-center"><div className="w-6 h-6 border-4 border-crimson-200 border-t-crimson-700 rounded-full animate-spin" /></div></td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={8} className="py-16 text-center text-gray-400 text-sm">No extinguishers found</td></tr>
              ) : data.map(row => (
                <tr key={row.id} className="table-row">
                  <td className="table-cell font-mono text-xs font-semibold text-gray-800">{row.serialNumber}</td>
                  <td className="table-cell">{row.location}</td>
                  <td className="table-cell">{row.type}</td>
                  <td className="table-cell">{row.size}</td>
                  <td className="table-cell text-xs">{row.installationDate?.split('T')[0]}</td>
                  <td className="table-cell text-xs">{row.expiryDate?.split('T')[0]}</td>
                  <td className="table-cell"><Badge value={row.status} /></td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openView(row)} className="btn-ghost btn-sm">View</button>
                      {canWrite && <button onClick={() => openEdit(row)} className="btn-outline btn-sm">Edit</button>}
                      {can(['admin']) && <button onClick={() => openDelete(row)} className="btn-danger btn-sm">Delete</button>}
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
        title={modal === 'create' ? 'Register Extinguisher' : 'Edit Extinguisher'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Serial Number</label>
              <input className="input" value={form.serialNumber} onChange={set('serialNumber')} required placeholder="FE-001" disabled={modal === 'edit'} />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.type} onChange={set('type')}>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" value={form.location} onChange={set('location')} required placeholder="Floor 1 - Reception" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Size (lbs)</label>
              <input className="input" type="number" step="0.5" min="0.5" value={form.size} onChange={set('size')} required placeholder="5" />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={set('status')}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Installation Date</label>
              <input className="input" type="date" value={form.installationDate} onChange={set('installationDate')} required />
            </div>
            <div>
              <label className="label">Expiry Date</label>
              <input className="input" type="date" value={form.expiryDate} onChange={set('expiryDate')} required />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-crimson">
              {submitting ? 'Saving...' : modal === 'create' ? 'Register' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Modal */}
      <Modal open={modal === 'view'} onClose={() => setModal(null)} title="Extinguisher Details">
        {selected && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            {[
              ['Serial Number', selected.serialNumber],
              ['Location', selected.location],
              ['Type', selected.type],
              ['Size', `${selected.size} lbs`],
              ['Status', <Badge key="s" value={selected.status} />],
              ['Installation Date', selected.installationDate?.split('T')[0]],
              ['Expiry Date', selected.expiryDate?.split('T')[0]],
              ['Registered', new Date(selected.createdAt).toLocaleDateString()],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-gray-400 font-medium text-xs uppercase tracking-wide">{k}</dt>
                <dd className="text-gray-800 font-medium mt-0.5">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Modal>

      {/* Delete Modal */}
      <Modal open={modal === 'delete'} onClose={() => setModal(null)} title="Delete Extinguisher" size="sm">
        <p className="text-sm text-gray-600">
          Are you sure you want to delete extinguisher <strong>{selected?.serialNumber}</strong>? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={handleDelete} disabled={submitting} className="btn-danger">
            {submitting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
