import React, { useContext, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Gavel, Mail, Lock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { AppContext } from '../App';
import { signIn, signUp, sendPasswordResetEmail, isAuthAvailable } from '../services/authStore';

type Mode = 'signin' | 'signup' | 'forgot';

const Login: React.FC = () => {
  const { authStatus } = useContext(AppContext);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || '/app';

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === 'authenticated') navigate(from, { replace: true });
  }, [authStatus, from, navigate]);

  const resetMessages = () => {
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setBusy(true);

    try {
      if (mode === 'forgot') {
        const result = await sendPasswordResetEmail(email);
        if (!result.ok) setError(result.error ?? 'Could not send reset email.');
        else setNotice('Check your inbox for a link to reset your password.');
        return;
      }

      if (mode === 'signup') {
        const result = await signUp(email, password);
        if (!result.ok) {
          setError(result.error ?? 'Could not create your account.');
        } else if (result.needsEmailConfirmation) {
          setNotice('Account created — check your email to confirm before signing in.');
        } else {
          navigate(from, { replace: true });
        }
        return;
      }

      const result = await signIn(email, password);
      if (!result.ok) setError(result.error ?? 'Could not sign in.');
      else navigate(from, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  if (!isAuthAvailable()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617] text-slate-200 px-4">
        <div className="max-w-md text-center">
          <AlertCircle className="mx-auto mb-3 text-amber-400" size={32} />
          <p>Authentication isn't configured for this deployment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020617] px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Gavel size={28} className="text-gold-500" />
          <span className="text-2xl font-serif font-bold text-white">CaseBuddy</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl">
          <h1 className="text-xl font-semibold text-white mb-1">
            {mode === 'signin' && 'Sign in'}
            {mode === 'signup' && 'Create your firm account'}
            {mode === 'forgot' && 'Reset your password'}
          </h1>
          <p className="text-sm text-slate-400 mb-6">
            {mode === 'signin' && 'Welcome back. Your cases are waiting.'}
            {mode === 'signup' && 'Set up secure access to your firm’s workspace.'}
            {mode === 'forgot' && 'We’ll email you a link to choose a new one.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@firm.com"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                />
              </div>
            </div>

            {mode !== 'forgot' && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
                  />
                </div>
                {mode === 'signup' && (
                  <p className="text-[11px] text-slate-500 mt-1.5">At least 8 characters.</p>
                )}
              </div>
            )}

            {mode === 'signin' && (
              <button
                type="button"
                onClick={() => { resetMessages(); setMode('forgot'); }}
                className="text-xs text-slate-400 hover:text-gold-400 transition-colors"
              >
                Forgot your password?
              </button>
            )}

            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-red-950/40 border border-red-500/30 rounded-lg text-sm text-red-200">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {notice && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-green-950/30 border border-green-500/30 rounded-lg text-sm text-green-200">
                <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                <span>{notice}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-gold-500 hover:bg-gold-400 disabled:opacity-60 text-slate-950 font-bold py-2.5 rounded-lg transition-colors"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              {mode === 'signin' && 'Sign in'}
              {mode === 'signup' && 'Create account'}
              {mode === 'forgot' && 'Send reset link'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-400">
            {mode === 'signin' && (
              <button onClick={() => { resetMessages(); setMode('signup'); }} className="hover:text-gold-400 transition-colors">
                Need an account? <span className="text-gold-400 font-medium">Create one</span>
              </button>
            )}
            {mode === 'signup' && (
              <button onClick={() => { resetMessages(); setMode('signin'); }} className="hover:text-gold-400 transition-colors">
                Already have an account? <span className="text-gold-400 font-medium">Sign in</span>
              </button>
            )}
            {mode === 'forgot' && (
              <button onClick={() => { resetMessages(); setMode('signin'); }} className="hover:text-gold-400 transition-colors">
                Back to <span className="text-gold-400 font-medium">sign in</span>
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          <Link to="/" className="hover:text-slate-400 transition-colors">&larr; Back to casebuddy.ai</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
