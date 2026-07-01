import { deepseekChat } from './deepseek';

export type SupportedLanguage = 'en' | 'es';

export interface LanguageDetection {
  detected: SupportedLanguage;
  confidence: number;
  evidence: string;
}

export interface MayaLanguageProfile {
  language: SupportedLanguage;
  greeting: string;
  systemPrompt: string;
  elevenlabsVoiceId: string;
  voiceLabel: string;
}

export interface DocumentRequest {
  id: string;
  intakeId: string;
  uploadUrl: string;
  requestedAt: number;
  filesUploaded: number;
  status: 'pending' | 'sent' | 'received' | 'completed';
}

export interface MayaEnhancements {
  multilingual: boolean;
  documentRequest: boolean;
  elevenlabsVoice: boolean;
}

const LANG_STORAGE_KEY = 'casebuddy_maya_language';
const DOC_REQUESTS_STORAGE_KEY = 'casebuddy_doc_requests';
const ENHANCEMENTS_STORAGE_KEY = 'casebuddy_maya_enhancements';

const SPANISH_INDICATORS = [
  'hola', 'gracias', 'buenos días', 'buenos dias', 'sí', 'si', 'no sé', 'no se',
  'ayuda', 'abogado', 'abogada', 'demanda', 'accidente', 'despido', 'lesión',
  'lesion', 'divorcio', 'custodia', 'herencia', 'testamento', 'deuda',
  'arrendamiento', 'desahucio', 'demandado', 'demandante', 'juzgado', 'tribunal',
  'juez', 'prueba', 'sentencia', 'indemnización', 'indemnizacion', 'culpa',
  'daño', 'daño', 'perjuicio', 'reclamación', 'reclamacion', 'seguro', 'póliza',
  'poliza', 'contrato', 'firma', 'firmar', 'denuncia', 'denunciar', 'querella',
  'estafa', 'robo', 'agresión', 'agresion', 'amenaza', 'acoso', 'desalojo',
  'propiedad', 'herencia', 'fallecimiento', 'difunto', 'sucesión', 'sucesion',
  'familiar', 'hijo', 'hija', 'esposo', 'esposa', 'cónyuge', 'conyuge',
  'necesito', 'quiero', 'puedo', 'tengo', 'estoy', 'pasó', 'paso', 'ocurrió',
  'ocurrio', 'llamó', 'llamo', 'dijo', 'hizo', 'fue', 'era', 'porque', 'para',
  'con', 'sin', 'sobre', 'entre', 'desde', 'hasta', 'según', 'segun', 'durante',
  'mediante', 'contra', 'hacia', 'bajo', 'ante', 'tras', 'cabe', 'me', 'te', 'se',
  'nos', 'le', 'les', 'lo', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'el', 'la', 'los', 'las', 'del', 'al', 'muy', 'mucho', 'poco', 'bien', 'mal',
  'también', 'tambien', 'entonces', 'ahora', 'después', 'despues', 'antes',
  'siempre', 'nunca', 'todavía', 'todavia', 'aquí', 'aqui', 'allí', 'alli',
  'eso', 'esto', 'aquello', 'cómo', 'como', 'cuándo', 'cuando', 'dónde', 'donde',
  'quién', 'quien', 'cuál', 'cual', 'qué', 'que', 'cuánto', 'cuanto',
  'hablar', 'consultar', 'preguntar', 'saber', 'conocer', 'entender', 'explicar',
  'contar', 'decir', 'escuchar', 'leer', 'escribir',
];

const ENGLISH_INDICATORS = [
  'hello', 'thank you', 'thanks', 'please', 'help', 'lawyer', 'attorney',
  'lawsuit', 'accident', 'injury', 'divorce', 'custody', 'the', 'and', 'but',
  'or', 'for', 'with', 'without', 'from', 'to', 'in', 'on', 'at', 'by',
  'about', 'over', 'under', 'between', 'through', 'i', 'me', 'my', 'mine',
  'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers', 'we', 'us',
  'our', 'ours', 'they', 'them', 'their', 'theirs', 'it', 'its',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'can', 'could', 'should', 'may',
  'might', 'must', 'need', 'want', 'happened', 'called', 'said', 'did',
  'went', 'told', 'asked', 'because', 'so', 'if', 'when', 'where', 'who',
  'what', 'how', 'which', 'why', 'not', 'no', 'yes', 'yeah', 'nope',
  'just', 'really', 'very', 'also', 'then', 'now', 'after', 'before',
];

