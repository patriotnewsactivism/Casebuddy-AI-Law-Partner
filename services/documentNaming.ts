/**
 * documentNaming — DiscoveryLens's signature capabilities, as shared helpers.
 *
 * These are the "dial it in" features that make DiscoveryLens the best tool in
 * the arsenal, exposed here so law-partner and Case-Companion get them too:
 *
 *   • intelligentFileName() — rename a document to the firm-standard convention
 *       2026-03-15-Motion-to-Dismiss-ReardonvGalveston
 *     pulling the operative date (signature/filing date for court filings) and
 *     the matter caption from the document's own extracted text.
 *
 *   • nextBatesNumber() / formatBates() — sequential Bates stamping across a
 *     case, shared so every app numbers identically.
 *
 * The date + title extraction is AI-assisted (via the shared /api/ai/chat
 * proxy — free providers first) with a deterministic regex fallback so it
 * still works offline or when AI is unavailable.
 */

import { deepseekChat, parseDeepSeekJson } from './deepseek';

// ── Filename convention ──────────────────────────────────────────────────────

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** Slugify a phrase into TitleCase-Hyphenated for filenames (no spaces/punct). */
export function slugifyTitle(raw: string, maxWords = 8): string {
  const cleaned = (raw || '')
    .replace(/[^\w\s&.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Document';
  return cleaned
    .split(' ')
    .slice(0, maxWords)
    .map(w => (w.length <= 3 && w === w.toLowerCase() && !/^\d/.test(w)
      ? w.toLowerCase()                      // keep short words like "of", "to" lower
      : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('-')
    .replace(/^-+|-+$/g, '');
}

/** Best-effort date extraction from raw document text. Returns YYYY-MM-DD or ''. */
export function extractDateFromText(text: string): string {
  if (!text) return '';
  const t = text.slice(0, 20000); // dates live near the top or signature block

  // 1. ISO 2026-03-15
  const iso = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // 2. "March 15, 2026" / "15 March 2026"
  const named = t.match(/\b([A-Z][a-z]{2,8})\.?\s+(\d{1,2}),?\s+(20\d{2})\b/)
             || t.match(/\b(\d{1,2})\s+([A-Z][a-z]{2,8})\.?\s+(20\d{2})\b/);
  if (named) {
    const monRaw = (named[1].length > 2 && isNaN(Number(named[1]))) ? named[1] : named[2];
    const dayRaw = (named[1].length > 2 && isNaN(Number(named[1]))) ? named[2] : named[1];
    const mon = MONTHS[monRaw.slice(0, 3).toLowerCase()];
    if (mon) return `${named[3]}-${mon}-${dayRaw.padStart(2, '0')}`;
  }

  // 3. MM/DD/YYYY
  const slash = t.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (slash) return `${slash[3]}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;

  return '';
}

export interface IntelligentNameResult {
  filename: string;          // e.g. 2026-03-15-Motion-to-Dismiss-ReardonvGalveston.pdf
  documentDate: string;      // YYYY-MM-DD or ''
  title: string;             // Motion to Dismiss
  caption: string;           // Reardon v Galveston (party-v-party), if found
  method: 'ai' | 'heuristic';
}

const extOf = (name: string): string => {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name || '');
  return m ? `.${m[1].toLowerCase()}` : '';
};

/**
 * Produce the firm-standard filename for a document from its extracted text.
 * For court filings this pulls the DATE from the signature/filing block, the
 * document TITLE (Motion to Dismiss, Complaint, …), and the case CAPTION
 * (Reardon v Galveston) → `2026-03-15-Motion-to-Dismiss-ReardonvGalveston`.
 */
export async function intelligentFileName(
  extractedText: string,
  originalName: string,
  opts: { caseCaption?: string; preferAI?: boolean } = {}
): Promise<IntelligentNameResult> {
  const ext = extOf(originalName) || '.pdf';

  // AI path — best quality; understands "Motion to Dismiss" vs boilerplate.
  if (opts.preferAI !== false && extractedText.trim().length > 40) {
    try {
      const raw = await deepseekChat({
        systemInstruction:
          'You name legal documents to a strict convention. Return ONLY JSON.',
        messages: [{
          role: 'user',
          content:
`From this document's text, extract:
- "date": the operative date in YYYY-MM-DD. For court filings use the FILING or SIGNATURE date (near the signature block / certificate of service), not random dates in the body. If none, "".
- "title": the document type/title in Title Case (e.g. "Motion to Dismiss", "Complaint", "Settlement Agreement", "Deposition of John Smith"). Keep it short.
- "caption": the case caption as "Party v Party" (e.g. "Reardon v Galveston"), short form, no case number. If none, "".

Return {"date","title","caption"}.

TEXT:
${extractedText.slice(0, 8000)}`,
        }],
        temperature: 0.1,
        maxTokens: 300,
        jsonMode: true,
        timeoutMs: 25000,
      });
      const parsed = parseDeepSeekJson<{ date?: string; title?: string; caption?: string }>(raw, {});
      const date = (parsed.date || '').match(/^20\d{2}-\d{2}-\d{2}$/) ? parsed.date! : extractDateFromText(extractedText);
      const title = (parsed.title || '').trim();
      const caption = (parsed.caption || opts.caseCaption || '').trim();
      if (title) {
        const parts = [date, slugifyTitle(title), caption ? slugifyTitle(caption).replace(/-v-/gi, 'v') : '']
          .filter(Boolean);
        return {
          filename: `${parts.join('-')}${ext}`,
          documentDate: date,
          title,
          caption,
          method: 'ai',
        };
      }
    } catch { /* fall through to heuristic */ }
  }

  // Heuristic fallback — deterministic, offline-safe.
  const date = extractDateFromText(extractedText);
  const firstLine = (extractedText.split('\n').map(l => l.trim()).find(l => l.length > 6) || '')
    .slice(0, 60);
  const title = firstLine || originalName.replace(ext, '') || 'Document';
  const caption = opts.caseCaption ? slugifyTitle(opts.caseCaption).replace(/-v-/gi, 'v') : '';
  const parts = [date, slugifyTitle(title), caption].filter(Boolean);
  return {
    filename: `${parts.join('-')}${ext}`,
    documentDate: date,
    title,
    caption: opts.caseCaption || '',
    method: 'heuristic',
  };
}

// ── Bates numbering ──────────────────────────────────────────────────────────

export function formatBates(prefix: string, n: number, pad = 6): string {
  return `${prefix}-${String(n).padStart(pad, '0')}`;
}

/**
 * Next sequential Bates number for a case+prefix, read from the shared
 * documents table so all three apps stamp identically. Returns the integer to
 * use next (caller formats + assigns). Falls back to `start` on any error.
 */
export async function nextBatesNumber(
  caseRowId: string,
  prefix: string,
  start = 1
): Promise<number> {
  try {
    const { getSupabase } = await import('./supabaseClient');
    const sb = getSupabase();
    if (!sb) return start;
    const { data } = await sb
      .from('documents')
      .select('bates_formatted')
      .eq('case_id', caseRowId)
      .eq('bates_prefix', prefix)
      .order('bates_formatted', { ascending: false })
      .limit(1);
    const last = data?.[0]?.bates_formatted as string | undefined;
    const m = last?.match(/(\d+)\s*$/);
    return m ? parseInt(m[1], 10) + 1 : start;
  } catch {
    return start;
  }
}
