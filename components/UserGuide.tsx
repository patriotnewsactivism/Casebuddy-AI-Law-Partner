
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, ChevronDown, ChevronRight, Mic, Users, BrainCircuit, TrendingUp,
  FileText, Archive, ClipboardList, UserCheck, Mail, Zap, Shield, Network,
  Inbox, PhoneCall, Scale, FileAudio, LayoutDashboard, Gavel, BookMarked,
  Check, ArrowRight, Star, AlertCircle, Lightbulb
} from 'lucide-react';

interface Section {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  route?: string;
  steps: Step[];
  tips?: string[];
  proTip?: string;
}

interface Step {
  title: string;
  body: string;
}

const SECTIONS: Section[] = [
  {
    id: 'start',
    emoji: '🚀',
    title: 'Getting Started',
    subtitle: 'Set up your API key and activate your AI firm in under 60 seconds.',
    steps: [
      {
        title: 'Get your Gemini API key',
        body: 'Visit aistudio.google.com → Sign in with your Google account → Click "Get API Key" → Create a new key. Copy it.',
      },
      {
        title: 'Enter your API key in Settings',
        body: 'Open Settings in the sidebar → paste your Gemini API key into the API Key field → click Save. The app will confirm when the key is valid.',
      },
      {
        title: 'Add your first case',
        body: 'Go to Case Files → click "New Case" → fill in the case name, matter type, status, and any notes. Set it as your active case using the star icon. The Active Case Bar at the top of every screen will show it.',
      },
      {
        title: 'Explore the Dashboard',
        body: "The Dashboard shows your live intake leads, quick actions, case stats, and jump links to every tool. Come back here whenever you need a bird's-eye view.",
      },
    ],
    tips: [
      'Your Gemini API key gives you access to Gemini 2.5 Flash (fast), Gemini 2.5 Pro (deep thinking), and the Live API for voice. One key unlocks everything.',
      'CaseBuddy stores all your cases in your browser\'s localStorage — nothing is sent to a server without your action. Cloud sync requires Supabase (configured by your firm).',
    ],
  },
  {
    id: 'intake',
    emoji: '📞',
    title: 'Voice Intake Pipeline',
    subtitle: 'Send prospects a link. Maya greets them by voice, conducts the intake, and scores the case — automatically.',
    route: '/app/intake-inbox',
    steps: [
      {
        title: 'Get your intake link',
        body: 'Go to Intake Inbox → click "Copy Link" at the top. Your shareable intake URL looks like https://casebuddy.live/intake. Send this to any prospective client via email, text, or your website.',
      },
      {
        title: 'Prospect experience',
        body: 'When the prospect clicks the link, Maya (your AI intake specialist) greets them by voice and asks about their legal situation, the facts, what outcome they\'re seeking, and their jurisdiction. The conversation is warm and professional.',
      },
      {
        title: 'Automatic case scoring',
        body: 'After the call, Gemini analyzes the transcript and scores the case 0–100 based on case strength, legal merit, and fit with your firm. Cases 65+ are marked ACCEPT (green), 45–64 are REVIEW (amber), and below 45 are DENIED (red).',
      },
      {
        title: 'Review in Intake Inbox',
        body: 'Every lead appears in Intake Inbox in real time. You see the score, matter type, recommended department, key factors, and the full transcript. Filter by accepted/needs review/denied.',
      },
      {
        title: 'Accept a lead → auto-deploy the firm',
        body: 'Click "Accept & Open Case" on any lead. CaseBuddy instantly creates a case file and routes you to Firm Command, where all 8 AI agents automatically begin working the case in parallel.',
      },
    ],
    tips: [
      'The intake link is public — anyone can use it. No login required for the prospect.',
      'Intakes sync across devices in real time if Supabase is configured. Otherwise they\'re stored locally.',
      'You can re-send the intake link from any device and all leads will still appear in your Inbox.',
    ],
    proTip: 'Put your intake link in your email signature, on your firm\'s website, and in your Google Business profile. Leads come in 24/7 while you sleep.',
  },
  {
    id: 'firm-command',
    emoji: '⚡',
    title: 'Firm Command — 8-Agent Orchestration',
    subtitle: 'Deploy your entire AI firm on any case with one click. All 8 agents work in parallel and you get a full work product in minutes.',
    route: '/app/firm-command',
    steps: [
      {
        title: 'Select your case',
        body: 'Open Firm Command from the sidebar. Use the dropdown to select the case you want to work on. The active case is pre-selected.',
      },
      {
        title: 'Click "Deploy the Firm"',
        body: 'Hit the Deploy button. Maya starts first, summarizing the case for the rest of the team. Then all 6 specialist agents fire in parallel: Lex (legal research), Sol (motion strategy), Doc (documents), Jules (jury), Rex (evidence), plus your case-specific specialist. Finally, Sierra synthesizes and writes a client update letter.',
      },
      {
        title: 'Watch the agents work in real time',
        body: 'Each agent card pulses while working and shows a progress indicator. When done, click any card to expand and read its full work product. The progress bar fills as agents complete.',
      },
      {
        title: 'Review the full work product',
        body: 'When all agents finish (typically 2–4 minutes), you have: a case summary, legal research memo, motion strategy, key documents drafted, jury analysis, evidence checklist, specialist consultation, and a client-ready letter.',
      },
      {
        title: 'Results are saved automatically',
        body: 'Firm Command saves each run to local storage by case ID. When you come back later, the last run is still there. Run it again at any time to get updated analysis as the case evolves.',
      },
    ],
    tips: [
      'The auto-deploy feature fires automatically when you accept a lead from the Intake Inbox — no extra clicks needed.',
      'Firm Command assigns a specialist agent based on the matter type (e.g., Criminal Defense gets Rex the Evidence Analyst; Family Law gets Jules).',
    ],
    proTip: 'Run Firm Command at the start of every new case and again 48 hours before any major hearing. The updated analysis often surfaces risks you hadn\'t considered.',
  },
  {
    id: 'firm-voice',
    emoji: '🎤',
    title: 'Talk to the Firm — Live Voice Consultation',
    subtitle: 'Have a real-time voice conversation with any of your 8 AI agents. Like a phone call with a specialist.',
    route: '/app/firm',
    steps: [
      {
        title: 'Open "Talk to the Firm"',
        body: 'Click "Talk to the Firm" in the sidebar under Legal Team. You\'ll see the full roster of 8 AI agents, each with their specialty and personality.',
      },
      {
        title: 'Choose an agent',
        body: 'Tap any agent card to start a voice session. Maya handles intake and client relations; Lex handles legal research; Doc handles drafting; Sol handles strategy; Jules handles jury analysis; Rex handles evidence; Sierra synthesizes everything; Max handles billing and client management.',
      },
      {
        title: 'Speak naturally',
        body: 'The session opens with the agent\'s voice greeting. Talk naturally — describe the situation, ask questions, push back. The agent responds in real-time voice. Barge in at any time to interrupt if they\'re going too long.',
      },
      {
        title: 'Read the transcript',
        body: 'Every exchange is transcribed in real-time. After the session, the full transcript is available for review, copy, or export.',
      },
    ],
    tips: [
      'Each agent has a distinct personality. Lex is formal and precise. Maya is warm and methodical. Rex is detail-obsessed. Sol is bold and strategic. Choose based on what you need.',
      'You can barge in mid-sentence — the agent stops speaking and listens. This mirrors how you\'d interrupt a real associate.',
    ],
    proTip: 'Use voice consultation when you\'re driving, in between court appearances, or when you need to think out loud. Talking through a case with Lex often surfaces angles you miss when reading.',
  },
  {
    id: 'legal-team',
    emoji: '⚖️',
    title: 'AI Lawyers — 12 Specialist Consultations',
    subtitle: 'Multi-turn text consultations with AI attorneys who specialize in your practice area. Available 24/7.',
    route: '/app/legal-team',
    steps: [
      {
        title: 'Open AI Lawyers',
        body: 'Click "AI Lawyers" in the sidebar. You\'ll see 12 specialists covering Criminal Defense, Personal Injury, Family Law, Immigration, IP & Patent, Corporate, Employment, Real Estate, Bankruptcy, Civil Litigation, Estate Planning, and Tax Law.',
      },
      {
        title: 'Select a specialist',
        body: 'Click any specialist card to open a consultation. Their system prompt is pre-loaded with their practice area expertise and professional persona.',
      },
      {
        title: 'Start the consultation',
        body: 'Type or speak your question. Include the relevant facts and what specific guidance you need. The specialist will respond with analysis, citations to relevant legal principles, and recommended next steps.',
      },
      {
        title: 'Multi-turn conversation',
        body: 'The conversation maintains context across the session. Follow up, push back, ask hypotheticals. Treat it like you would a call with a colleague in that practice area.',
      },
      {
        title: 'Inject your active case',
        body: 'The active case is automatically injected into the specialist\'s context. They know your case facts without you having to re-explain.',
      },
    ],
    tips: [
      'Quickly check a practice area you don\'t specialize in before a cross-matter question comes up. The specialists are calibrated on their specific area.',
      'If a specialist says something you want to verify, take it to a second specialist in a related area or to Lex for a research confirmation.',
    ],
    proTip: 'Before a deposition, spend 20 minutes with the relevant specialist. Ask them "What questions should I never forget to ask a [witness type] in a [case type] case?" The answers often fill blind spots.',
  },
  {
    id: 'trial-sim',
    emoji: '🎯',
    title: 'Trial Simulator — Live Voice Practice',
    subtitle: 'Argue your case against a live AI opposing counsel. Get real-time objections, coaching, and a score.',
    route: '/app/practice',
    steps: [
      {
        title: 'Open Trial Simulator',
        body: 'Go to Trial Simulator in the sidebar. Select your simulation mode: Learn (coaching-heavy), Practice (balanced), or Trial (realistic — minimal coaching).',
      },
      {
        title: 'Set the trial phase',
        body: 'Choose the phase you want to practice: Opening Statement, Direct Examination, Cross-Examination, Closing Argument, etc. The AI adapts its behavior to the selected phase.',
      },
      {
        title: 'Start speaking',
        body: 'Click the microphone to begin. Make your argument, examine your witness, or deliver your opening. The AI opposing counsel listens and responds in real time with objections, counter-arguments, or witness answers.',
      },
      {
        title: 'Receive coaching',
        body: 'After each exchange, the AI coach evaluates your rhetoric: Did you use leading questions on direct? Were you argumentative? Did you fall into a logical fallacy? The coach gives you a tip and rhetorical effectiveness score.',
      },
      {
        title: 'Review the teleprompter script',
        body: 'After the session, the coaching analysis includes a polished teleprompter-ready version of your argument — cleaned up and strengthened based on what you said.',
      },
    ],
    tips: [
      'Run the trial sim 3–5 times in the 48 hours before trial. By the last run, your arguments should be noticeably tighter.',
      'Practice the phases you\'re weakest in. Most attorneys over-practice opening and under-practice cross.',
    ],
    proTip: 'Record yourself during the simulation session (on a separate device). Watch the playback with the AI coaching notes in hand. The combination of self-observation and AI feedback accelerates improvement faster than either alone.',
  },
  {
    id: 'witness-lab',
    emoji: '🔍',
    title: 'Witness Lab — Cross-Examination Practice',
    subtitle: 'Practice examination of simulated witnesses with distinct personalities — hostile, nervous, evasive, or cooperative.',
    route: '/app/witness-lab',
    steps: [
      {
        title: 'Add or select a witness',
        body: 'Open Witness Lab. You can add a witness from your active case or create a simulation witness with a custom profile (name, background, personality, credibility score).',
      },
      {
        title: 'Choose personality type',
        body: 'Set the witness personality: Cooperative, Nervous, Hostile, or Evasive. The AI tailors its responses accordingly. A hostile witness interrupts and deflects; a nervous one over-explains; an evasive one gives non-answers.',
      },
      {
        title: 'Conduct the examination',
        body: 'Type your questions exactly as you would ask them in court. The AI witness responds in character. If you ask a leading question on direct, a hostile witness may exploit it.',
      },
      {
        title: 'Review the exchange',
        body: 'The full Q&A is logged. Review what worked, what didn\'t, and where the witness succeeded in evading or damaging your examination.',
      },
    ],
    tips: [
      'Always practice cross-examination of your most difficult witness at least three times before trial. The AI gives you a consequence-free environment to test approaches.',
      'Set the witness to "Hostile" even if you expect the real witness to be cooperative. Prepare for the worst.',
    ],
  },
  {
    id: 'witness-prep',
    emoji: '📋',
    title: 'Witness Prep — Preparation Packages',
    subtitle: 'AI generates full witness preparation packages: direct/cross question outlines, impeachment strategy, credibility scoring.',
    route: '/app/witnesses',
    steps: [
      {
        title: 'Add a witness',
        body: 'Open Witness Prep. Click "Add Witness" and enter their name, role (plaintiff, defendant, expert, fact witness), background, and any known biases or vulnerabilities.',
      },
      {
        title: 'Generate prep package',
        body: 'Click "Generate Prep Package." The AI produces: a direct examination outline, cross-examination outline, impeachment strategy (if applicable), credibility assessment, and coaching notes for prepping the witness.',
      },
      {
        title: 'Review and edit',
        body: 'Review the generated questions and notes. Add, remove, or reorder questions. The outline is editable so you can customize it to your style.',
      },
      {
        title: 'Export the package',
        body: 'Export the prep package as a PDF to share with co-counsel or use in your witness prep session.',
      },
    ],
  },
  {
    id: 'jury',
    emoji: '🏛️',
    title: 'Jury Analyzer',
    subtitle: 'AI analysis of juror profiles, bias detection, demographic patterns, and challenge recommendations.',
    route: '/app/jury',
    steps: [
      {
        title: 'Input juror information',
        body: 'Open Jury Analyzer. Enter information about prospective jurors: age, occupation, background, any known associations, and their questionnaire responses.',
      },
      {
        title: 'Run bias analysis',
        body: 'Click "Analyze Panel." The AI evaluates each juror for potential biases — toward or against your client — and flags high-risk individuals.',
      },
      {
        title: 'Review challenge recommendations',
        body: 'The AI recommends which jurors to strike for cause vs. which to use a peremptory challenge on vs. which to keep. It explains the reasoning for each recommendation.',
      },
      {
        title: 'Get voir dire questions',
        body: 'The AI generates customized voir dire questions designed to surface hidden biases in the panel and identify which jurors to rehabilitate or strike.',
      },
    ],
  },
  {
    id: 'jury-sim',
    emoji: '🗳️',
    title: 'Jury Simulator — Live Deliberation',
    subtitle: '6 diverse AI jurors hear your case and deliberate in real time. Get a verdict with confidence scores.',
    route: '/app/jury-sim',
    steps: [
      {
        title: 'Set up your case',
        body: 'Open Jury Simulator. The AI generates 6 diverse juror personas with distinct backgrounds, personalities, and predispositions.',
      },
      {
        title: 'Present your case',
        body: 'Make your opening statement. The AI jurors listen and form initial impressions. Each juror\'s sentiment meter updates as you speak.',
      },
      {
        title: 'Respond to juror concerns',
        body: 'Individual jurors can raise questions or concerns. Respond directly to address them. A hostile juror who is adequately addressed may shift to neutral.',
      },
      {
        title: 'Watch the deliberation',
        body: 'After your presentation, the 6 jurors deliberate in real time. You can observe but not participate. Watch how persuasion plays out between jurors.',
      },
      {
        title: 'Get the verdict',
        body: 'The jury returns a verdict with vote count (e.g., 5-1 for plaintiff), confidence percentage, and juror-by-juror explanation of how they decided.',
      },
    ],
    tips: [
      'Run the jury sim before finalizing your trial themes. If you\'re losing the sim 4-2, the issue is likely in your framing, not your facts.',
    ],
    proTip: 'Run the sim once for each major theme you\'re considering. The theme that produces the strongest verdict is the one to lead with.',
  },
  {
    id: 'deposition',
    emoji: '📝',
    title: 'Deposition Prep',
    subtitle: 'AI-generated deposition question outlines organized by topic, purpose, and legal strategy.',
    route: '/app/deposition',
    steps: [
      {
        title: 'Enter witness and case details',
        body: 'Open Deposition Prep. Provide the witness name, role, what you need to establish, and any documents you plan to use in the deposition.',
      },
      {
        title: 'Generate the outline',
        body: 'Click "Generate Outline." The AI produces a structured question set covering: background/foundation, the key facts you need to pin down, areas of impeachment, document authentication, and closing questions.',
      },
      {
        title: 'Customize the outline',
        body: 'Add your own questions, reorder sections, and annotate with notes about documents or evidence to reference with each question.',
      },
      {
        title: 'Print or export',
        body: 'Export the outline as PDF for use in the deposition room.',
      },
    ],
  },
  {
    id: 'strategy',
    emoji: '🧠',
    title: 'Strategy Room — Deep Case Analysis',
    subtitle: 'Gemini 2.5 Pro with extended thinking analyzes your entire case, identifies risks, predicts opponent tactics, and surfaces opportunities.',
    route: '/app/strategy',
    steps: [
      {
        title: 'Select your case',
        body: 'Open Strategy Room. Your active case context is loaded automatically. You can add additional case notes or documents before running the analysis.',
      },
      {
        title: 'Choose analysis depth',
        body: 'Select Standard (fast) or Deep (Gemini Pro with extended thinking — takes 45–90 seconds but is significantly more thorough). Deep mode uses a 2048-token thinking budget.',
      },
      {
        title: 'Ask a strategic question',
        body: 'You can ask open-ended questions like "What are the three biggest risks in this case?" or "How will opposing counsel approach the damages phase?" or let the AI run a full strategy briefing.',
      },
      {
        title: 'Review the analysis',
        body: 'The AI delivers: case strengths and weaknesses, predicted opponent strategy, recommended trial themes, risk factors, settlement vs. trial calculus, and suggested investigative steps.',
      },
    ],
    tips: [
      'The Strategy Room uses Gemini 2.5 Pro — a more expensive model. Use it for important strategic decisions, not routine queries.',
      'Run Deep analysis before every settlement conference and 7 days before trial.',
    ],
  },
  {
    id: 'verdict',
    emoji: '📊',
    title: 'Verdict & Settlement Predictor',
    subtitle: 'Data-driven win probability, expected verdict range, and settlement sweet-spot analysis.',
    route: '/app/verdict',
    steps: [
      {
        title: 'Enter case details',
        body: 'Open Verdict Predictor. Input your case type, jurisdiction, key facts, damages amount, and any relevant background (prior settlements in similar cases, local jury reputation).',
      },
      {
        title: 'Run the prediction',
        body: 'Click "Predict." The AI returns: win probability percentage, expected verdict range (low/mid/high), settlement sweet spot, and factors that most influence the outcome.',
      },
      {
        title: 'Run scenarios',
        body: 'Adjust the facts and re-run to model different scenarios: "What if we exclude the prior conviction?" "What if we drop the punitive damages claim?" See how each change moves the needle.',
      },
    ],
    tips: [
      'Use the predictor before every settlement negotiation. Knowing your expected verdict range tells you exactly where to draw your BATNA line.',
    ],
  },
  {
    id: 'statements',
    emoji: '🎙️',
    title: 'Statement Builder',
    subtitle: 'Draft opening statements and closing arguments with AI assistance. Includes a teleprompter mode.',
    route: '/app/statements',
    steps: [
      {
        title: 'Select statement type',
        body: 'Open Statement Builder. Choose Opening Statement or Closing Argument. Set the tone (persuasive, emotional, analytical) and target length.',
      },
      {
        title: 'Provide your key themes',
        body: 'Enter 3–5 key themes or points you want to hit. The AI builds a fully structured statement around your themes, incorporating your case facts.',
      },
      {
        title: 'Edit and refine',
        body: 'Review the draft. The editor lets you add, remove, and reorder sections. Ask the AI to strengthen a specific paragraph, add a story, or shorten a section.',
      },
      {
        title: 'Activate teleprompter mode',
        body: 'Click "Teleprompter" to display the statement in large, scrolling text you can read while delivering it. Adjust scroll speed and font size.',
      },
    ],
  },
  {
    id: 'docs',
    emoji: '📄',
    title: 'Drafting Assistant',
    subtitle: 'Motions, demand letters, briefs, discovery requests — drafted in seconds with full legal structure.',
    route: '/app/docs',
    steps: [
      {
        title: 'Choose document type',
        body: 'Open Drafting Assistant. Select from the template library: Motion to Dismiss, Motion in Limine, Demand Letter, Discovery Request, Brief, Contract, or start from scratch.',
      },
      {
        title: 'Provide the context',
        body: 'Enter the relevant facts, the relief you\'re seeking, and any specific arguments you want included. The AI uses your active case context automatically.',
      },
      {
        title: 'Generate the draft',
        body: 'The AI produces a fully formatted legal document with proper section headers, citations format, prayer for relief, and signature block.',
      },
      {
        title: 'Review and finalize',
        body: 'Review carefully. Add your specific case citations, verify all facts, and make any stylistic adjustments. Then export as Word or PDF.',
      },
    ],
    tips: [
      'Always review AI-drafted documents carefully before filing. The AI produces an excellent first draft — your job is to ensure factual accuracy and add specific case citations.',
    ],
    proTip: 'Use Drafting Assistant to produce the skeleton, then spend your time on the substance. You can cut drafting time by 60–70% while spending your energy on argument quality rather than formatting.',
  },
  {
    id: 'transcriber',
    emoji: '🎧',
    title: 'Transcriber & OCR',
    subtitle: 'Convert depositions, hearings, and evidence documents to searchable text with speaker diarization.',
    route: '/app/transcriber',
    steps: [
      {
        title: 'Upload audio or document',
        body: 'Open Transcriber. Upload an audio file (MP3, WAV, M4A) or a document/image (PDF, JPG, PNG). The tool accepts most common formats.',
      },
      {
        title: 'Select mode',
        body: 'For audio: choose Standard transcription or Diarized transcription (identifies individual speakers — essential for depositions with multiple parties). For documents: choose OCR mode.',
      },
      {
        title: 'Process and review',
        body: 'The AI transcribes the file and returns searchable text. Speaker labels appear as [Speaker 1], [Speaker 2], etc. in diarized mode.',
      },
      {
        title: 'Search and export',
        body: 'Use the search function to find specific terms in the transcript. Export as plain text or formatted PDF.',
      },
    ],
    tips: [
      'Transcribe depositions immediately after they occur while you still remember context for ambiguous passages.',
      'Use OCR on evidence documents, police reports, and medical records to make them searchable and quotable.',
    ],
  },
  {
    id: 'evidence',
    emoji: '🗂️',
    title: 'Evidence Vault',
    subtitle: 'Organize, analyze, and track all case evidence with AI-powered document analysis.',
    route: '/app/evidence',
    steps: [
      {
        title: 'Upload evidence',
        body: 'Open Evidence Vault. Upload documents, images, or other evidence files. Tag each item with type (photo, document, contract, medical record) and relevance.',
      },
      {
        title: 'AI document analysis',
        body: 'Click "Analyze" on any document. The AI extracts key facts, identifies legal relevance, flags potential issues, and suggests how the document can be used at trial.',
      },
      {
        title: 'Tag and organize',
        body: 'Tag evidence by case issue, witness, or exhibit number. Filter and sort to quickly find what you need during trial prep.',
      },
      {
        title: 'Export exhibit list',
        body: 'Generate a formatted exhibit list from your vault ready for pre-trial filing.',
      },
    ],
  },
  {
    id: 'client-update',
    emoji: '✉️',
    title: 'Client Updates',
    subtitle: 'Generate professional client status letters and communications in seconds.',
    route: '/app/client-update',
    steps: [
      {
        title: 'Select your client and case',
        body: 'Open Client Updates. Your active case is pre-selected. Choose the update type: Status Update, Settlement Offer Explanation, Hearing Summary, or Custom.',
      },
      {
        title: 'Enter key developments',
        body: 'List the key developments you want to communicate: what happened, what\'s next, what you need from the client.',
      },
      {
        title: 'Generate the letter',
        body: 'The AI drafts a professional, client-friendly letter — clear, reassuring, and free of unnecessary legalese. Calibrated to your client\'s level of legal sophistication.',
      },
      {
        title: 'Send or save',
        body: 'Copy the letter, export as PDF, or send directly via email integration (if configured).',
      },
    ],
    tips: [
      'Send client updates within 24 hours of any significant development. Regular communication is the #1 factor in avoiding bar complaints.',
    ],
  },
  {
    id: 'war-room',
    emoji: '🛡️',
    title: 'War Room',
    subtitle: 'Command center for high-stakes cases: timeline, task lists, team assignments, and real-time status.',
    route: '/app/war-room',
    steps: [
      {
        title: 'Activate for your case',
        body: 'Open War Room with your active case selected. The AI populates a pre-trial checklist based on your case type and timeline.',
      },
      {
        title: 'Build your trial timeline',
        body: 'Add key dates: filing deadlines, depositions, hearings, trial date. The AI flags conflicts and suggests preparation milestones.',
      },
      {
        title: 'Assign tasks',
        body: 'Create tasks and assign them to team members (or AI agents). Track completion status across the entire case.',
      },
    ],
  },
  {
    id: 'foia',
    emoji: '📁',
    title: 'FOIA & Records Center',
    subtitle: 'Draft and track FOIA requests, public records requests, and subpoenas.',
    route: '/app/foia',
    steps: [
      {
        title: 'Start a new request',
        body: 'Open FOIA Center. Select the type: FOIA (federal), state public records, or subpoena. Enter the agency or entity and what records you need.',
      },
      {
        title: 'Generate the request letter',
        body: 'The AI drafts a properly formatted request letter that maximizes your chance of receiving the records promptly — citing the correct statute, requesting the right fee waiver, and using the right legal framing.',
      },
      {
        title: 'Track deadlines',
        body: 'Add the request to your tracker. The app monitors response deadlines and alerts you when an appeal window is approaching.',
      },
    ],
  },
  {
    id: 'deadlines',
    emoji: '⏰',
    title: 'Deadline Tracker',
    subtitle: 'Never miss a filing deadline. The AI tracks all case deadlines and sends alerts.',
    route: '/app/deadlines',
    steps: [
      {
        title: 'Add deadlines',
        body: 'Open Deadline Tracker. Add filing deadlines, discovery cutoffs, hearing dates, and trial dates. Link each deadline to a specific case.',
      },
      {
        title: 'Set alerts',
        body: 'Configure alert timing: 30 days, 7 days, 48 hours, 24 hours before each deadline. Alerts appear in the app and (with Twilio integration) as SMS.',
      },
      {
        title: 'Track completion',
        body: 'Mark deadlines as completed when filed. The tracker maintains a complete history for each case.',
      },
    ],
  },
];

