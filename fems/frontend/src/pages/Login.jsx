import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { login } from '../api';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { signIn } = useAuth();
  const navigate   = useNavigate();
  const [form, setForm]     = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const set = (k) => (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setError(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    // Read directly from DOM elements so browser autofill (which skips React's
    // onChange) is always picked up. Falls back to React state if elements absent.
    const email    = (e.target.elements['email']?.value    || form.email).trim();
    const password =  e.target.elements['password']?.value || form.password;
    try {
      const res = await login({ email, password });
      signIn(res.data.token, res.data.user);
      toast.success(`Welcome back, ${res.data.user.firstName}`);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-cream-100">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-crimson-700 flex-col items-center justify-center px-12 text-white">
        <div className="max-w-sm text-center">
          <div className="w-20 h-20 rounded-2xl bg-white/15 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold mb-3">TZW LTD</h2>
          <p className="text-white/70 text-sm leading-relaxed">
            Fire Extinguisher Management System — track, inspect, and maintain your safety equipment with confidence.
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 text-center">
            <h1 className="text-2xl font-bold text-crimson-700">TZW LTD</h1>
            <p className="text-sm text-gray-500 mt-1">Fire Extinguisher Management</p>
          </div>

          <h2 className="text-2xl font-bold text-gray-800 mb-1">Sign in</h2>
          <p className="text-sm text-gray-500 mb-7">Enter your credentials to continue</p>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <input className="input" type="email" name="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={set('email')} required />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" name="password" autoComplete="current-password" placeholder="••••••••" value={form.password} onChange={set('password')} required />
            </div>
            <button type="submit" disabled={loading} className="btn-crimson w-full mt-2">
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Signing in...</>
                : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            No account?{' '}
            <Link to="/register" className="text-crimson-700 font-medium hover:underline">Register</Link>
          </p>
          <p className="text-center text-sm text-gray-500 mt-2">
            <Link to="/recover-password" className="text-crimson-700 hover:underline">Forgot password?</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
