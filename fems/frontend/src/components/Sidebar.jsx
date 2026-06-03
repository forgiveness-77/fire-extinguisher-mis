import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const NAV = [
  { to: '/dashboard',      label: 'Dashboard',      icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', roles: ['admin','inspector','user'] },
  { to: '/extinguishers',  label: 'Extinguishers',  icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z', roles: ['admin','inspector','user'] },
  { to: '/inspections',    label: 'Inspections',    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', roles: ['admin','inspector','user'] },
  { to: '/maintenance',    label: 'Maintenance',    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', roles: ['admin','inspector'] },
  { to: '/reports',        label: 'Reports',        icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', roles: ['admin','inspector','user'] },
  { to: '/users',          label: 'User Management',icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', roles: ['admin'] },
  { to: '/profile',        label: 'My Profile',     icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', roles: ['admin','inspector','user'] },
];

export default function Sidebar({ onClose }) {
  const { user, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = () => {
    signOut();
    toast.success('Signed out');
    navigate('/login');
  };

  const visible = NAV.filter(n => n.roles.includes(user?.role));

  return (
    <aside className="flex flex-col h-full bg-crimson-700 text-white w-64 shrink-0">
      {/* Brand */}
      <div className="px-5 py-6 border-b border-white/10">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-1">TZW LTD</p>
        <h1 className="text-lg font-bold leading-tight">Fire Extinguisher<br />Management</h1>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visible.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
            }
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
              {icon.split(' M').map((d, i) => (
                <path key={i} strokeLinecap="round" strokeLinejoin="round" d={i === 0 ? d : 'M' + d} />
              ))}
            </svg>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer user */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold shrink-0">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-white/50 capitalize">{user?.role}</p>
          </div>
        </div>
        <button onClick={handleSignOut} className="w-full text-left text-xs text-white/60 hover:text-white transition-colors py-1 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  );
}
