import React, { useState, useRef, useCallback } from 'react';
import {
  FileText, GitCompare, ArrowLeftRight, Download, Copy, Zap,
  Loader2, AlertTriangle, PlusCircle, MinusCircle, RotateCcw, Eye, Columns
} from 'lucide-react';
import {
  compareDocuments, compareDocumentsFromStrings, exportDiffAsText,
  type CompareResult, type DiffLine, type CompareOptions
} from '../services/documentCompareService';

const SAMPLE_ORIGINAL = `MOTION TO SUPPRESS EVIDENCE

IN THE SUPERIOR COURT OF FULTON COUNTY
STATE OF GEORGIA

STATE OF GEORGIA
v.
JAMES ANDERSON
Case No. 2024-CR-00421

DEFENDANT'S MOTION TO SUPPRESS EVIDENCE

COMES NOW the Defendant, James Anderson, by and through undersigned counsel, and respectfully moves this Honorable Court to suppress all evidence obtained from the warrantless search of the Defendant's vehicle on March 15, 2024, and in support thereof states as follows:

STATEMENT OF FACTS

1. On March 15, 2024, at approximately 10:45 PM, Officer Mark Benson of the Atlanta Police Department initiated a traffic stop of the Defendant's vehicle on Interstate 85.

2. Officer Benson alleged that the Defendant was traveling 72 mph in a 65 mph zone. The Defendant disputes this and contends he was operating his vehicle within the posted speed limit.

3. After stopping the Defendant, Officer Benson requested the Defendant's license and registration, which were promptly provided.

4. Without reasonable suspicion of any criminal activity beyond the alleged traffic infraction, Officer Benson ordered the Defendant to exit the vehicle and proceeded to search the passenger compartment without consent, warrant, or exigent circumstances.

ARGUMENT

The search of the Defendant's vehicle violated the Fourth Amendment to the United States Constitution, which protects citizens against unreasonable searches and seizures. The warrantless search does not fall within any recognized exception to the warrant requirement.

WHEREFORE, the Defendant respectfully requests that this Court grant this Motion and suppress all evidence obtained from the unlawful search.

Respectfully submitted,
Sarah Mitchell, Esq.
Attorney for Defendant`;

const SAMPLE_REVISED = `MOTION TO SUPPRESS EVIDENCE AND FOR SANCTIONS

IN THE SUPERIOR COURT OF FULTON COUNTY
STATE OF GEORGIA

STATE OF GEORGIA
v.
JAMES ANDERSON
Case No. 2024-CR-00421

DEFENDANT'S MOTION TO SUPPRESS EVIDENCE AND FOR DISCOVERY SANCTIONS

COMES NOW the Defendant, James Anderson, by and through undersigned counsel, and respectfully moves this Honorable Court to suppress all evidence obtained from the warrantless search of the Defendant's vehicle on March 15, 2024, and further moves for sanctions against the State for discovery violations, and in support thereof states as follows:

STATEMENT OF FACTS

1. On March 15, 2024, at approximately 10:45 PM, Officer Mark Benson of the Atlanta Police Department initiated a traffic stop of the Defendant's vehicle on Interstate 85 near Exit 87.

2. Officer Benson alleged that the Defendant was traveling 72 mph in a 65 mph zone. The Defendant disputes this and contends he was operating his vehicle at 67 mph, within normal variance of the posted speed limit. Dash camera footage from Officer Benson's patrol vehicle supports this account.

3. After stopping the Defendant, Officer Benson requested the Defendant's license and registration, which were promptly provided. The Defendant was cooperative at all times during the encounter.

4. Without reasonable suspicion of any criminal activity beyond the alleged traffic infraction, Officer Benson ordered the Defendant to exit the vehicle and proceeded to search the passenger compartment without consent, warrant, or exigent circumstances. Notably, Officer Benson also searched the trunk of the vehicle, which was locked and inaccessible from the passenger compartment.

5. During discovery, the State failed to produce the dash camera footage within the timeframe required by O.C.G.A. § 17-16-4. Defense counsel made three separate written requests for this footage on April 2, April 15, and May 1, 2024. The footage was finally produced on May 20, 2024, just three days before trial.

ARGUMENT

I. THE WARRANTLESS SEARCH VIOLATED THE FOURTH AMENDMENT

The search of the Defendant's vehicle violated the Fourth Amendment to the United States Constitution, which protects citizens against unreasonable searches and seizures. The warrantless search of the passenger compartment and trunk does not fall within any recognized exception to the warrant requirement. The search of the trunk, in particular, cannot be justified under Arizona v. Gant, 556 U.S. 332 (2009), as the Defendant was secured and could not access the trunk.

II. THE STATE'S LATE DISCLOSURE WARRANTS SANCTIONS

The State's failure to timely produce exculpatory dash camera footage constitutes a discovery violation under Brady v. Maryland and O.C.G.A. § 17-16-4. The late disclosure has substantially prejudiced the Defendant's ability to prepare for trial.

WHEREFORE, the Defendant respectfully requests that this Court:
1. Grant this Motion and suppress all evidence obtained from the unlawful search;
2. Impose sanctions against the State for discovery violations;
3. In the alternative, grant a continuance to allow adequate preparation.

Respectfully submitted,
Sarah Mitchell, Esq.
Attorney for Defendant`;

