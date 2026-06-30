import type { Case, CaseStatus } from '../types';

export type ImportFormat = 'csv' | 'json';

export interface ImportPreview {
  rows: Record<string, any>[];
  headers: string[];
  detectedType: 'cases' | 'invoices' | 'unknown';
  rowCount: number;
  errors: { row: number; field: string; message: string }[];
  valid: boolean;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  items: Case[];
}

const CASE_HEADERS = ['title', 'client', 'status', 'opposingCounsel', 'judge', 'nextCourtDate', 'summary', 'caseType', 'winProbability'];
const INVOICE_HEADERS = ['number', 'caseTitle', 'clientName', 'status', 'issueDate', 'dueDate', 'total', 'amountPaid', 'notes'];

const VALID_STATUSES: string[] = Object.values(CaseStatus);

const detectImportType = (headers: string[]): 'cases' | 'invoices' | 'unknown' => {
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());
  const hasTitle = lowerHeaders.includes('title');
  const hasClient = lowerHeaders.includes('client');
  const hasNumber = lowerHeaders.includes('number') || lowerHeaders.includes('invoice');
  const hasTotal = lowerHeaders.includes('total') || lowerHeaders.includes('amount');

  if (hasTitle && hasClient) return 'cases';
  if (hasNumber || hasTotal) return 'invoices';
  return 'unknown';
};

export const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }

  result.push(current.trim());
  return result;
};

const normalizeHeader = (header: string): string => {
  return header
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, '')
    .replace(/[^a-z0-9]/g, '');
};

const parseCSV = (raw: string): { headers: string[]; rows: string[][] } => {
  const lines = raw
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(l => parseCSVLine(l));

  return { headers, rows };
};

const parseJSON = (raw: string): { headers: string[]; rows: Record<string, any>[] } => {
  const parsed = JSON.parse(raw);
  let items: Record<string, any>[] = [];

  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (typeof parsed === 'object' && parsed !== null) {
    const possibleArrays = ['cases', 'invoices', 'data', 'items', 'rows', 'results'];
    for (const key of possibleArrays) {
      if (Array.isArray(parsed[key])) {
        items = parsed[key];
        break;
      }
    }
    if (items.length === 0) {
      items = [parsed];
    }
  }

  if (items.length === 0) return { headers: [], rows: [] };

  const headers = Object.keys(items[0]);
  return { headers, rows: items };
};

const buildRowObjects = (headers: string[], csvRows: string[][]): Record<string, any>[] => {
  const normMap = new Map<string, string>();
  for (const h of headers) {
    normMap.set(normalizeHeader(h), h);
  }

  return csvRows.map(row => {
    const obj: Record<string, any> = {};
    for (let i = 0; i < headers.length; i++) {
      if (i < row.length) {
        obj[headers[i]] = row[i];
      }
    }
    return obj;
  });
};

export const validateImportRow = (row: Record<string, any>, index: number): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const normKeys = new Map<string, string>();
  for (const key of Object.keys(row)) {
    normKeys.set(normalizeHeader(key), key);
  }

  const getField = (names: string[]): string | undefined => {
    for (const name of names) {
      const norm = normalizeHeader(name);
      if (normKeys.has(norm)) {
        return row[normKeys.get(norm)!];
      }
    }
    return undefined;
  };

  const title = getField(['title']);
  const client = getField(['client']);
  const status = getField(['status']);
  const winProb = getField(['winProbability', 'winprobability', 'win_probability']);

  if (!title || String(title).trim() === '') {
    errors.push(`Row ${index + 1}: Missing required field "title"`);
  }

  if (!client || String(client).trim() === '') {
    errors.push(`Row ${index + 1}: Missing required field "client"`);
  }

  if (status && String(status).trim() !== '') {
    const statusVal = String(status).trim();
    const match = VALID_STATUSES.find(s => s.toLowerCase() === statusVal.toLowerCase());
    if (!match) {
      errors.push(`Row ${index + 1}: Invalid status "${statusVal}". Must be one of: ${VALID_STATUSES.join(', ')}`);
    }
  }

  if (winProb && String(winProb).trim() !== '') {
    const prob = Number(winProb);
    if (isNaN(prob) || prob < 0 || prob > 100) {
      errors.push(`Row ${index + 1}: winProbability must be a number between 0 and 100`);
    }
  }

  return { valid: errors.length === 0, errors };
};