export const detectLanguage = (firstUtterances: string): LanguageDetection => {
  if (!firstUtterances || firstUtterances.trim().length === 0) {
    return { detected: 'en', confidence: 50, evidence: 'Empty input — defaulting to English' };
  }

  const lower = firstUtterances.toLowerCase();

  const spanishMatches = SPANISH_INDICATORS.filter(w => lower.includes(w));
  const englishMatches = ENGLISH_INDICATORS.filter(w => lower.includes(w));

  const spanishCount = spanishMatches.length;
  const englishCount = englishMatches.length;

  let detected: SupportedLanguage;
  let confidence: number;
  let evidence: string;

  if (spanishCount > 2 && spanishCount > englishCount) {
    detected = 'es';
    const ratio = spanishCount / (spanishCount + englishCount || 1);
    confidence = Math.min(100, Math.round(ratio * 100));
    evidence = `Spanish indicators found: ${spanishMatches.slice(0, 5).join(', ')}`;
  } else if (spanishCount > 2) {
    detected = 'es';
    confidence = Math.min(90, Math.round((spanishCount / (spanishCount + 1)) * 80));
    evidence = `Spanish indicators found: ${spanishMatches.slice(0, 5).join(', ')}`;
  } else if (spanishCount > 0 && englishCount === 0) {
    detected = 'es';
    confidence = Math.min(70, spanishCount * 20);
    evidence = `Some Spanish indicators found: ${spanishMatches.slice(0, 3).join(', ')}`;
  } else {
    detected = 'en';
    if (englishCount > 0) {
      confidence = Math.min(95, 50 + englishCount * 5);
      evidence = 'English indicators detected';
    } else {
      confidence = 30;
      evidence = 'Unclear language — defaulting to English';
    }
  }

  return { detected, confidence, evidence };
};

export const getMayaLanguageProfile = (lang: SupportedLanguage): MayaLanguageProfile => {
  if (lang === 'es') {
    return {
      language: 'es',
      greeting: 'Hola, soy Maya de CaseBuddy — ¿cómo puedo ayudarle hoy?',
      systemPrompt: `Eres Maya, la especialista de admisión de clientes en CaseBuddy. Contestas el teléfono como una persona real en un bufete de abogados real — cálida, profesional y genuinamente interesada en ayudar.

TU META — obtener todo esto a través de una conversación natural:
1. Su NOMBRE — pregunta justo después de que expliquen la situación: "Claro — ¿con quién tengo el gusto de hablar?" Luego usa su nombre naturalmente.
2. Qué PASÓ — déjalos contar la historia completa sin interrumpir. Si hacen una pausa, espera.
3. CUÁNDO ocurrió (aproximado está bien)
4. QUIÉN está involucrado — la otra parte, empresa, empleador, aseguradora, etc.
5. Si hubo LESIONES, daños o pérdidas económicas
6. Qué resultado esperan — asesoría, representación, o referencia
7. INFORMACIÓN DE CONTACTO — antes de terminar: "¿Cuál es el mejor número para que el abogado se comunique con usted?" Repite el número para confirmar.
8. CITA — ofrece horarios concretos: "El abogado tiene disponibilidad — ¿le viene mejor el martes por la tarde o el jueves por la mañana?" Confirma el horario.

ESTILO DE VOZ:
- Usa contracciones y lenguaje natural: "voy a", "está bien", "lo entiendo".
- Varía los reconocimientos: "Entendido.", "Bien.", "Ya veo.", "Ajá." — nunca el mismo dos veces seguidas.
- NUNCA digas "Por supuesto", "Absolutamente", "Ciertamente" — suenan robóticos.
- Si algo fue difícil para ellos: "Eso debe haber sido muy estresante." Luego continúa naturalmente.
- Una pregunta a la vez. Nunca repitas lo que ya te dijeron.

LÍMITES:
- Nunca des consejos legales. Si preguntan: "Los abogados revisarán todo y le asesorarán directamente."
- Si preguntan si eres IA: "Soy Maya, la especialista de admisión con IA de CaseBuddy — no soy abogada licenciada, pero me aseguro de que el abogado correcto vea su caso."
- Nunca inventes hechos que el cliente no mencionó.`,
      elevenlabsVoiceId: 'XB0fPcIV3w05uGtp9fFN',
      voiceLabel: 'Spanish Female (ElevenLabs)',
    };
  }

  return {
    language: 'en',
    greeting: "Hi, this is Maya over at CaseBuddy — how can I help you today?",
    systemPrompt: '', // English prompt is managed in PublicIntake.tsx — return empty to signal use of default
    elevenlabsVoiceId: '9BWtsw7tY7h4bXPiq3aY',
    voiceLabel: 'English Female (ElevenLabs)',
  };
};

