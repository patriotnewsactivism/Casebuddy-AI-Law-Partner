import React, { useState, useContext } from 'react';
import { AppContext } from '../App';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Briefcase, UserX, Calendar, CheckCircle, Scale } from 'lucide-react';
import { LegalCase } from '../types';

const ProSeIntakeWizard = () => {
  const { addCase, setActiveCase } = useContext(AppContext);
  const navigate = useNavigate();
  
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    title: '',
    summary: '',
    opposingCounsel: '',
    nextCourtDate: '',
  });

  const handleNext = () => setStep(s => Math.min(s + 1, 3));
  const handleBack = () => setStep(s => Math.max(s - 1, 1));
  
  const handleSubmit = () => {
    const newCase: LegalCase = {
      id: `case-${Date.now()}`,
      title: formData.title || 'Untitled Case',
      client: 'Myself (Pro Se)',
      status: 'Active',
      summary: formData.summary,
      opposingCounsel: formData.opposingCounsel || 'Unknown',
      nextCourtDate: formData.nextCourtDate || 'TBD',
      trialDate: 'TBD',
      documents: 0,
      winProbability: 50,
      createdAt: new Date().toISOString()
    };
    
    addCase(newCase);
    setActiveCase(newCase);
    navigate('/app');
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        
        {/* Progress Tracker */}
        <div className="flex items-center justify-between mb-8 relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-800 -z-10 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${((step - 1) / 2) * 100}%` }} />
          </div>
          
          {[
            { num: 1, icon: Briefcase, label: 'The Basics' },
            { num: 2, icon: UserX, label: 'The Opponent' },
            { num: 3, icon: Calendar, label: 'Dates' }
          ].map(s => {
            const Icon = s.icon;
            const isActive = step >= s.num;
            const isCurrent = step === s.num;
            return (
              <div key={s.num} className="flex flex-col items-center gap-2">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 transition-colors duration-500 ${
                  isActive ? 'bg-blue-600 border-slate-900 text-white' : 'bg-slate-800 border-slate-900 text-slate-500'
                } ${isCurrent ? 'ring-4 ring-blue-500/30' : ''}`}>
                  <Icon size={20} />
                </div>
                <span className={`text-xs font-bold uppercase tracking-wider ${isActive ? 'text-blue-400' : 'text-slate-500'}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Form Container */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
          
          <div className="relative z-10 min-h-[300px]">
            {step === 1 && (
              <div className="animate-fadeIn">
                <h2 className="text-3xl font-bold text-white mb-2 font-serif">Let's start with the basics</h2>
                <p className="text-slate-400 mb-8">Give your case a name and briefly describe what it's about.</p>
                
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Case Name</label>
                    <input 
                      type="text" 
                      value={formData.title}
                      onChange={e => setFormData({...formData, title: e.target.value})}
                      placeholder="e.g. Smith vs. Landlord" 
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">What is this case about?</label>
                    <textarea 
                      value={formData.summary}
                      onChange={e => setFormData({...formData, summary: e.target.value})}
                      placeholder="Briefly describe the dispute in plain English..." 
                      rows={4}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="animate-fadeIn">
                <h2 className="text-3xl font-bold text-white mb-2 font-serif">Who are you up against?</h2>
                <p className="text-slate-400 mb-8">Enter the name of the opposing party or their lawyer.</p>
                
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Opposing Party / Counsel</label>
                    <input 
                      type="text" 
                      value={formData.opposingCounsel}
                      onChange={e => setFormData({...formData, opposingCounsel: e.target.value})}
                      placeholder="e.g. Acme Corp / John Doe" 
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-lg"
                    />
                  </div>
                  
                  <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4 flex gap-3">
                    <Scale className="text-blue-400 shrink-0 mt-0.5" size={20} />
                    <p className="text-sm text-blue-200">
                      Don't worry if you don't know their lawyer's name yet. You can always update this later in your case settings.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="animate-fadeIn">
                <h2 className="text-3xl font-bold text-white mb-2 font-serif">Important Dates</h2>
                <p className="text-slate-400 mb-8">When is your next court appearance or deadline?</p>
                
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Next Court Date (Optional)</label>
                    <input 
                      type="date" 
                      value={formData.nextCourtDate}
                      onChange={e => setFormData({...formData, nextCourtDate: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-lg"
                    />
                  </div>
                  
                  <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 mt-8">
                    <h3 className="text-white font-bold mb-1">Ready to build your case?</h3>
                    <p className="text-sm text-slate-400">
                      Once created, you can start uploading evidence, consulting the AI lawyers, and practicing your arguments.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-800">
            <button 
              onClick={handleBack}
              disabled={step === 1}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all ${
                step === 1 ? 'opacity-0 pointer-events-none' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <ChevronLeft size={18} /> Back
            </button>
            
            {step < 3 ? (
              <button 
                onClick={handleNext}
                disabled={step === 1 && !formData.title}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-bold transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_20px_rgba(37,99,235,0.5)]"
              >
                Continue <ChevronRight size={18} />
              </button>
            ) : (
              <button 
                onClick={handleSubmit}
                className="flex items-center gap-2 px-8 py-2.5 bg-gold-600 hover:bg-gold-500 text-slate-900 rounded-xl font-bold transition-all shadow-[0_0_15px_rgba(212,175,55,0.3)] hover:shadow-[0_0_20px_rgba(212,175,55,0.5)]"
              >
                Create Case <CheckCircle size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProSeIntakeWizard;