export const parseImportData = (raw: string, format: ImportFormat): ImportPreview => {
  const errors: { row: number; field: string; message: string }[] = [];

  if (!raw || raw.trim() === '') {
    return {
      rows: [],
      headers: [],
      detectedType: 'unknown',
      rowCount: 0,
      errors: [{ row: 0, field: 'input', message: 'Empty input' }],
      valid: false,
    };
  }

  try {
    let rows: Record<string, any>[] = [];
    let headers: string[] = [];

    if (format === 'csv') {
      const parsed = parseCSV(raw);
      headers = parsed.headers;
      rows = buildRowObjects(headers, parsed.rows);
    } else {
      const parsed = parseJSON(raw);
      headers = parsed.headers;
      rows = parsed.rows;
    }

    if (rows.length === 0) {
      return {
        rows: [],
        headers: [],
        detectedType: 'unknown',
        rowCount: 0,
        errors: [{ row: 0, field: 'input', message: 'No data rows found' }],
        valid: false,
      };
    }

    const detectedType = detectImportType(headers);

    if (detectedType === 'cases') {
      for (let i = 0; i < rows.length; i++) {
        const result = validateImportRow(rows[i], i);
        for (const err of result.errors) {
          const parts = err.split(': ');
          if (parts.length >= 2) {
            errors.push({ row: i, field: parts[0].replace(`Row ${i + 1}: `, ''), message: parts.slice(1).join(': ') });
          } else {
            errors.push({ row: i, field: '', message: err });
          }
        }
      }
    }

    return {
      rows,
      headers,
      detectedType,
      rowCount: rows.length,
      errors,
      valid: errors.length === 0,
    };
  } catch (e) {
    return {
      rows: [],
      headers: [],
      detectedType: 'unknown',
      rowCount: 0,
      errors: [{ row: 0, field: 'parse', message: e instanceof Error ? e.message : 'Failed to parse import data' }],
      valid: false,
    };
  }
};

export const previewImport = (raw: string, format: ImportFormat): ImportPreview => {
  const result = parseImportData(raw, format);
  result.rows = result.rows.slice(0, 5);
  result.rowCount = result.rows.length;
  return result;
};

const resolveField = (row: Record<string, any>, names: string[]): string => {
  const normKeys = new Map<string, string>();
  for (const key of Object.keys(row)) {
    normKeys.set(normalizeHeader(key), key);
  }
  for (const name of names) {
    const norm = normalizeHeader(name);
    const key = normKeys.get(norm);
    if (key) {
      return String(row[key] || '');
    }
  }
  return '';
};

const resolveStatus = (row: Record<string, any>): CaseStatus => {
  const raw = resolveField(row, ['status']);
  if (!raw) return CaseStatus.PRE_TRIAL;
  const match = VALID_STATUSES.find(s => s.toLowerCase() === raw.toLowerCase());
  return match ? (match as CaseStatus) : CaseStatus.PRE_TRIAL;
};

const resolveWinProbability = (row: Record<string, any>): number => {
  const raw = resolveField(row, ['winProbability', 'winprobability', 'win_probability']);
  if (!raw) return Math.floor(Math.random() * 30) + 40;
  const num = Number(raw);
  if (isNaN(num)) return Math.floor(Math.random() * 30) + 40;
  return Math.max(0, Math.min(100, Math.round(num)));
};

const generateId = (): string => {
  return `case_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export const importCases = (preview: ImportPreview, existingCases: Case[]): ImportResult => {
  const errors: string[] = [];
  const items: Case[] = [];
  let imported = 0;
  let skipped = 0;

  for (const row of preview.rows) {
    const title = resolveField(row, ['title']);
    const client = resolveField(row, ['client']);

    if (!title.trim() || !client.trim()) {
      errors.push(`Skipped row: missing title or client`);
      skipped++;
      continue;
    }

    const duplicate = existingCases.find(
      c => c.title.toLowerCase() === title.toLowerCase() && c.client.toLowerCase() === client.toLowerCase()
    );

    if (duplicate) {
      errors.push(`Skipped: duplicate case "${title}" for client "${client}"`);
      skipped++;
      continue;
    }

    const newCase: Case = {
      id: generateId(),
      title: title.trim(),
      client: client.trim(),
      status: resolveStatus(row),
      opposingCounsel: resolveField(row, ['opposingCounsel', 'opposingcounsel', 'opposing_counsel']),
      judge: resolveField(row, ['judge']),
      nextCourtDate: resolveField(row, ['nextCourtDate', 'nextcourtdate', 'next_court_date']),
      summary: resolveField(row, ['summary']),
      winProbability: resolveWinProbability(row),
      updatedAt: new Date().toISOString(),
      caseType: resolveField(row, ['caseType', 'casetype', 'case_type']),
    };

    items.push(newCase);
    imported++;
  }

  return { imported, skipped, errors, items };
};

export const generateCaseTemplate = (format: ImportFormat): string => {
  const headers = ['title', 'client', 'status', 'opposingCounsel', 'judge', 'nextCourtDate', 'summary', 'caseType', 'winProbability'];
  const sample = [
    'Smith v. Johnson',
    'Robert Smith',
    'Pre-Trial',
    'Jane Williams',
    'Hon. Michael Torres',
    '2026-08-15',
    'Personal injury case involving a motor vehicle collision at the intersection of 5th and Main.',
    'Personal Injury',
    '65',
  ];

  if (format === 'csv') {
    return [headers.join(','), sample.join(',')].join('\n');
  }

  const obj: Record<string, any> = {};
  for (let i = 0; i < headers.length; i++) {
    obj[headers[i]] = sample[i];
  }

  return JSON.stringify([obj], null, 2);
};
