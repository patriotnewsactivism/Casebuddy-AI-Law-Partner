
export interface CourtCase {
  caseName: string;
  court: string;
  dateFiled: string;
  absoluteUrl: string;
  snippet: string;
}

export const searchCourtListenerCases = async (query: string): Promise<CourtCase[]> => {
  const apiKey = import.meta.env.VITE_COURTLISTENER_API_KEY;
  if (!apiKey || !query.trim()) return [];

  const params = new URLSearchParams({
    q: query.trim(),
    type: 'o',
    order_by: 'score',
    format: 'json',
    page_size: '5',
  });

  const resp = await fetch(
    `https://www.courtlistener.com/api/rest/v4/search/?${params}`,
    { headers: { Authorization: `Token ${apiKey}` } }
  );

  if (!resp.ok) return [];
  const data = await resp.json();

  return (data.results ?? []).slice(0, 5).map((r: any) => ({
    caseName: r.caseName ?? r.case_name ?? 'Untitled',
    court: r.court_citation_string ?? r.court ?? '',
    dateFiled: r.dateFiled ?? r.date_filed ?? '',
    absoluteUrl: r.absolute_url ? `https://www.courtlistener.com${r.absolute_url}` : '',
    snippet: r.snippet ?? '',
  }));
};
