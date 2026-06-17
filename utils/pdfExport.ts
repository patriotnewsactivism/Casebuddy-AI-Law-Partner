/**
 * PDF export with professional firm letterhead.
 *
 * Pulls firm branding from localStorage (set in Settings) to generate
 * properly formatted legal documents with letterhead, date block,
 * addressee, and signature line.
 */

// ─── Firm branding ───────────────────────────────────────────────────────────

interface FirmBranding {
  firmName: string;
  tagline: string;
  whiteLabel: boolean;
}

const loadFirmBranding = (): FirmBranding => {
  try {
    const raw = localStorage.getItem('casebuddy_firm_branding');
    return raw ? JSON.parse(raw) : { firmName: 'CaseBuddy AI Lawfirm', tagline: 'AI-Powered Legal Platform', whiteLabel: false };
  } catch {
    return { firmName: 'CaseBuddy AI Lawfirm', tagline: 'AI-Powered Legal Platform', whiteLabel: false };
  }
};

const loadFirmLogo = (): string | null => {
  try {
    return localStorage.getItem('casebuddy_firm_logo');
  } catch {
    return null;
  }
};

const loadAttorneyInfo = (): { displayName: string; title: string } => {
  try {
    const raw = localStorage.getItem('casebuddy_preferences') || localStorage.getItem('lexsim_preferences');
    const prefs = raw ? JSON.parse(raw) : {};
    return {
      displayName: prefs.displayName || 'Attorney',
      title: prefs.title || '',
    };
  } catch {
    return { displayName: 'Attorney', title: '' };
  }
};

// ─── Letterhead HTML ─────────────────────────────────────────────────────────

const buildLetterhead = (): string => {
  const branding = loadFirmBranding();
  const logo = loadFirmLogo();
  const attorney = loadAttorneyInfo();

  const logoHtml = logo
    ? `<img src="${logo}" alt="${branding.firmName}" style="max-height:48px; max-width:200px; object-fit:contain;" />`
    : '';

  return `
    <div class="letterhead">
      <div class="letterhead-inner">
        ${logoHtml ? `<div class="letterhead-logo">${logoHtml}</div>` : ''}
        <div class="letterhead-text">
          <div class="firm-name">${branding.firmName}</div>
          ${branding.tagline ? `<div class="firm-tagline">${branding.tagline}</div>` : ''}
        </div>
      </div>
      <div class="letterhead-bar"></div>
    </div>
  `;
};

const buildSignatureBlock = (): string => {
  const branding = loadFirmBranding();
  const attorney = loadAttorneyInfo();

  return `
    <div class="signature-block">
      <div class="sig-line"></div>
      <div class="sig-name">${attorney.displayName}</div>
      ${attorney.title ? `<div class="sig-title">${attorney.title}</div>` : ''}
      <div class="sig-firm">${branding.firmName}</div>
    </div>
  `;
};

// ─── PDF styles ──────────────────────────────────────────────────────────────

