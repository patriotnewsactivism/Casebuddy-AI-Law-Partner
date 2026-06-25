export interface CourtCase {
  caseName: string;
  court: string;
  dateFiled: string;
  absoluteUrl: string;
  snippet: string;
}

export const searchCourtListenerCases = async (query: string): Promise<CourtCase[]> => {
  const apiKey = (import.meta.env.VITE_COURTLISTENER_API_KEY as string) || '';
  if (!apiKey || !query.trim()) return [];  // no key = skip silently

  // Sanitize: strip special chars, remove noise words (v, et, al, vs), limit length
  const stopWords = new Set(['v', 'vs', 'et', 'al', 'a', 'an', 'the', 'in', 're']);
  const clean = query
    .replace(/[^a-zA-Z0-9\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 1 && !stopWords.has(w.toLowerCase()))
    .slice(0, 6)           // max 6 meaningful tokens
    .join(' ')
    .trim();

  if (!clean) return [];

  const params = new URLSearchParams({
    q: clean,
    type: 'o',
    order_by: 'score',
    format: 'json',
    page_size: '5',
  });

  try {
    const resp = await fetch(
      `https://www.courtlistener.com/api/rest/v4/search/?${params}`,
      { headers: { Authorization: `Token ${apiKey}` } }
    );

    // Silently swallow client errors (400/401/403) — likely bad query or missing key
    if (!resp.ok) return [];
    const data = await resp.json();

    return (data.results ?? []).slice(0, 5).map((r: any) => ({
      caseName: r.caseName ?? r.case_name ?? 'Untitled',
      court: r.court_citation_string ?? r.court ?? '',
      dateFiled: r.dateFiled ?? r.date_filed ?? '',
      absoluteUrl: r.absolute_url ? `https://www.courtlistener.com${r.absolute_url}` : '',
      snippet: r.snippet ?? '',
    }));
  } catch {
    return [];
  }
};