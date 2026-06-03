import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { recoverPassword } from '../api';

export default function RecoverPassword() {
  const [email, setEmail]   = useState('');
  const [sent, setSent]     = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await recoverPassword({ email });
      setSent(true);
      toast.success('Check your email for the reset token');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream-100 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="w-12 h-12 rounded-xl bg-crimson-100 flex items-center justify-center mb-5">
          <svg className="w-6 h-6 text-crimson-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Recover password</h2>
        <p className="text-sm text-gray-500 mb-6">Enter your email and we'll send a reset token.</p>

        {sent ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-600 mb-4">If that email is registered, a reset token has been sent. Check the server console if email is not configured.</p>
            <Link to="/login" className="btn-crimson">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <input className="input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <button type="submit" disabled={loading} className="btn-crimson w-full">
              {loading ? 'Sending...' : 'Send reset token'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-gray-500 mt-5">
          <Link to="/login" className="text-crimson-700 hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
