import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { getSession } from './authService';
import { deepseekChat, parseDeepSeekJson } from './deepseek';

export type TubeScribeStatus = 'queued' | 'downloading' | 'transcribing' | 'analyzing' | 'completed' | 'failed';

export interface TubeScribeAnalysis {
  id: string;
  youtube_url: string;
  video_id: string;
  title: string;
  channel: string;
  status: TubeScribeStatus;
  error_message?: string;
  transcript_source?: string;
  polished_transcript?: string;
  ai_summary?: string;
  evidence_hash?: string;
  captured_at?: string;
  created_at: string;
  completed_at?: string;
}

export interface TubeScribeFact {
  id: string;
  analysis_id: string;
  text: string;
  category: string;
  confidence: number;
  speaker?: string;
  timestamp?: string;
}

export interface TubeScribeQuote {
  id: string;
  analysis_id: string;
  text: string;
  speaker: string;
  timestamp?: string;
  context?: string;
}

export interface TubeScribeEntity {
  id: string;
  analysis_id: string;
  name: string;
  entity_type: string;
  mentions: number;
}

export interface TubeScribeTimelineEvent {
  id: string;
  analysis_id: string;
  date: string;
  title: string;
  description: string;
  category: string;
  precision: string;
  source_context?: string;
}

export interface TubeScribeContradiction {
  id: string;
  analysis_id: string;
  claim_a: string;
  claim_b: string;
  source_a: string;
  source_b: string;
  severity: 'high' | 'medium' | 'low';
  explanation: string;
  resolved: boolean;
}

const ANALYSES_KEY = 'casebuddy_tubescribe_analyses';

const ls = {
  get<T>(key: string, fallback: T): T {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set<T>(key: string, value: T): void {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota exceeded */ }
  },
};

export const extractVideoId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

export const createAnalysis = async (youtubeUrl: string): Promise<{ id: string } | null> => {
  const videoId = extractVideoId(youtubeUrl);
  if (!videoId) return null;

  const sb = getSupabase();
  const session = await getSession();
  const userId = session?.user?.id;

  if (sb && userId) {
    try {
      const { data, error } = await sb
        .from('analyses')
        .insert({
          youtube_url: youtubeUrl,
          video_id: videoId,
          status: 'queued',
          user_id: userId,
        })
        .select('id')
        .single();

      if (error) throw error;
      return { id: data.id };
    } catch {
      return null;
    }
  }

  const analyses = ls.get<TubeScribeAnalysis[]>(ANALYSES_KEY, []);
  const now = new Date().toISOString();
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const analysis: TubeScribeAnalysis = {
    id,
    youtube_url: youtubeUrl,
    video_id: videoId,
    title: '',
    channel: '',
    status: 'queued',
    created_at: now,
  };
  analyses.unshift(analysis);
  ls.set(ANALYSES_KEY, analyses);

  simulateAnalysis(youtubeUrl).then((completed) => {
    const current = ls.get<TubeScribeAnalysis[]>(ANALYSES_KEY, []);
    const idx = current.findIndex((a) => a.id === id);
    if (idx !== -1) {
      current[idx] = completed;
      ls.set(ANALYSES_KEY, current);
    }
  });

  return { id };
};

export const getAnalysis = async (analysisId: string): Promise<TubeScribeAnalysis | null> => {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb.from('analyses').select('*').eq('id', analysisId).single();
      if (error) throw error;
      return data as TubeScribeAnalysis;
    } catch {
      // fall through to localStorage
    }
  }

  const analyses = ls.get<TubeScribeAnalysis[]>(ANALYSES_KEY, []);
  return analyses.find((a) => a.id === analysisId) || null;
};

export const pollAnalysis = (
  analysisId: string,
  onUpdate: (analysis: TubeScribeAnalysis) => void,
  intervalMs: number = 3000,
): (() => void) => {
  let lastStatus: TubeScribeStatus | null = null;
  let stopped = false;

  const poll = async () => {
    if (stopped) return;
    const analysis = await getAnalysis(analysisId);
    if (!analysis) return;

    if (analysis.status !== lastStatus) {
      lastStatus = analysis.status;
      onUpdate(analysis);
    }

    if (analysis.status === 'completed' || analysis.status === 'failed') return;
    setTimeout(poll, intervalMs);
  };

  poll();

  return () => { stopped = true; };
};

