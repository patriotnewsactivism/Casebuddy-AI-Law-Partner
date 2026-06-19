import React, { useState } from 'react';
import { Scale, Shield, CheckCircle, Phone, Mail, ArrowRight } from 'lucide-react';

export default function EnrollPage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', consent: false });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.consent) return;
    setLoading(true);
    // Small delay for UX
    await new Promise(r => setTimeout(r, 800));
    setSubmitted(true);
    setLoading(false);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">You're enrolled!</h2>
          <p className="text-slate-400 mb-6">
            Welcome to CaseBuddy AI Law. Our team will reach out within 24 hours to complete your onboarding.
          </p>
          <a href="/" className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-6 py-3 rounded-lg transition-colors">
            Go to CaseBuddy <ArrowRight size={16} />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Scale size={24} className="text-amber-400" />
          <span className="font-bold text-lg">CaseBuddy AI Law</span>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-4 py-1.5 text-amber-400 text-sm font-medium mb-6">
            <Shield size={14} /> Secure Enrollment
          </div>
          <h1 className="text-4xl font-bold mb-4">Enroll in CaseBuddy AI Law</h1>
          <p className="text-slate-400 text-lg">
            Get AI-powered legal assistance, 24/7 agent support, and smart case management — all in one place.
          </p>
        </div>

        {/* Benefits */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          {[
            { icon: '⚖️', title: 'AI Legal Agents', desc: 'Maya, Lex, Rex & more — always available' },
            { icon: '📞', title: 'Call Recording', desc: 'Capture evidence automatically' },
            { icon: '📋', title: 'Case Management', desc: 'Organize everything in one place' },
          ].map((b, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
              <div className="text-3xl mb-2">{b.icon}</div>
              <div className="font-semibold text-white text-sm mb-1">{b.title}</div>
              <div className="text-slate-500 text-xs">{b.desc}</div>
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <h2 className="text-xl font-bold mb-6">Create your account</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Full Name *</label>
              <input
                type="text" required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Jane Smith"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email Address *</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-3.5 text-slate-500" />
                <input
                  type="email" required
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="you@example.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Phone Number <span className="text-slate-500 font-normal">(optional — for SMS updates)</span></label>
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-3.5 text-slate-500" />
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+1 (555) 000-0000"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
            </div>

            {/* Consent — required by Twilio / TCPA */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox" required
                  checked={form.consent}
                  onChange={e => setForm(f => ({ ...f, consent: e.target.checked }))}
                  className="mt-1 w-4 h-4 accent-amber-500 flex-shrink-0"
                />
                <span className="text-sm text-slate-300 leading-relaxed">
                  I agree to receive automated SMS messages and emails from CaseBuddy AI Law regarding my account, case updates, and legal alerts. Message and data rates may apply. I can opt out at any time by replying STOP. By enrolling I agree to the{' '}
                  <a href="/tos" className="text-amber-400 hover:underline">Terms of Service</a>
                  {' '}and{' '}
                  <a href="/privacy-policy" className="text-amber-400 hover:underline">Privacy Policy</a>.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={!form.consent || loading}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 font-bold py-3.5 rounded-lg flex items-center justify-center gap-2 transition-colors text-base"
            >
              {loading ? (
                <span className="animate-spin w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full" />
              ) : (
                <>Enroll Now <ArrowRight size={16} /></>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          CaseBuddy AI Law · <a href="/privacy-policy" className="hover:text-slate-400">Privacy Policy</a> · <a href="/tos" className="hover:text-slate-400">Terms of Service</a>
        </p>
      </div>
    </div>
  );
}