const GuideSection: React.FC<{ section: Section; defaultOpen?: boolean }> = ({ section, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/40">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-slate-800/40 transition-colors"
      >
        <span className="text-2xl shrink-0">{section.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white text-base">{section.title}</span>
            {section.route && (
              <Link
                to={section.route}
                onClick={e => e.stopPropagation()}
                className="text-xs px-2 py-0.5 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-400 hover:bg-gold-500/20 transition-colors"
              >
                Open →
              </Link>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-0.5 line-clamp-1">{section.subtitle}</p>
        </div>
        {open ? <ChevronDown size={18} className="text-slate-400 shrink-0" /> : <ChevronRight size={18} className="text-slate-400 shrink-0" />}
      </button>

      {open && (
        <div className="px-5 pb-6 border-t border-slate-800 pt-5 space-y-5">
          <p className="text-slate-300 text-sm leading-relaxed">{section.subtitle}</p>

          {/* Steps */}
          <div className="space-y-4">
            {section.steps.map((step, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-gold-500/20 border border-gold-500/40 text-gold-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">{step.title}</p>
                  <p className="text-slate-400 text-sm mt-0.5 leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Tips */}
          {section.tips && section.tips.length > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-blue-300 text-xs font-bold mb-2">
                <Lightbulb size={13} />
                TIPS
              </div>
              {section.tips.map((tip, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Check size={13} className="text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-slate-300">{tip}</p>
                </div>
              ))}
            </div>
          )}

          {/* Pro tip */}
          {section.proTip && (
            <div className="bg-gold-500/10 border border-gold-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gold-400 text-xs font-bold mb-2">
                <Star size={13} />
                PRO TIP
              </div>
              <p className="text-sm text-slate-300">{section.proTip}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const UserGuide: React.FC = () => {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? SECTIONS.filter(s =>
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.subtitle.toLowerCase().includes(search.toLowerCase()) ||
        s.steps.some(step => step.title.toLowerCase().includes(search.toLowerCase()) || step.body.toLowerCase().includes(search.toLowerCase()))
      )
    : SECTIONS;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gold-500/20 border border-gold-500/40 flex items-center justify-center text-gold-400 shrink-0">
          <BookOpen size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">CaseBuddy User Guide</h1>
          <p className="text-slate-400 text-sm">Complete attorney reference — every feature, step by step.</p>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Voice Intake', icon: Inbox, route: '/app/intake-inbox' },
          { label: 'Firm Command', icon: Network, route: '/app/firm-command' },
          { label: 'Trial Simulator', icon: Mic, route: '/app/practice' },
          { label: 'AI Lawyers', icon: Scale, route: '/app/legal-team' },
        ].map(({ label, icon: Icon, route }) => (
          <Link key={route} to={route}
            className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-800 bg-slate-900/40 hover:border-gold-500/30 hover:bg-gold-500/5 transition-colors text-center">
            <Icon size={20} className="text-gold-400" />
            <span className="text-xs text-slate-300 font-medium">{label}</span>
          </Link>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search the guide..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-gold-500/50"
      />

      {/* Warning */}
      <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
        <AlertCircle size={16} className="text-amber-400 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-200">CaseBuddy is an AI-assisted tool for licensed attorneys. Always verify AI output before relying on it in any legal proceeding. This is not legal advice.</p>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-500">No results for "{search}"</div>
        )}
        {filtered.map((section, i) => (
          <GuideSection key={section.id} section={section} defaultOpen={i === 0 && !search} />
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-800 pt-6 text-center space-y-2">
        <p className="text-sm text-slate-400">Questions? Contact support at <a href="mailto:support@casebuddy.live" className="text-gold-400 hover:text-gold-300">support@casebuddy.live</a></p>
        <div className="flex justify-center gap-4 text-xs text-slate-600">
          <Link to="/pricing" className="hover:text-slate-400">Pricing</Link>
          <Link to="/privacy-policy" className="hover:text-slate-400">Privacy Policy</Link>
          <Link to="/tos" className="hover:text-slate-400">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
};

export default UserGuide;
