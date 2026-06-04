import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import toast from 'react-hot-toast';

// Icon paths per nav item
const ICONS = {
  dashboard:    'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  extinguisher: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
  inspections:  'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  maintenance:  'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  reports:      'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  users:        'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  profile:      'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
};

// Nav per role
const NAV = {
  admin: [
    { to: '/dashboard',     label: 'Dashboard',      icon: ICONS.dashboard },
    { to: '/extinguishers', label: 'Extinguishers',  icon: ICONS.extinguisher },
    { to: '/inspections',   label: 'Inspections',    icon: ICONS.inspections },
    { to: '/maintenance',   label: 'Maintenance',    icon: ICONS.maintenance },
    { to: '/reports',       label: 'Reports',        icon: ICONS.reports },
    { to: '/users',         label: 'User Management',icon: ICONS.users },
    { to: '/profile',       label: 'My Profile',     icon: ICONS.profile },
  ],
  inspector: [
    { to: '/dashboard',   label: 'Dashboard',         icon: ICONS.dashboard },
    { to: '/maintenance', label: 'Log Maintenance',   icon: ICONS.maintenance },
    { to: '/inspections', label: 'Inspections',       icon: ICONS.inspections },
    { to: '/reports',     label: 'Reports',           icon: ICONS.reports },
    { to: '/profile',     label: 'My Profile',        icon: ICONS.profile },
  ],
  user: [
    { to: '/dashboard',      label: 'Dashboard',           icon: ICONS.dashboard },
    { to: '/my-extinguisher',label: 'My Extinguisher',     icon: ICONS.extinguisher },
    { to: '/inspections',    label: 'Schedule Inspection', icon: ICONS.inspections },
    { to: '/profile',        label: 'My Profile',          icon: ICONS.profile },
  ],
};

function Icon({ path }) {
  const parts = path.split(' M').map((p, i) => i === 0 ? p : 'M' + p);
  return (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
      {parts.map((d, i) => <path key={i} strokeLinecap="round" strokeLinejoin="round" d={d} />)}
    </svg>
  );
}

export default function Sidebar({ onClose }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const navItems = NAV[user?.role] || NAV.user;

  const handleSignOut = () => {
    signOut();
    toast.success('Signed out');
    navigate('/login');
  };

  const roleLabel = { admin: 'Administrator', inspector: 'Inspector', user: 'User' }[user?.role] || user?.role;

  return (
    <aside className="flex flex-col h-full bg-crimson-700 text-white w-64 shrink-0 select-none">
      {/* Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-white/10">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-1">TZW LTD</p>
        <h1 className="text-base font-bold leading-snug">Fire Extinguisher<br />Management System</h1>
      </div>

      {/* Role chip */}
      <div className="px-5 py-2.5">
        <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-white/15 uppercase tracking-wider">
          {roleLabel}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
              ${isActive ? 'bg-white/20 text-white' : 'text-white/75 hover:text-white hover:bg-white/10'}`
            }
          >
            <Icon path={icon} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom: notifications + user */}
      <div className="px-4 py-4 border-t border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <NotificationBell />
          <span className="text-xs text-white/50">Notifications</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-sm font-bold shrink-0">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate leading-tight">{user?.firstName} {user?.lastName}</p>
            <p className="text-[11px] text-white/50 truncate">{user?.email}</p>
          </div>
          <button onClick={handleSignOut} title="Sign out" className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
