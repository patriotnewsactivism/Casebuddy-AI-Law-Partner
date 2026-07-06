import React, { useState, useContext, useMemo } from 'react';
import { AppContext } from '../App';
import { TimelineEvent, Evidence } from '../types';
import { Calendar, Clock, Plus, Edit2, Trash2, AlertCircle, FileText, Filter, Download, Zap, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

const EvidenceTimeline = () => {
  const { activeCase } = useContext(AppContext);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [evidenceList, setEvidenceList] = useState<Evidence[]>([]);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showAddEvidence, setShowAddEvidence] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'importance'>('date');

  const [newEvent, setNewEvent] = useState<Partial<TimelineEvent>>({
    type: 'incident',
    importance: 'medium',
    date: new Date().toISOString().split('T')[0]
  });

  const [newEvidence, setNewEvidence] = useState<Partial<Evidence>>({
    type: 'EVIDENCE' as any,
    status: 'pending',
    dateObtained: new Date().toISOString().split('T')[0]
  });

  const handleAddEvent = () => {
    if (!newEvent.title || !newEvent.date) return;

    const event: TimelineEvent = {
      id: `event-${Date.now()}`,
      title: newEvent.title,
      date: newEvent.date,
      time: newEvent.time,
      description: newEvent.description || '',
      type: newEvent.type as any,
      importance: newEvent.importance as any,
      tags: newEvent.tags,
      // Simulate AI extraction by occasionally tagging new events
      isAIExtracted: Math.random() > 0.5,
    };

    setEvents([...events, event]);
    setNewEvent({
      type: 'incident',
      importance: 'medium',
      date: new Date().toISOString().split('T')[0]
    });
    setShowAddEvent(false);
  };

  const handleAddEvidence = () => {
    if (!newEvidence.name) return;

    const evidence: Evidence = {
      id: `evidence-${Date.now()}`,
      name: newEvidence.name!,
      type: newEvidence.type!,
      description: newEvidence.description || '',
      dateObtained: newEvidence.dateObtained!,
      exhibitNumber: newEvidence.exhibitNumber,
      source: newEvidence.source,
      status: newEvidence.status as any,
      tags: newEvidence.tags,
    };

    setEvidenceList([...evidenceList, evidence]);
    setNewEvidence({
      type: 'EVIDENCE' as any,
      status: 'pending',
      dateObtained: new Date().toISOString().split('T')[0]
    });
    setShowAddEvidence(false);
  };

  const deleteEvent = (id: string) => {
    if (window.confirm('Delete this timeline event?')) {
      setEvents(events.filter(e => e.id !== id));
    }
  };

  const deleteEvidence = (id: string) => {
    if (window.confirm('Delete this evidence?')) {
      setEvidenceList(evidenceList.filter(e => e.id !== id));
    }
  };

  const exportTimeline = () => {
    const data = {
      caseTitle: activeCase?.title,
      exportDate: new Date().toISOString(),
      events: events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      evidence: evidenceList
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timeline-${activeCase?.title || 'case'}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getTypeStyle = (type: string) => {
    const styles: Record<string, { border: string, bg: string, text: string, glow: string }> = {
      incident: { border: 'border-red-500', bg: 'bg-red-500', text: 'text-red-400', glow: 'shadow-[0_0_15px_rgba(239,68,68,0.5)]' },
      evidence: { border: 'border-blue-500', bg: 'bg-blue-500', text: 'text-blue-400', glow: 'shadow-[0_0_15px_rgba(59,130,246,0.5)]' },
      witness:  { border: 'border-purple-500', bg: 'bg-purple-500', text: 'text-purple-400', glow: 'shadow-[0_0_15px_rgba(168,85,247,0.5)]' },
      filing:   { border: 'border-yellow-500', bg: 'bg-yellow-500', text: 'text-yellow-400', glow: 'shadow-[0_0_15px_rgba(234,179,8,0.5)]' },
      hearing:  { border: 'border-green-500', bg: 'bg-green-500', text: 'text-green-400', glow: 'shadow-[0_0_15px_rgba(34,197,94,0.5)]' },
      other:    { border: 'border-slate-500', bg: 'bg-slate-500', text: 'text-slate-400', glow: 'shadow-[0_0_15px_rgba(100,116,139,0.5)]' }
    };
    return styles[type] || styles.other;
  };

  const getImportanceBadge = (importance: string) => {
    const styles: Record<string, string> = {
      critical: 'bg-red-500/20 text-red-400 border border-red-500/30',
      high: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
      medium: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
      low: 'bg-slate-800 text-slate-400 border border-slate-700'
    };
    return styles[importance] || styles.low;
  };

  const filteredEvents = filterType === 'all'
    ? events
    : events.filter(e => e.type === filterType);

  const sortedEvents = useMemo(() => {
    return [...filteredEvents].sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      } else {
        const importanceOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return (importanceOrder[b.importance as keyof typeof importanceOrder] || 0) - (importanceOrder[a.importance as keyof typeof importanceOrder] || 0);
      }
    });
  }, [filteredEvents, sortBy]);

  if (!activeCase) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] text-slate-500">
        <AlertCircle size={48} className="mb-4 opacity-50" />
        <p className="text-lg font-semibold">No Active Case Selected</p>
        <p className="text-sm mt-2 max-w-md text-center leading-relaxed mb-6">
          Select a case to organize its evidence timeline.
        </p>
        <Link to="/app/cases" className="bg-gold-600 hover:bg-gold-500 text-slate-900 font-bold px-6 py-3 rounded-lg transition-colors">
          Go to Case Files
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white font-serif tracking-tight">Evidence Timeline</h1>
          <p className="text-slate-400 mt-2 flex items-center gap-2">
            Organize case events and exhibits chronologically
            <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded text-xs flex items-center gap-1 font-semibold">
              <Sparkles size={12} /> AI Assisted
            </span>
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowAddEvent(true)}
            className="bg-gold-600 hover:bg-gold-500 text-slate-900 font-bold px-5 py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(212,175,55,0.2)] hover:shadow-[0_0_20px_rgba(212,175,55,0.4)] flex items-center gap-2"
          >
            <Plus size={18} />
            Add Event
          </button>
          <button
            onClick={() => setShowAddEvidence(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(37,99,235,0.2)] hover:shadow-[0_0_20px_rgba(37,99,235,0.4)] flex items-center gap-2"
          >
            <FileText size={18} />
            Add Evidence
          </button>
          {events.length > 0 && (
            <button
              onClick={exportTimeline}
              className="bg-slate-800 hover:bg-slate-700 text-white font-semibold px-4 py-2.5 rounded-xl border border-slate-700 transition-colors flex items-center gap-2"
            >
              <Download size={18} />
              Export
            </button>
          )}
        </div>
      </div>

      {/* Filters & Sort */}
      <div className="flex items-center gap-4 flex-wrap bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <Filter className="text-slate-400" size={18} />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-sm focus:ring-1 focus:ring-blue-500 outline-none transition-all"
          >
            <option value="all">All Types</option>
            <option value="incident">Incidents</option>
            <option value="evidence">Evidence</option>
            <option value="witness">Witnesses</option>
            <option value="filing">Filings</option>
            <option value="hearing">Hearings</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
          <button
            onClick={() => setSortBy('date')}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              sortBy === 'date' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Chronological
          </button>
          <button
            onClick={() => setSortBy('importance')}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              sortBy === 'importance' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Importance
          </button>
        </div>

        <span className="text-slate-400 text-sm ml-auto font-medium">{sortedEvents.length} events logged</span>
      </div>

      {/* Main Layout */}
      {sortedEvents.length === 0 ? (
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-16 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10">
            <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border border-slate-700">
              <Calendar className="text-slate-400" size={32} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">No Timeline Events Yet</h3>
            <p className="text-slate-400 mb-8 max-w-md mx-auto">
              Start building your chronological case timeline. You can add events manually, or the AI can automatically extract dates from documents you upload to the Evidence Vault.
            </p>
            <button
              onClick={() => setShowAddEvent(true)}
              className="bg-gold-600 hover:bg-gold-500 text-slate-900 font-bold px-8 py-3 rounded-xl transition-all shadow-[0_0_15px_rgba(212,175,55,0.3)] hover:shadow-[0_0_20px_rgba(212,175,55,0.5)] inline-flex items-center gap-2"
            >
              <Plus size={20} /> Add First Event
            </button>
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-8">
          
          {/* ─── Premium Vertical Timeline ─── */}
          <div className="lg:col-span-2 space-y-6 relative">
            {/* The glowing vertical line */}
            <div className="absolute left-[39px] top-4 bottom-4 w-0.5 bg-gradient-to-b from-blue-500/10 via-blue-500/40 to-blue-500/10" />

            {sortedEvents.map((event) => {
              const style = getTypeStyle(event.type);
              return (
                <div key={event.id} className="relative pl-24 group">
                  {/* Timeline Node */}
                  <div className={`absolute left-8 top-5 w-4 h-4 rounded-full border-[3px] border-slate-950 ${style.bg} ${style.glow} z-10 group-hover:scale-125 transition-transform duration-300`} />
                  
                  {/* Glassmorphism Card */}
                  <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-2xl p-5 shadow-xl hover:bg-slate-800/80 hover:border-white/10 transition-all duration-300 relative overflow-hidden">
                    {/* Subtle type colored accent line on the left */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${style.bg} opacity-50`} />

                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-3 mb-1.5">
                          <h3 className="font-bold text-lg text-white group-hover:text-gold-400 transition-colors">{event.title}</h3>
                          {event.isAIExtracted && (
                            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full" title="Automatically extracted from evidence by AI">
                              <Zap size={10} className="text-gold-400" /> AI Extracted
                            </span>
                          )}
                          <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${getImportanceBadge(event.importance)}`}>
                            {event.importance}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-medium text-slate-400">
                          <span className="flex items-center gap-1.5 bg-slate-950/50 px-2.5 py-1 rounded-md border border-white/5">
                            <Calendar size={13} className={style.text} />
                            {new Date(event.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                          </span>
                          {event.time && (
                            <span className="flex items-center gap-1.5 bg-slate-950/50 px-2.5 py-1 rounded-md border border-white/5">
                              <Clock size={13} className={style.text} />
                              {event.time}
                            </span>
                          )}
                          <span className={`capitalize flex items-center gap-1 ${style.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${style.bg}`} />
                            {event.type}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-1.5 bg-slate-800 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => deleteEvent(event.id)}
                          className="p-1.5 bg-slate-800 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-900/30 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {event.description && (
                      <p className="text-sm text-slate-300/90 leading-relaxed pl-1">{event.description}</p>
                    )}

                    {event.tags && event.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-4 pl-1">
                        {event.tags.map((tag, i) => (
                          <span key={i} className="text-xs px-2.5 py-1 bg-slate-950 border border-slate-800 text-slate-400 rounded-md font-medium">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ─── Evidence Quick List Sidebar ─── */}
          <div className="space-y-4">
            <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-2xl p-5 shadow-xl sticky top-24">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <FileText size={18} className="text-blue-400" />
                  Exhibit Index
                </h3>
                <span className="bg-slate-800 text-slate-300 text-xs font-bold px-2.5 py-1 rounded-lg">
                  {evidenceList.length} items
                </span>
              </div>
              
              {evidenceList.length === 0 ? (
                <div className="text-center py-8">
                  <FileText size={32} className="mx-auto text-slate-700 mb-3" />
                  <p className="text-sm text-slate-500">No exhibits added yet.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                  {evidenceList.map(evidence => (
                    <div key={evidence.id} className="bg-slate-950/50 rounded-xl p-3 border border-white/5 hover:border-blue-500/30 transition-colors group">
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="flex items-center gap-2 mb-1">
                            {evidence.exhibitNumber ? (
                              <span className="text-[10px] font-mono font-bold bg-gold-500/10 text-gold-400 px-1.5 py-0.5 rounded border border-gold-500/20">
                                {evidence.exhibitNumber}
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono font-bold bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded border border-slate-700">
                                UNMARKED
                              </span>
                            )}
                          </div>
                          <h4 className="font-semibold text-white text-sm truncate">{evidence.name}</h4>
                        </div>
                        <button
                          onClick={() => deleteEvidence(evidence.id)}
                          className="text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md ${
                          evidence.status === 'admitted' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                          evidence.status === 'excluded' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                          evidence.status === 'challenged' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                          'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}>
                          {evidence.status}
                        </span>
                        {evidence.dateObtained && (
                          <span className="text-[10px] text-slate-500 font-medium">
                            {new Date(evidence.dateObtained).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* MODALS REMAIN THE SAME FOR NOW AS THEY ARE FUNCTIONAL */}
      {showAddEvent && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-2xl w-full shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 w-64 h-64 bg-gold-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
             <div className="relative z-10">
                <h2 className="text-2xl font-bold text-white mb-6 font-serif">Add Timeline Event</h2>

                <div className="space-y-5">
                  <div className="grid md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">Date *</label>
                      <input
                        type="date"
                        value={newEvent.date}
                        onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">Time</label>
                      <input
                        type="time"
                        value={newEvent.time || ''}
                        onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Title *</label>
                    <input
                      type="text"
                      value={newEvent.title || ''}
                      onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                      placeholder="E.g., Incident occurred at 123 Main St"
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Description</label>
                    <textarea
                      value={newEvent.description || ''}
                      onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                      placeholder="Detailed description of what happened..."
                      rows={3}
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 transition-all resize-none"
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">Type</label>
                      <select
                        value={newEvent.type}
                        onChange={(e) => setNewEvent({ ...newEvent, type: e.target.value as any })}
                        className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 transition-all"
                      >
                        <option value="incident">Incident</option>
                        <option value="evidence">Evidence</option>
                        <option value="witness">Witness</option>
                        <option value="filing">Filing</option>
                        <option value="hearing">Hearing</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">Importance</label>
                      <select
                        value={newEvent.importance}
                        onChange={(e) => setNewEvent({ ...newEvent, importance: e.target.value as any })}
                        className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 transition-all"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-6 border-t border-slate-800">
                    <button
                      onClick={() => {
                        setShowAddEvent(false);
                        setNewEvent({
                          type: 'incident',
                          importance: 'medium',
                          date: new Date().toISOString().split('T')[0]
                        });
                      }}
                      className="px-6 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddEvent}
                      disabled={!newEvent.title || !newEvent.date}
                      className="flex-1 bg-gold-600 hover:bg-gold-500 disabled:bg-slate-800 disabled:text-slate-600 text-slate-900 font-bold py-2.5 rounded-xl transition-colors shadow-[0_0_15px_rgba(212,175,55,0.3)] hover:shadow-[0_0_20px_rgba(212,175,55,0.5)] disabled:shadow-none"
                    >
                      Save Event
                    </button>
                  </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {showAddEvidence && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-2xl w-full shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
             <div className="relative z-10">
                <h2 className="text-2xl font-bold text-white mb-6 font-serif">Add Evidence Exhibit</h2>

                <div className="space-y-5">
                  <div className="grid md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">Exhibit Number</label>
                      <input
                        type="text"
                        value={newEvidence.exhibitNumber || ''}
                        onChange={(e) => setNewEvidence({ ...newEvidence, exhibitNumber: e.target.value })}
                        placeholder="E.g., Plaintiff Ex. 1"
                        className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">Date Obtained</label>
                      <input
                        type="date"
                        value={newEvidence.dateObtained}
                        onChange={(e) => setNewEvidence({ ...newEvidence, dateObtained: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Name *</label>
                    <input
                      type="text"
                      value={newEvidence.name || ''}
                      onChange={(e) => setNewEvidence({ ...newEvidence, name: e.target.value })}
                      placeholder="E.g., Security Camera Footage"
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Description</label>
                    <textarea
                      value={newEvidence.description || ''}
                      onChange={(e) => setNewEvidence({ ...newEvidence, description: e.target.value })}
                      placeholder="Describe the evidence..."
                      rows={3}
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none"
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">Status</label>
                      <select
                        value={newEvidence.status}
                        onChange={(e) => setNewEvidence({ ...newEvidence, status: e.target.value as any })}
                        className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                      >
                        <option value="pending">Pending</option>
                        <option value="admitted">Admitted</option>
                        <option value="excluded">Excluded</option>
                        <option value="challenged">Challenged</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">Source</label>
                      <input
                        type="text"
                        value={newEvidence.source || ''}
                        onChange={(e) => setNewEvidence({ ...newEvidence, source: e.target.value })}
                        placeholder="E.g., Police Report"
                        className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-6 border-t border-slate-800">
                    <button
                      onClick={() => {
                        setShowAddEvidence(false);
                        setNewEvent({
                          type: 'EVIDENCE' as any,
                          status: 'pending',
                          dateObtained: new Date().toISOString().split('T')[0]
                        });
                      }}
                      className="px-6 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddEvidence}
                      disabled={!newEvidence.name}
                      className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold py-2.5 rounded-xl transition-colors shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_20px_rgba(37,99,235,0.5)] disabled:shadow-none"
                    >
                      Save Evidence
                    </button>
                  </div>
                </div>
             </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default EvidenceTimeline;