function severityColor(severity: string): string {
  switch (severity) {
    case 'major': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'minor': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'cosmetic': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  }
}

function lineColor(type: DiffType): string {
  switch (type) {
    case 'added': return 'bg-green-900/30 border-l-2 border-green-500';
    case 'removed': return 'bg-red-900/30 border-l-2 border-red-500';
    case 'modified': return 'bg-amber-900/20 border-l-2 border-amber-500';
    case 'unchanged': return 'bg-slate-900/20';
  }
}

function linePrefix(type: DiffType): { prefix: string; color: string } {
  switch (type) {
    case 'added': return { prefix: '+', color: 'text-green-400' };
    case 'removed': return { prefix: '-', color: 'text-red-400' };
    case 'modified': return { prefix: '~', color: 'text-amber-400' };
    case 'unchanged': return { prefix: ' ', color: 'text-slate-500' };
  }
}

const DocumentCompare: React.FC = () => {
  const [titleA, setTitleA] = useState('Original Document');
  const [titleB, setTitleB] = useState('Revised Document');
  const [textA, setTextA] = useState('');
  const [textB, setTextB] = useState('');
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(true);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const isScrollingSync = useRef(false);

  const handleLeftScroll = useCallback(() => {
    if (isScrollingSync.current) return;
    isScrollingSync.current = true;
    if (rightRef.current && leftRef.current) {
      rightRef.current.scrollTop = leftRef.current.scrollTop;
      rightRef.current.scrollLeft = leftRef.current.scrollLeft;
    }
    requestAnimationFrame(() => { isScrollingSync.current = false; });
  }, []);

  const handleRightScroll = useCallback(() => {
    if (isScrollingSync.current) return;
    isScrollingSync.current = true;
    if (leftRef.current && rightRef.current) {
      leftRef.current.scrollTop = rightRef.current.scrollTop;
      leftRef.current.scrollLeft = rightRef.current.scrollLeft;
    }
    requestAnimationFrame(() => { isScrollingSync.current = false; });
  }, []);

  const handleCompare = async () => {
    if (!textA.trim() && !textB.trim()) {
      setError('Both documents are empty. Paste content to compare.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const options: CompareOptions = {
        titleA,
        titleB,
        ignoreWhitespace,
        ignoreCase,
      };
      const res = await compareDocuments(textA, textB, options);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Comparison failed');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!result) return;
    const text = exportDiffAsText(result);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diff_${result.id}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleLoadSample = () => {
    setTitleA('Motion to Suppress (Original)');
    setTitleB('Motion to Suppress (Revised)');
    setTextA(SAMPLE_ORIGINAL);
    setTextB(SAMPLE_REVISED);
    setResult(null);
    setError(null);
  };

  const handleReset = () => {
    setTextA('');
    setTextB('');
    setTitleA('Original Document');
    setTitleB('Revised Document');
    setResult(null);
    setError(null);
    setCopied(false);
  };

  const linePairs = result
    ? (() => {
        const pairs: { left: DiffLine | null; right: DiffLine | null }[] = [];
        const maxLen = Math.max(result.linesA.length, result.linesB.length);
        let ai = 0;
        let bi = 0;
        while (ai < result.linesA.length || bi < result.linesB.length) {
          const left = ai < result.linesA.length ? result.linesA[ai] : null;
          const right = bi < result.linesB.length ? result.linesB[bi] : null;

          if (left && left.type === 'removed' && right && right.type === 'added') {
            pairs.push({ left, right });
            ai++;
            bi++;
          } else if (left && left.type === 'modified' && right && right.type === 'modified') {
            pairs.push({ left, right });
            ai++;
            bi++;
          } else if (left && left.type === 'removed') {
            pairs.push({ left, right: null });
            ai++;
          } else if (right && right.type === 'added') {
            pairs.push({ left: null, right });
            bi++;
          } else {
            pairs.push({ left, right });
            ai++;
            bi++;
          }
        }
        return pairs;
      })()
    : [];

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <GitCompare size={28} className="text-gold-500" />
          <h1 className="text-2xl font-serif font-bold text-white">Document Comparison</h1>
        </div>
        <p className="text-slate-400 text-sm mb-6">Side-by-side diff with AI change analysis</p>

        {!result && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Document Name</label>
                <input
                  type="text"
                  value={titleA}
                  onChange={e => setTitleA(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:border-gold-500/50 focus:outline-none"
                  placeholder="Original Document"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Document Name</label>
                <input
                  type="text"
                  value={titleB}
                  onChange={e => setTitleB(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:border-gold-500/50 focus:outline-none"
                  placeholder="Revised Document"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Original Document</label>
                <textarea
                  value={textA}
                  onChange={e => setTextA(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 font-mono focus:border-gold-500/50 focus:outline-none resize-y"
                  style={{ minHeight: '300px' }}
                  placeholder="Paste original document text here..."
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Revised Document</label>
                <textarea
                  value={textB}
                  onChange={e => setTextB(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 font-mono focus:border-gold-500/50 focus:outline-none resize-y"
                  style={{ minHeight: '300px' }}
                  placeholder="Paste revised document text here..."
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 py-2 px-4 bg-slate-900/50 rounded-lg border border-slate-800">
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ignoreWhitespace}
                  onChange={e => setIgnoreWhitespace(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-700 text-gold-500 focus:ring-gold-500/40"
                />
                Ignore Whitespace
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ignoreCase}
                  onChange={e => setIgnoreCase(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-700 text-gold-500 focus:ring-gold-500/40"
                />
                Ignore Case
              </label>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                <AlertTriangle size={16} />
                {error}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handleCompare}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 bg-gold-500 hover:bg-gold-400 text-slate-900 font-semibold rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <GitCompare size={16} />}
                Compare Documents
              </button>
              <button
                onClick={handleLoadSample}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
              >
                <FileText size={16} />
                Load Sample
              </button>
            </div>
          </div>
        )}

        {loading && !result && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 size={32} className="text-gold-500 animate-spin" />
            <p className="text-slate-400 text-sm">Comparing documents and analyzing changes...</p>
          </div>
        )}

        {result && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
                <div className="flex items-center gap-2 text-green-400 text-sm mb-1">
                  <PlusCircle size={14} />
                  <span className="font-semibold">Lines Added</span>
                </div>
                <span className="text-2xl font-bold text-white">{result.stats.addedLines}</span>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
                <div className="flex items-center gap-2 text-red-400 text-sm mb-1">
                  <MinusCircle size={14} />
                  <span className="font-semibold">Lines Removed</span>
                </div>
                <span className="text-2xl font-bold text-white">{result.stats.removedLines}</span>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
                <div className="flex items-center gap-2 text-amber-400 text-sm mb-1">
                  <ArrowLeftRight size={14} />
                  <span className="font-semibold">Lines Modified</span>
                </div>
                <span className="text-2xl font-bold text-white">{result.stats.modifiedLines}</span>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
                <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                  <Zap size={14} />
                  <span className="font-semibold">Change %</span>
                </div>
                <span className="text-2xl font-bold text-white">{result.stats.changePercentage}%</span>
              </div>
            </div>

            {(result.aiSummary || result.keyChanges.length > 0) && (
              <div className="bg-slate-900/40 border border-gold-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Eye size={16} className="text-gold-500" />
                  <h3 className="text-sm font-semibold text-gold-400 uppercase tracking-wider">AI Analysis</h3>
                </div>
                {result.aiSummary && (
                  <p className="text-slate-300 text-sm leading-relaxed mb-4">{result.aiSummary}</p>
                )}
                {result.keyChanges.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Key Changes</h4>
                    <div className="space-y-2">
                      {result.keyChanges.map((kc, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${severityColor(kc.severity)}`}>
                            {kc.severity.toUpperCase()}
                          </span>
                          <span className="text-slate-300 text-sm">{kc.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Columns size={14} />
              <span className="font-semibold">{result.titleA}</span>
              <span className="text-slate-600">vs</span>
              <span className="font-semibold">{result.titleB}</span>
            </div>

            <div className="grid grid-cols-2 gap-0 border border-slate-800 rounded-lg overflow-hidden">
              <div className="bg-slate-900/80 px-4 py-2 border-b border-r border-slate-800">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{result.titleA} (Original)</span>
              </div>
              <div className="bg-slate-900/80 px-4 py-2 border-b border-slate-800">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{result.titleB} (Revised)</span>
              </div>

              <div
                ref={leftRef}
                onScroll={handleLeftScroll}
                className="max-h-[600px] overflow-y-auto border-r border-slate-800/60"
              >
                {linePairs.map((pair, idx) => {
                  const line = pair.left;
                  if (!line) return <div key={idx} className="h-6" />;
                  const colors = lineColor(line.type);
                  const { prefix, color: prefixColor } = linePrefix(line.type);
                  return (
                    <div key={idx} className={`flex items-stretch ${colors}`}>
                      <span className="w-12 text-right pr-3 text-slate-600 text-[10px] select-none leading-6 pt-0.5 shrink-0">
                        {line.index + 1}
                      </span>
                      <span className={`font-mono text-xs leading-6 pt-0.5 ${prefixColor} select-none w-5 shrink-0`}>
                        {prefix}
                      </span>
                      <span className="font-mono text-xs text-slate-200 leading-6 pt-0.5 pr-2 break-all">
                        {line.text || '\u00A0'}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div
                ref={rightRef}
                onScroll={handleRightScroll}
                className="max-h-[600px] overflow-y-auto"
              >
                {linePairs.map((pair, idx) => {
                  const line = pair.right;
                  if (!line) return <div key={idx} className="h-6" />;
                  const colors = lineColor(line.type);
                  const { prefix, color: prefixColor } = linePrefix(line.type);
                  return (
                    <div key={idx} className={`flex items-stretch ${colors}`}>
                      <span className="w-12 text-right pr-3 text-slate-600 text-[10px] select-none leading-6 pt-0.5 shrink-0">
                        {line.index + 1}
                      </span>
                      <span className={`font-mono text-xs leading-6 pt-0.5 ${prefixColor} select-none w-5 shrink-0`}>
                        {prefix}
                      </span>
                      <span className="font-mono text-xs text-slate-200 leading-6 pt-0.5 pr-2 break-all">
                        {line.text || '\u00A0'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
              >
                {copied ? <Copy size={14} className="text-green-400" /> : <Download size={14} />}
                {copied ? 'Copied to Clipboard' : 'Export as Text'}
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
              >
                <RotateCcw size={14} />
                New Comparison
              </button>
            </div>
          </div>
        )}

        {!result && !loading && !textA && !textB && (
          <div className="text-center py-16 border-2 border-dashed border-slate-800 rounded-xl">
            <GitCompare size={40} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Paste or type two document versions to compare</p>
            <button
              onClick={handleLoadSample}
              className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 rounded-lg text-sm transition-colors"
            >
              <FileText size={14} />
              Load Sample
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentCompare;