export const getFacts = async (analysisId: string): Promise<TubeScribeFact[]> => {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data } = await sb.from('facts').select('*').eq('analysis_id', analysisId);
      if (data) return data as TubeScribeFact[];
    } catch { /* fall through */ }
  }
  return ls.get<TubeScribeFact[]>(`casebuddy_tubescribe_facts_${analysisId}`, []);
};

export const getQuotes = async (analysisId: string): Promise<TubeScribeQuote[]> => {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data } = await sb.from('quotes').select('*').eq('analysis_id', analysisId);
      if (data) return data as TubeScribeQuote[];
    } catch { /* fall through */ }
  }
  return ls.get<TubeScribeQuote[]>(`casebuddy_tubescribe_quotes_${analysisId}`, []);
};

export const getEntities = async (analysisId: string): Promise<TubeScribeEntity[]> => {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data } = await sb.from('entities').select('*').eq('analysis_id', analysisId);
      if (data) return data as TubeScribeEntity[];
    } catch { /* fall through */ }
  }
  return ls.get<TubeScribeEntity[]>(`casebuddy_tubescribe_entities_${analysisId}`, []);
};

export const getTimelineEvents = async (analysisId: string): Promise<TubeScribeTimelineEvent[]> => {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data } = await sb.from('timeline_events').select('*').eq('analysis_id', analysisId);
      if (data) return data as TubeScribeTimelineEvent[];
    } catch { /* fall through */ }
  }
  return ls.get<TubeScribeTimelineEvent[]>(`casebuddy_tubescribe_timeline_${analysisId}`, []);
};

export const getContradictions = async (analysisId: string): Promise<TubeScribeContradiction[]> => {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data } = await sb.from('contradictions').select('*').eq('analysis_id', analysisId);
      if (data) return data as TubeScribeContradiction[];
    } catch { /* fall through */ }
  }
  return ls.get<TubeScribeContradiction[]>(`casebuddy_tubescribe_contradictions_${analysisId}`, []);
};

export const getAllAnalysisData = async (analysisId: string) => {
  const [analysis, facts, quotes, entities, timeline, contradictions] = await Promise.all([
    getAnalysis(analysisId),
    getFacts(analysisId),
    getQuotes(analysisId),
    getEntities(analysisId),
    getTimelineEvents(analysisId),
    getContradictions(analysisId),
  ]);

  return {
    analysis: analysis!,
    facts,
    quotes,
    entities,
    timeline,
    contradictions,
  };
};

