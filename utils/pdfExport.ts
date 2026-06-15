/**
 * Opens a print-friendly popup and triggers the browser's native Print → Save as PDF dialog.
 * No external dependencies needed — works on all modern browsers.
 */
export const printAsPdf = (title: string, htmlContent: string): void => {
  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site to export PDFs.');
    return;
  }

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
    @media print {
      body { padding: 20px 40px; }
      @page { margin: 0.75in; }
    }
  </style>
</head>
<body>
  ${htmlContent}
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