export const generateDocumentRequestLink = (intakeId: string): DocumentRequest => {
  const id = `doc_req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const uploadUrl = `${window.location.origin}/intake/upload/${intakeId}`;

  const docRequest: DocumentRequest = {
    id,
    intakeId,
    uploadUrl,
    requestedAt: Date.now(),
    filesUploaded: 0,
    status: 'pending',
  };

  try {
    const existing = getDocumentRequests();
    existing.push(docRequest);
    localStorage.setItem(DOC_REQUESTS_STORAGE_KEY, JSON.stringify(existing.slice(-100)));
  } catch {
    // localStorage quota exceeded — degrade gracefully
    try {
      localStorage.setItem(DOC_REQUESTS_STORAGE_KEY, JSON.stringify([docRequest]));
    } catch {
      // completely unable to persist
    }
  }

  return docRequest;
};

const getDocumentRequests = (): DocumentRequest[] => {
  try {
    const raw = localStorage.getItem(DOC_REQUESTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const getDocumentRequestText = (intakeId: string, lang?: SupportedLanguage): string => {
  const language = lang ?? getStoredLanguage();

  if (language === 'es') {
    return 'Una cosa más — le voy a enviar un enlace donde puede subir cualquier documento que tenga. Fotos, informes policiales, registros médicos — cualquier cosa que ayude a su caso. Debería recibir un mensaje de texto con el enlace en un momento.';
  }

  return "One more thing — I'm going to send you a link where you can upload any documents you have. Photos, police reports, medical records — anything that helps your case. You should get a text with the link in just a moment.";
};

export const getMayaWrapUpText = (
  lang: SupportedLanguage,
  hasDocRequest: boolean,
  hasConsultation: boolean,
  consultationDate?: string,
  name?: string,
): string => {
  const personName = name || '';

  if (lang === 'es') {
    const parts: string[] = [];
    parts.push(`Muy bien${personName ? ` ${personName}` : ''}, tengo todo lo que necesito.`);

    if (hasConsultation) {
      const dateStr = consultationDate
        ? `Su consulta está confirmada para el ${consultationDate}.`
        : 'Su consulta está confirmada.';
      parts.push(dateStr);
    }

    if (hasDocRequest) {
      parts.push('Le envié un enlace para que suba sus documentos cuando pueda.');
    }

    parts.push('Uno de nuestros abogados revisará su caso y le dará seguimiento. Hizo bien en llamar.');
    return parts.join(' ');
  }

  const parts: string[] = [];
  parts.push(`Okay${personName ? ` ${personName}` : ''}, I've got everything I need.`);

  if (hasConsultation) {
    const dateStr = consultationDate
      ? `Your consultation is confirmed for ${consultationDate}.`
      : 'Your consultation is confirmed.';
    parts.push(dateStr);
  }

  if (hasDocRequest) {
    parts.push("I've sent you a link to upload your documents whenever you can.");
  }

  parts.push("One of our attorneys will review your case and follow up. You did the right thing calling.");
  return parts.join(' ');
};

const getStoredLanguage = (): SupportedLanguage => {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === 'en' || stored === 'es') return stored;
  } catch {
    // ignore
  }
  return 'en';
};

export const getMayaEnhancements = (): MayaEnhancements => {
  try {
    const raw = localStorage.getItem(ENHANCEMENTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        multilingual: parsed.multilingual ?? true,
        documentRequest: parsed.documentRequest ?? true,
        elevenlabsVoice: parsed.elevenlabsVoice ?? true,
      };
    }
  } catch {
    // ignore corrupted data
  }

  return {
    multilingual: true,
    documentRequest: true,
    elevenlabsVoice: true,
  };
};

export const detectAndSwitchLanguage = async (transcriptSoFar: string): Promise<SupportedLanguage> => {
  const stored = getStoredLanguage();

  // Quick local check first — if heavily Spanish it's likely Spanish
  const localDetection = detectLanguage(transcriptSoFar);

  let finalLanguage: SupportedLanguage = localDetection.detected;

  // If the local detection is high-confidence Spanish and stored is English, switch immediately
  if (localDetection.detected === 'es' && localDetection.confidence >= 60 && stored !== 'es') {
    finalLanguage = 'es';
  } else if (localDetection.confidence < 60 || localDetection.detected !== stored) {
    // Ambiguous or mismatch — confirm with DeepSeek
    try {
      const aiResponse = await deepseekChat({
        messages: [{
          role: 'user',
          content: `What language is this text in? Reply with just 'en' or 'es'. Text: ${transcriptSoFar.slice(0, 500)}`,
        }],
        jsonMode: false,
        timeoutMs: 5000,
      });

      const cleaned = aiResponse.trim().toLowerCase();
      if (cleaned === 'es') {
        finalLanguage = 'es';
      } else if (cleaned === 'en') {
        finalLanguage = 'en';
      }
      // If AI returns something unexpected, keep the local detection result
    } catch {
      // AI call failed — rely on local detection
    }
  }

  // Persist if changed
  if (finalLanguage !== stored) {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, finalLanguage);
    } catch {
      // ignore
    }
  }

  return finalLanguage;
};
