const MAP = {
  active:      'badge-active',
  expired:     'badge-expired',
  inactive:    'badge-inactive',
  maintenance: 'badge-maintenance',
  scheduled:   'badge-scheduled',
  completed:   'badge-completed',
  cancelled:   'badge-cancelled',
  admin:       'badge-admin',
  inspector:   'badge-inspector',
  user:        'badge-user',
};

export default function Badge({ value }) {
  const cls = MAP[value?.toLowerCase()] || 'badge bg-gray-100 text-gray-600';
  return <span className={cls}>{value}</span>;
}