const PDF_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Georgia', 'Times New Roman', serif;
    color: #1a1a1a;
    background: #fff;
    padding: 40px 56px;
    font-size: 13px;
    line-height: 1.7;
  }

  /* Letterhead */
  .letterhead {
    margin-bottom: 28px;
  }
  .letterhead-inner {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .letterhead-logo img {
    display: block;
  }
  .letterhead-text {
    flex: 1;
  }
  .firm-name {
    font-size: 22px;
    font-weight: bold;
    color: #1a1a1a;
    letter-spacing: 0.5px;
  }
  .firm-tagline {
    font-size: 11px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-top: 2px;
  }
  .letterhead-bar {
    height: 3px;
    background: linear-gradient(90deg, #b8860b, #d4af37, #b8860b);
    margin-top: 12px;
    border-radius: 2px;
  }

  /* Date & address block */
  .date-block {
    margin: 20px 0 24px;
    font-size: 12px;
    color: #444;
  }

  /* Document title */
  h1 {
    font-size: 20px;
    font-weight: bold;
    margin-bottom: 4px;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .doc-meta {
    text-align: center;
    font-size: 11px;
    color: #666;
    margin-bottom: 24px;
    padding-bottom: 12px;
    border-bottom: 1px solid #ddd;
  }

  /* Content */
  h2 { font-size: 16px; font-weight: bold; margin: 20px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h3 { font-size: 14px; font-weight: bold; margin: 14px 0 4px; }
  p { margin-bottom: 8px; text-align: justify; }
  ul, ol { margin: 8px 0 12px 24px; }
  li { margin-bottom: 4px; }
  blockquote {
    margin: 12px 0;
    padding: 8px 16px;
    border-left: 3px solid #d4af37;
    background: #fffbeb;
    font-style: italic;
    color: #333;
  }
  .section { margin-bottom: 20px; }

  /* Signature */
  .signature-block {
    margin-top: 48px;
    page-break-inside: avoid;
  }
  .sig-line {
    width: 220px;
    border-bottom: 1px solid #333;
    margin-bottom: 6px;
  }
  .sig-name {
    font-weight: bold;
    font-size: 14px;
  }
  .sig-title {
    font-size: 12px;
    color: #555;
  }
  .sig-firm {
    font-size: 12px;
    color: #555;
    font-style: italic;
  }

  /* Footer */
  .doc-footer {
    margin-top: 40px;
    padding-top: 12px;
    border-top: 1px solid #ddd;
    font-size: 10px;
    color: #999;
    text-align: center;
  }

  @media print {
    body { padding: 20px 40px; }
    @page { margin: 0.75in; }
  }
`;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Opens a print-friendly popup with firm letterhead and triggers Print → Save as PDF.
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
  <style>${PDF_STYLES}</style>
</head>
<body>
  ${htmlContent}
  <script>window.onload = () => { setTimeout(() => window.print(), 300); };<\/script>
</body>
</html>`);
  win.document.close();
};

/**
 * Converts document title + body text into letterheaded HTML for the PDF printer.
 */
export const textToPdfHtml = (title: string, meta: string, body: string): string => {
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const paragraphs = escaped.split('\n\n').map(p =>
    p.trim() ? `<p>${p.replace(/\n/g, '<br/>')}</p>` : ''
  ).join('\n');

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return `
    ${buildLetterhead()}
    <div class="date-block">${today}</div>
    <h1>${title}</h1>
    <div class="doc-meta">${meta}</div>
    <div class="section">${paragraphs}</div>
    ${buildSignatureBlock()}
    <div class="doc-footer">
      Prepared using CaseBuddy AI &mdash; All content requires attorney review before filing or distribution.
    </div>
  `;
};

/**
 * Generate a formal letter-format HTML (with To/From/Re blocks) for the PDF printer.
 */
export const letterToPdfHtml = (opts: {
  to: string;
  re: string;
  body: string;
  cc?: string;
}): string => {
  const escaped = opts.body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const paragraphs = escaped.split('\n\n').map(p =>
    p.trim() ? `<p>${p.replace(/\n/g, '<br/>')}</p>` : ''
  ).join('\n');

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const attorney = loadAttorneyInfo();

  return `
    ${buildLetterhead()}
    <div class="date-block">
      <p>${today}</p>
      <p style="margin-top:12px; white-space:pre-line;">${opts.to.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>
      <p style="margin-top:8px;"><strong>Re:</strong> ${opts.re.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>
    </div>
    <div class="section">
      <p>Dear ${opts.to.split('\n')[0].replace(/&/g, '&amp;').replace(/</g, '&lt;')}:</p>
      ${paragraphs}
    </div>
    ${buildSignatureBlock()}
    ${opts.cc ? `<div style="margin-top:16px; font-size:11px; color:#666;"><strong>cc:</strong> ${opts.cc}</div>` : ''}
    <div class="doc-footer">
      Prepared using CaseBuddy AI &mdash; All content requires attorney review before filing or distribution.
    </div>
  `;
};