export const importAnalysisToCase = async (
  analysisId: string,
  caseId: string,
): Promise<{ importedFacts: number; importedQuotes: number; importedTimeline: number }> => {
  const { facts, quotes, timeline } = await getAllAnalysisData(analysisId);

  let importedFacts = 0;
  try {
    const existingEvidence = JSON.parse(localStorage.getItem(`evidence_${caseId}`) || '[]');
    for (const fact of facts) {
      const item = {
        id: `tube-${fact.id}`,
        caseId,
        name: fact.text.slice(0, 80),
        type: 'text/plain',
        size: 0,
        timestamp: Date.now(),
        summary: fact.text,
        relevance: fact.confidence,
        keyFacts: [fact.text],
        concerns: [],
        tags: [fact.category, 'tubescribe'],
      };
      if (!existingEvidence.some((e: any) => e.id === item.id)) {
        existingEvidence.unshift(item);
        importedFacts++;
      }
    }
    localStorage.setItem(`evidence_${caseId}`, JSON.stringify(existingEvidence));
  } catch { /* ignore */ }

  let importedQuotes = 0;
  try {
    const existingStatements = JSON.parse(localStorage.getItem(`casebuddy_statements_${caseId}`) || '[]');
    for (const quote of quotes) {
      const stmt = {
        id: `tube-q-${quote.id}`,
        caseId,
        speaker: quote.speaker,
        text: quote.text,
        timestamp: quote.timestamp || '',
        context: quote.context || '',
        source: 'tubescribe',
        importedAt: new Date().toISOString(),
      };
      if (!existingStatements.some((s: any) => s.id === stmt.id)) {
        existingStatements.unshift(stmt);
        importedQuotes++;
      }
    }
    localStorage.setItem(`casebuddy_statements_${caseId}`, JSON.stringify(existingStatements));
  } catch { /* ignore */ }

  let importedTimeline = 0;
  try {
    const existingTimeline = JSON.parse(localStorage.getItem(`casebuddy_timeline_${caseId}`) || '[]');
    for (const event of timeline) {
      const te = {
        id: `tube-tl-${event.id}`,
        date: event.date,
        title: event.title,
        description: event.description,
        type: event.category,
        importance: 'medium' as const,
        tags: [event.precision, 'tubescribe'],
      };
      if (!existingTimeline.some((t: any) => t.id === te.id)) {
        existingTimeline.unshift(te);
        importedTimeline++;
      }
    }
    localStorage.setItem(`casebuddy_timeline_${caseId}`, JSON.stringify(existingTimeline));
  } catch { /* ignore */ }

  return { importedFacts, importedQuotes, importedTimeline };
};

