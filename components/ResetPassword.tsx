import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gavel, Lock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { updatePassword } from '../services/authStore';

// Reached via the link in the password-reset email. Supabase's client
// (detectSessionInUrl: true) exchanges the recovery token in the URL for a
// session automatically before this component's submit handler ever runs.
const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const result = await updatePassword(password);
      if (!result.ok) setError(result.error ?? 'Could not update your password.');
      else setDone(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020617] px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Gavel size={28} className="text-gold-500" />
          <span className="text-2xl font-serif font-bold text-white">CaseBuddy</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl">
          {done ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto mb-3 text-green-400" size={32} />
              <h1 className="text-lg font-semibold text-white mb-2">Password updated</h1>
              <p className="text-sm text-slate-400 mb-5">You're all set. Sign in with your new password.</p>
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="w-full bg-gold-500 hover:bg-gold-400 text-slate-950 font-bold py-2.5 rounded-lg transition-colors"
              >
                Go to sign in
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-white mb-1">Choose a new password</h1>
              <p className="text-sm text-slate-400 mb-6">This will replace your current password.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">New password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Confirm password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2 px-3 py-2.5 bg-red-950/40 border border-red-500/30 rounded-lg text-sm text-red-200">
                    <AlertCircle size={15} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 bg-gold-500 hover:bg-gold-400 disabled:opacity-60 text-slate-950 font-bold py-2.5 rounded-lg transition-colors"
                >
                  {busy && <Loader2 size={16} className="animate-spin" />}
                  Update password
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
