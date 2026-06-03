import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { register } from '../api';

const ROLES = ['user', 'inspector', 'admin'];

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', role: 'user' });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const set = (k) => (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setError(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await register(form);
      toast.success('Account created. Please sign in.');
      navigate('/login');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-cream-100">
      <div className="hidden lg:flex lg:w-1/2 bg-crimson-700 flex-col items-center justify-center px-12 text-white">
        <div className="max-w-sm text-center">
          <div className="w-20 h-20 rounded-2xl bg-white/15 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold mb-3">Create Account</h2>
          <p className="text-white/70 text-sm leading-relaxed">
            Join TZW LTD's Fire Extinguisher Management System. Select your role and get started.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold text-gray-800 mb-1">Create account</h2>
          <p className="text-sm text-gray-500 mb-7">Fill in your details below</p>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">First name</label>
                <input className="input" placeholder="John" value={form.firstName} onChange={set('firstName')} required />
              </div>
              <div>
                <label className="label">Last name</label>
                <input className="input" placeholder="Doe" value={form.lastName} onChange={set('lastName')} required />
              </div>
            </div>
            <div>
              <label className="label">Email address</label>
              <input className="input" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} required />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" placeholder="Min. 6 characters" value={form.password} onChange={set('password')} required minLength={6} />
            </div>
            <div>
              <label className="label">Role</label>
              <select className="input" value={form.role} onChange={set('role')}>
                {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </div>
            <button type="submit" disabled={loading} className="btn-crimson w-full mt-2">
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Creating...</>
                : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-crimson-700 font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
