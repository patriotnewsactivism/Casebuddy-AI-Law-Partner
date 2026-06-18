import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';

interface AIDisclaimerProps {
  variant?: 'compact' | 'full';
  className?: string;
}

/**
 * Reusable legal disclaimer for AI-generated outputs.
 * 
 * - `compact`: Inline one-liner for output areas (default)
 * - `full`: Page-level banner with full disclosure
 */
const AIDisclaimer: React.FC<AIDisclaimerProps> = ({ variant = 'compact', className = '' }) => {
  if (variant === 'full') {
    return (
      <div className={`flex items-start gap-3 p-4 bg-amber-950/30 border border-amber-700/40 rounded-xl ${className}`}>
        <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-200/80 leading-relaxed space-y-1">
          <p className="font-semibold text-amber-300">AI-Assisted Legal Tool — Not Legal Advice</p>
          <p>
            CaseBuddy provides AI-assisted legal information, drafting, and organization tools.
            It is not a substitute for a licensed attorney and does not create an attorney-client relationship.
            Always verify AI outputs with qualified legal counsel before relying on them in any legal proceeding.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 text-[11px] text-slate-500 ${className}`}>
      <Info size={12} className="shrink-0" />
      <span>AI-generated — verify with qualified legal counsel before use.</span>
    </div>
  );
};

export default AIDisclaimer;
