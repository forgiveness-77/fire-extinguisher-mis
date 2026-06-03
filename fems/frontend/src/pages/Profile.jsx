import { useState } from 'react';
import toast from 'react-hot-toast';
import { updateProfile, changePassword } from '../api';
import { useAuth } from '../context/AuthContext';
import Badge from '../components/Badge';

export default function Profile() {
  const { user, signIn } = useAuth();

  const [profileForm, setProfileForm] = useState({ firstName: user?.firstName || '', lastName: user?.lastName || '' });
  const [pwForm, setPwForm]  = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPw, setSavingPw]           = useState(false);

  const handleProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await updateProfile(profileForm);
      const updated = { ...user, ...res.data.user };
      signIn(localStorage.getItem('token'), updated);
      toast.success('Profile updated');
    } catch (err) { toast.error(err.message); }
    finally { setSavingProfile(false); }
  };

  const handlePassword = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirm) { toast.error('Passwords do not match'); return; }
    setSavingPw(true);
    try {
      await changePassword({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      toast.success('Password changed successfully');
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) { toast.error(err.message); }
    finally { setSavingPw(false); }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="page-title">My Profile</h1>
        <p className="page-subtitle">Manage your account details and security</p>
      </div>

      {/* Identity card */}
      <div className="card flex items-center gap-5">
        <div className="w-16 h-16 rounded-2xl bg-crimson-700 text-white flex items-center justify-center text-2xl font-bold shrink-0">
          {user?.firstName?.[0]}{user?.lastName?.[0]}
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-800">{user?.firstName} {user?.lastName}</h2>
          <p className="text-sm text-gray-500">{user?.email}</p>
          <div className="mt-1"><Badge value={user?.role} /></div>
        </div>
      </div>

      {/* Edit profile */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4">Edit Profile</h3>
        <form onSubmit={handleProfile} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">First Name</label>
              <input className="input" value={profileForm.firstName} onChange={e => setProfileForm(f => ({ ...f, firstName: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input className="input" value={profileForm.lastName} onChange={e => setProfileForm(f => ({ ...f, lastName: e.target.value }))} required />
            </div>
          </div>
          <div>
            <label className="label">Email address</label>
            <input className="input bg-gray-50" value={user?.email} disabled />
            <p className="text-xs text-gray-400 mt-1">Email cannot be changed. Contact an admin if needed.</p>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={savingProfile} className="btn-crimson">
              {savingProfile ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Change password */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4">Change Password</h3>
        <form onSubmit={handlePassword} className="space-y-4">
          <div>
            <label className="label">Current Password</label>
            <input className="input" type="password" placeholder="••••••••" value={pwForm.currentPassword} onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">New Password</label>
              <input className="input" type="password" placeholder="Min. 6 characters" value={pwForm.newPassword} onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))} required minLength={6} />
            </div>
            <div>
              <label className="label">Confirm Password</label>
              <input className={`input ${pwForm.confirm && pwForm.confirm !== pwForm.newPassword ? 'input-error' : ''}`} type="password" placeholder="Repeat new password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} required />
              {pwForm.confirm && pwForm.confirm !== pwForm.newPassword && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={savingPw} className="btn-crimson">
              {savingPw ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
