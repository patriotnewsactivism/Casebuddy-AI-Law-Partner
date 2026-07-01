export interface CourtCase {
  caseName: string;
  court: string;
  dateFiled: string;
  absoluteUrl: string;
  snippet: string;
}

export const searchCourtListenerCases = async (query: string): Promise<CourtCase[]> => {
  const apiKey = (import.meta.env.VITE_COURTLISTENER_API_KEY as string) ?? '';

  // Only skip if query is empty — API works without a key
  if (!query.trim()) return [];

  // Sanitize: strip special chars, remove noise words, limit length
  const stopWords = new Set(['v', 'vs', 'et', 'al', 'a', 'an', 'the', 'in', 're']);
  const clean = query
    .replace(/[^a-zA-Z0-9\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 1 && !stopWords.has(w.toLowerCase()))
    .slice(0, 6)
    .join(' ')
    .trim();

  if (!clean || clean.length < 3) return [];

  const params = new URLSearchParams({
    q: clean,
    type: 'o',
    format: 'json',
    page_size: '5',
  });

  try {
    // Include auth header if key available, but API also works without one
    const fetchOpts: RequestInit = apiKey
      ? { headers: { Authorization: `Token ${apiKey}` } }
      : {};
    const resp = await fetch(
      `https://www.courtlistener.com/api/rest/v4/search/?${params}`,
      fetchOpts
    );

    // Silently swallow all errors — CourtListener is optional
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
