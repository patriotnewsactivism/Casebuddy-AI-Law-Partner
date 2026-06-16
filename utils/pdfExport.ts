export interface LetterheadOptions {
  firmName?: string;
  tagline?: string;
}

const DEFAULT_FIRM_NAME = 'Casebuddy AI Lawfirm';
const DEFAULT_TAGLINE = 'Attorneys & Case Strategy';

/**
 * Opens a print-friendly popup and triggers the browser's native Print → Save as PDF dialog.
 * No external dependencies needed — works on all modern browsers.
 *
 * Pass `letterhead: false` to skip the firm header/footer (e.g. for internal,
 * non-client-facing exports). Defaults to the firm's letterhead.
 */
export const printAsPdf = (
  title: string,
  htmlContent: string,
  letterhead: LetterheadOptions | false = {}
): void => {
  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site to export PDFs.');
    return;
  }

  const firmName = letterhead ? letterhead.firmName || DEFAULT_FIRM_NAME : null;
  const tagline = letterhead ? letterhead.tagline || DEFAULT_TAGLINE : null;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const letterheadHeader = firmName
    ? `<header class="letterhead">
        <div class="letterhead-row">
          <div class="letterhead-mark">⚖</div>
          <div class="letterhead-id">
            <div class="firm-name">${firmName}</div>
            <div class="firm-tagline">${tagline}</div>
          </div>
          <div class="letterhead-date">${today}</div>
        </div>
        <div class="letterhead-rule"></div>
      </header>`
    : '';

  const letterheadFooter = firmName
    ? `<footer class="letterfoot">
        <div class="letterfoot-rule"></div>
        <p>${firmName} — Prepared with AI assistance for attorney review. Confidential &amp; privileged; not for distribution outside the intended recipient.</p>
      </footer>`
    : '';

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Georgia', serif; color: #1a1a1a; background: #fff; padding: 40px 56px; font-size: 13px; line-height: 1.7; }
    h1 { font-size: 22px; font-weight: bold; margin-bottom: 4px; }
    h2 { font-size: 16px; font-weight: bold; margin: 20px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    h3 { font-size: 14px; font-weight: bold; margin: 14px 0 4px; }
    p { margin-bottom: 8px; }
    ul, ol { margin: 8px 0 12px 20px; }
    li { margin-bottom: 4px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 24px; border-bottom: 2px solid #333; padding-bottom: 12px; }
    .section { margin-bottom: 20px; }
    .badge { display: inline-block; background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; padding: 2px 8px; font-size: 11px; font-family: monospace; }
    .highlight { background: #fffbeb; border-left: 3px solid #d97706; padding: 8px 12px; margin: 12px 0; }
    .letterhead { margin-bottom: 28px; }
    .letterhead-row { display: flex; align-items: center; gap: 14px; }
    .letterhead-mark { font-size: 28px; color: #b8860b; line-height: 1; }
    .letterhead-id { flex: 1; }
    .firm-name { font-size: 19px; font-weight: bold; letter-spacing: 0.3px; color: #111; }
    .firm-tagline { font-size: 11px; color: #777; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 1px; }
    .letterhead-date { font-size: 12px; color: #777; white-space: nowrap; }
    .letterhead-rule { height: 3px; margin-top: 12px; background: linear-gradient(90deg, #b8860b, #d4af37 35%, #b8860b 70%, transparent); }
    .letterfoot { margin-top: 36px; }
    .letterfoot-rule { height: 1px; background: #ddd; margin-bottom: 8px; }
    .letterfoot p { color: #888; font-size: 10px; line-height: 1.5; margin: 0; }
    @media print {
      body { padding: 20px 40px; }
      @page { margin: 0.75in; }
    }
  </style>
</head>
<body>
  ${letterheadHeader}
  ${htmlContent}
  ${letterheadFooter}
  <script>window.onload = () => { setTimeout(() => window.print(), 200); };<\/script>
</body>
</html>`);
  win.document.close();
};

/** Converts plain text to simple HTML for the PDF printer. */
export const textToPdfHtml = (title: string, meta: string, body: string): string => {
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const paragraphs = escaped.split('\n\n').map(p =>
    p.trim() ? `<p>${p.replace(/\n/g, '<br/>')}</p>` : ''
  ).join('\n');

  return `
    <h1>${title}</h1>
    <div class="meta">${meta}</div>
    <div class="section">${paragraphs}</div>
  `;
};
