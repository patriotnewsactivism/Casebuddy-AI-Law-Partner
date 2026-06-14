
import React, { useState } from 'react';
import { Zap, CheckCircle2, AlertCircle, ExternalLink, Search, Filter } from 'lucide-react';
import { getIntegrationStatuses, IntegrationStatus } from '../services/integrationService';

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  research: 'Legal Research',
  billing: 'Billing',
  communication: 'Communication',
  filing: 'Court Filing',
  tools: 'Tools',
};

const IntegrationCard = ({ integration }: { integration: IntegrationStatus }) => (
  <div className={`bg-slate-800 border rounded-xl p-5 transition-all ${
    integration.configured ? 'border-green-500/40' : 'border-slate-700'
  }`}>
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="flex items-center gap-2">
        {integration.configured
          ? <CheckCircle2 size={18} className="text-green-400 shrink-0" />
          : <AlertCircle size={18} className="text-slate-600 shrink-0" />}
        <h3 className="font-semibold text-white">{integration.name}</h3>
      </div>
      <span className={`text-xs px-2 py-1 rounded-full border font-medium shrink-0 ${
        integration.configured
          ? 'bg-green-500/10 border-green-500/30 text-green-400'
          : 'bg-slate-900 border-slate-700 text-slate-500'
      }`}>
        {integration.configured ? 'Connected' : 'Not configured'}
      </span>
    </div>

    <p className="text-sm text-slate-400 mb-4 leading-relaxed">{integration.description}</p>

    <div className="space-y-2">
      {!integration.configured && (
        <div className="p-3 bg-slate-900 border border-slate-700 rounded-lg">
          <p className="text-xs text-slate-500 mb-1 font-mono">Add to .env.local:</p>
          <p className="text-xs font-mono text-amber-400">{integration.envKey}=your_key_here</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full border ${
          integration.category === 'research' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
          integration.category === 'billing' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
          integration.category === 'communication' ? 'bg-violet-500/10 border-violet-500/30 text-violet-400' :
          integration.category === 'filing' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
          'bg-slate-800 border-slate-700 text-slate-400'
        }`}>
          {CATEGORY_LABELS[integration.category]}
        </span>

        {!integration.configured && (
          <a href={integration.signupUrl} target="_blank" rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-xs text-gold-400 hover:text-gold-300 transition-colors">
            Sign Up <ExternalLink size={11} />
          </a>
        )}
      </div>
    </div>
  </div>
);

const Integrations: React.FC = () => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const integrations = getIntegrationStatuses();

  const filtered = integrations.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.description.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === 'all' || i.category === category;
    return matchSearch && matchCat;
  });

  const configuredCount = integrations.filter(i => i.configured).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white font-serif flex items-center gap-3">
          <Zap className="text-gold-500" size={28} />
          Integrations
        </h1>
        <p className="text-slate-400 mt-1">Connect third-party services to unlock CaseBuddy's full potential.</p>
      </div>

      {/* Status banner */}
      <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
        configuredCount > 0
          ? 'bg-green-500/10 border-green-500/30'
          : 'bg-slate-800 border-slate-700'
      }`}>
        <div>
          <p className="font-semibold text-white">{configuredCount} of {integrations.length} integrations active</p>
          <p className="text-sm text-slate-400 mt-0.5">
            {configuredCount === 0
              ? 'Add API keys to .env.local to activate integrations. The app works without them — AI features use Gemini only.'
              : `${integrations.length - configuredCount} more available. Each adds new capabilities.`}
          </p>
        </div>
        <div className="text-2xl font-bold text-white shrink-0">
          {Math.round((configuredCount / integrations.length) * 100)}%
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search integrations…"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-gold-500 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1">
          <Filter size={14} className="text-slate-500 ml-2 mr-1" />
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <button key={key} onClick={() => setCategory(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                category === key ? 'bg-gold-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Setup guide */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5">
        <h3 className="font-semibold text-amber-300 mb-2 flex items-center gap-2">
          <AlertCircle size={16} />
          How to connect integrations
        </h3>
        <ol className="text-sm text-amber-200/80 space-y-1 list-decimal list-inside">
          <li>Sign up for the service using the link in each card</li>
          <li>Copy your API key / credentials from the service dashboard</li>
          <li>Add the environment variable shown to your <code className="bg-amber-500/10 px-1 rounded font-mono">.env.local</code> file</li>
          <li>Restart the dev server — the integration activates automatically</li>
        </ol>
        <p className="text-xs text-amber-400/60 mt-3">
          Note: Stripe, Twilio, DocuSign, Lob, PACER, and Tyler Tech require a backend proxy server to keep credentials secure.
          Deepgram, CourtListener, Cal.com, and Google Maps can be called directly from the browser.
        </p>
      </div>

      {/* Integration grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(i => <IntegrationCard key={i.id} integration={i} />)}
        {filtered.length === 0 && (
          <div className="col-span-3 text-center py-12 text-slate-500">
            No integrations match your search.
          </div>
        )}
      </div>
    </div>
  );
};

export default Integrations;