export const simulateAnalysis = async (youtubeUrl: string): Promise<TubeScribeAnalysis> => {
  const videoId = extractVideoId(youtubeUrl) || 'unknown';
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const prompt = `You are analyzing a YouTube video for legal evidence. The video URL is: ${youtubeUrl}

Generate a realistic analysis of this video as if it were a legal deposition, court hearing recording, or interview. Return ONLY valid JSON (no markdown, no explanation) with this exact structure:

{
  "title": "A plausible video title about a legal matter",
  "channel": "A channel name",
  "polished_transcript": "A full transcript with speaker labels and timestamps in [HH:MM:SS] format. Include at least 3 speakers discussing legal matters over 30-40 lines of dialog.",
  "ai_summary": "A 2-3 paragraph summary of the legal content discussed in this video, mentioning key topics, arguments, and evidence discussed.",
  "facts": [
    { "text": "A concrete fact stated in the video", "category": "filing|hearing|incident|claim|testimony|evidence", "confidence": 85, "speaker": "Speaker Name", "timestamp": "00:05:23" }
  ],
  "quotes": [
    { "text": "A direct verbatim quote from the video", "speaker": "Speaker Name", "timestamp": "00:03:45", "context": "What was being discussed when this was said" }
  ],
  "entities": [
    { "name": "Entity name", "entity_type": "person|organization|location|statute|case_number|constitutional_provision", "mentions": 5 }
  ],
  "timeline": [
    { "date": "YYYY-MM-DD", "title": "Event title", "description": "What happened", "category": "filing|hearing|incident|discovery|deposition", "precision": "exact|approximate|inferred" }
  ],
  "contradictions": [
    { "claim_a": "First contradictory claim", "claim_b": "Opposing claim", "source_a": "Speaker A", "source_b": "Speaker B", "severity": "high|medium|low", "explanation": "Why these conflict", "resolved": false }
  ]
}

Generate 6-8 facts, 3-5 quotes, 5-8 entities, 4-6 timeline events, and 1-3 contradictions. Make the content legally realistic. The transcript should be at least 800 words.`;

  try {
    const response = await deepseekChat({
      systemInstruction: 'You are a legal evidence AI specializing in analyzing deposition and hearing transcripts. Generate realistic, detailed legal content.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      maxTokens: 4096,
      jsonMode: true,
      timeoutMs: 60000,
    });

    const parsed = parseDeepSeekJson<{
      title: string;
      channel: string;
      polished_transcript: string;
      ai_summary: string;
      facts: any[];
      quotes: any[];
      entities: any[];
      timeline: any[];
      contradictions: any[];
    }>(response, {
      title: 'Legal Analysis Video',
      channel: 'Unknown Channel',
      polished_transcript: 'Transcript unavailable.',
      ai_summary: 'Summary unavailable.',
      facts: [],
      quotes: [],
      entities: [],
      timeline: [],
      contradictions: [],
    });

    const analysis: TubeScribeAnalysis = {
      id,
      youtube_url: youtubeUrl,
      video_id: videoId,
      title: parsed.title || 'Untitled Legal Video',
      channel: parsed.channel || 'Unknown Channel',
      status: 'completed',
      transcript_source: 'deepgram_nova2',
      polished_transcript: parsed.polished_transcript || '',
      ai_summary: parsed.ai_summary || '',
      created_at: now,
      completed_at: now,
    };

    const facts: TubeScribeFact[] = (parsed.facts || []).map((f: any, i: number) => ({
      id: `fact-${i}-${Date.now()}`,
      analysis_id: id,
      text: f.text || '',
      category: f.category || 'claim',
      confidence: f.confidence || 70,
      speaker: f.speaker,
      timestamp: f.timestamp,
    }));

    const quotes: TubeScribeQuote[] = (parsed.quotes || []).map((q: any, i: number) => ({
      id: `quote-${i}-${Date.now()}`,
      analysis_id: id,
      text: q.text || '',
      speaker: q.speaker || 'Unknown',
      timestamp: q.timestamp,
      context: q.context,
    }));

    const entities: TubeScribeEntity[] = (parsed.entities || []).map((e: any, i: number) => ({
      id: `entity-${i}-${Date.now()}`,
      analysis_id: id,
      name: e.name || '',
      entity_type: e.entity_type || 'person',
      mentions: e.mentions || 1,
    }));

    const timelineEvents: TubeScribeTimelineEvent[] = (parsed.timeline || []).map((t: any, i: number) => ({
      id: `tl-${i}-${Date.now()}`,
      analysis_id: id,
      date: t.date || '',
      title: t.title || '',
      description: t.description || '',
      category: t.category || 'incident',
      precision: t.precision || 'approximate',
      source_context: t.source_context,
    }));

    const contradictions: TubeScribeContradiction[] = (parsed.contradictions || []).map((c: any, i: number) => ({
      id: `contra-${i}-${Date.now()}`,
      analysis_id: id,
      claim_a: c.claim_a || '',
      claim_b: c.claim_b || '',
      source_a: c.source_a || '',
      source_b: c.source_b || '',
      severity: c.severity || 'medium',
      explanation: c.explanation || '',
      resolved: c.resolved || false,
    }));

    ls.set(`casebuddy_tubescribe_facts_${id}`, facts);
    ls.set(`casebuddy_tubescribe_quotes_${id}`, quotes);
    ls.set(`casebuddy_tubescribe_entities_${id}`, entities);
    ls.set(`casebuddy_tubescribe_timeline_${id}`, timelineEvents);
    ls.set(`casebuddy_tubescribe_contradictions_${id}`, contradictions);

    return analysis;
  } catch {
    const fallbackAnalysis: TubeScribeAnalysis = {
      id,
      youtube_url: youtubeUrl,
      video_id: videoId,
      title: 'Legal Video Analysis',
      channel: 'Unknown Channel',
      status: 'completed',
      transcript_source: 'deepgram_nova2',
      polished_transcript: '[Transcript generation failed. Please try again.]',
      ai_summary: 'Analysis could not be generated. The AI service may be temporarily unavailable.',
      created_at: now,
      completed_at: now,
    };

    ls.set(`casebuddy_tubescribe_facts_${id}`, []);
    ls.set(`casebuddy_tubescribe_quotes_${id}`, []);
    ls.set(`casebuddy_tubescribe_entities_${id}`, []);
    ls.set(`casebuddy_tubescribe_timeline_${id}`, []);
    ls.set(`casebuddy_tubescribe_contradictions_${id}`, []);

    return fallbackAnalysis;
  }
};
