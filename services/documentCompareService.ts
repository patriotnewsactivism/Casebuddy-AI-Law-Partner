import { deepseekChat, parseDeepSeekJson } from './deepseek';

export type DiffType = 'added' | 'removed' | 'unchanged' | 'modified';

export interface DiffLine {
  index: number;
  type: DiffType;
  text: string;
  oldText?: string;
}

export interface CompareResult {
  id: string;
  titleA: string;
  titleB: string;
  linesA: DiffLine[];
  linesB: DiffLine[];
  stats: {
    totalLinesA: number;
    totalLinesB: number;
    addedLines: number;
    removedLines: number;
    modifiedLines: number;
    unchangedLines: number;
    changePercentage: number;
  };
  aiSummary: string;
  keyChanges: { description: string; severity: 'major' | 'minor' | 'cosmetic'; lineNumbers: number[] }[];
  createdAt: number;
}

export interface CompareOptions {
  titleA?: string;
  titleB?: string;
  ignoreWhitespace: boolean;
  ignoreCase: boolean;
}

const SIMILARITY_THRESHOLD = 0.6;

function normalizeLine(line: string, options: CompareOptions): string {
  let result = line;
  if (options.ignoreCase) result = result.toLowerCase();
  if (options.ignoreWhitespace) result = result.replace(/\s+/g, ' ').trim();
  return result;
}

function charOverlapRatio(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const c of setA) {
    if (setB.has(c)) intersection++;
  }
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 1 : intersection / union.size;
}

function lcsIndices(linesA: string[], linesB: string[]): [Set<number>, Set<number>] {
  const m = linesA.length;
  const n = linesB.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (linesA[i - 1] === linesB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const matchedA = new Set<number>();
  const matchedB = new Set<number>();

  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (linesA[i - 1] === linesB[j - 1]) {
      matchedA.add(i - 1);
      matchedB.add(j - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return [matchedA, matchedB];
}

function buildDiffLines(
  rawA: string[],
  rawB: string[],
  normalizedA: string[],
  normalizedB: string[],
  options: CompareOptions
): { linesA: DiffLine[]; linesB: DiffLine[] } {
  const [matchedA, matchedB] = lcsIndices(normalizedA, normalizedB);

  const linesA: DiffLine[] = [];
  const linesB: DiffLine[] = [];
  const removedIndices: number[] = [];
  const addedIndices: number[] = [];

  for (let i = 0; i < rawA.length; i++) {
    if (matchedA.has(i)) {
      linesA.push({ index: i, type: 'unchanged', text: rawA[i] });
    } else {
      removedIndices.push(i);
    }
  }

  for (let j = 0; j < rawB.length; j++) {
    if (matchedB.has(j)) {
      linesB.push({ index: j, type: 'unchanged', text: rawB[j] });
    } else {
      addedIndices.push(j);
    }
  }

  const usedAdded = new Set<number>();
  const usedRemoved = new Set<number>();

  for (const ri of removedIndices) {
    let bestMatch = -1;
    let bestScore = 0;

    for (const ai of addedIndices) {
      if (usedAdded.has(ai)) continue;
      const compareA = options.ignoreCase ? rawA[ri].toLowerCase() : rawA[ri];
      const compareB = options.ignoreCase ? rawB[ai].toLowerCase() : rawB[ai];
      const score = charOverlapRatio(compareA, compareB);
      if (score > SIMILARITY_THRESHOLD && score > bestScore) {
        bestScore = score;
        bestMatch = ai;
      }
    }

    if (bestMatch >= 0) {
      usedAdded.add(bestMatch);
      usedRemoved.add(ri);
    }
  }

  const linesAResult: DiffLine[] = [];
  const linesBResult: DiffLine[] = [];

  let aPos = 0;
  for (const line of linesA) {
    if (line.type === 'unchanged') {
      linesAResult.push(line);
    } else {
      const ri = line.index;
      if (usedRemoved.has(ri)) {
        linesAResult.push({ index: ri, type: 'modified', text: rawA[ri] });
      } else {
        linesAResult.push({ index: ri, type: 'removed', text: rawA[ri] });
      }
    }
  }

  let bPos = 0;
  for (const line of linesB) {
    if (line.type === 'unchanged') {
      linesBResult.push(line);
    } else {
      const ai = line.index;
      if (usedAdded.has(ai)) {
        const relatedRemoved = removedIndices.find(ri => {
          const compareA = options.ignoreCase ? rawA[ri].toLowerCase() : rawA[ri];
          const compareB = options.ignoreCase ? rawB[ai].toLowerCase() : rawB[ai];
          return usedRemoved.has(ri) && charOverlapRatio(compareA, compareB) > SIMILARITY_THRESHOLD;
        });
        linesBResult.push({
          index: ai,
          type: 'modified',
          text: rawB[ai],
          oldText: relatedRemoved !== undefined ? rawA[relatedRemoved] : undefined,
        });
      } else {
        linesBResult.push({ index: ai, type: 'added', text: rawB[ai] });
      }
    }
  }

  for (const line of linesAResult) {
    if (line.type === 'modified') {
      const matchingB = linesBResult.find(l => l.type === 'modified' && !l.oldText);
      if (matchingB) {
        matchingB.oldText = line.text;
      }
    }
  }

  return { linesA: linesAResult, linesB: linesBResult };
}

function calculateStats(linesA: DiffLine[], linesB: DiffLine[]): CompareResult['stats'] {
  const totalLinesA = linesA.length;
  const totalLinesB = linesB.length;
  let addedLines = 0;
  let removedLines = 0;
  let modifiedLines = 0;
  let unchangedLines = 0;

  for (const line of linesA) {
    if (line.type === 'removed') removedLines++;
    else if (line.type === 'modified') modifiedLines++;
    else unchangedLines++;
  }

  for (const line of linesB) {
    if (line.type === 'added') addedLines++;
  }

  const totalChanged = addedLines + removedLines + modifiedLines;
  const maxLines = Math.max(totalLinesA, totalLinesB);
  const changePercentage = maxLines > 0 ? Math.round((totalChanged / maxLines) * 100) : 0;

  return {
    totalLinesA,
    totalLinesB,
    addedLines,
    removedLines,
    modifiedLines,
    unchangedLines,
    changePercentage,
  };
}

function sanitizeText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const half = Math.floor(maxLen / 2);
  return text.slice(0, half) + '\n...[truncated]...\n' + text.slice(-half);
}

export const generateChangeSummary = async (
  textA: string,
  textB: string,
  stats: CompareResult['stats']
): Promise<{ summary: string; keyChanges: CompareResult['keyChanges'] }> => {
  try {
    const promptTextA = sanitizeText(textA, 3000);
    const promptTextB = sanitizeText(textB, 3000);

    const response = await deepseekChat({
      systemInstruction: `You are a legal document reviewer. Compare these two documents. Identify the key substantive changes. Ignore formatting differences. Focus on meaningful legal and factual changes. Return ONLY valid JSON. No markdown, no explanation.

Expected structure:
{
  "summary": "string - concise paragraph summarizing the overall nature of the changes",
  "keyChanges": [
    {
      "description": "string - what changed",
      "severity": "major" | "minor" | "cosmetic",
      "lineNumbers": [number, ...]
    }
  ]
}`,
      messages: [
        {
          role: 'user',
          content: `Document A (original):\n\n${promptTextA}\n\n---\n\nDocument B (revised):\n\n${promptTextB}\n\n---\n\nStats: ${stats.addedLines} added, ${stats.removedLines} removed, ${stats.modifiedLines} modified, ${stats.changePercentage}% changed.`,
        },
      ],
      temperature: 0.3,
      maxTokens: 2048,
      jsonMode: true,
      timeoutMs: 30000,
    });

    const parsed = parseDeepSeekJson<{
      summary: string;
      keyChanges: CompareResult['keyChanges'];
    }>(response, { summary: '', keyChanges: [] });

    return {
      summary:
        parsed.summary ||
        `Document revised with ${stats.addedLines} additions, ${stats.removedLines} removals, and ${stats.modifiedLines} modifications (${stats.changePercentage}% changed).`,
      keyChanges: Array.isArray(parsed.keyChanges)
        ? parsed.keyChanges.filter(
            (k) =>
              k &&
              typeof k.description === 'string' &&
              ['major', 'minor', 'cosmetic'].includes(k.severity)
          )
        : [],
    };
  } catch {
    return {
      summary: `Document revised with ${stats.addedLines} additions, ${stats.removedLines} removals, and ${stats.modifiedLines} modifications (${stats.changePercentage}% changed).`,
      keyChanges: [],
    };
  }
};

export const compareDocuments = async (
  textA: string,
  textB: string,
  options: CompareOptions
): Promise<CompareResult> => {
  const titleA = options.titleA || 'Document A';
  const titleB = options.titleB || 'Document B';

  if (!textA.trim() && !textB.trim()) {
    return {
      id: generateId(),
      titleA,
      titleB,
      linesA: [],
      linesB: [],
      stats: {
        totalLinesA: 0,
        totalLinesB: 0,
        addedLines: 0,
        removedLines: 0,
        modifiedLines: 0,
        unchangedLines: 0,
        changePercentage: 0,
      },
      aiSummary: 'Both documents are empty.',
      keyChanges: [],
      createdAt: Date.now(),
    };
  }

  const splitA = textA.split('\n');
  const splitB = textB.split('\n');
  const normalizedA = splitA.map((l) => normalizeLine(l, options));
  const normalizedB = splitB.map((l) => normalizeLine(l, options));

  const { linesA, linesB } = buildDiffLines(splitA, splitB, normalizedA, normalizedB, options);
  const stats = calculateStats(linesA, linesB);

  const { summary: aiSummary, keyChanges } = await generateChangeSummary(textA, textB, stats);

  return {
    id: generateId(),
    titleA,
    titleB,
    linesA,
    linesB,
    stats,
    aiSummary,
    keyChanges,
    createdAt: Date.now(),
  };
};

export const compareDocumentsFromStrings = (
  titleA: string,
  textA: string,
  titleB: string,
  textB: string
): Promise<CompareResult> => {
  return compareDocuments(textA, textB, {
    titleA,
    titleB,
    ignoreWhitespace: true,
    ignoreCase: false,
  });
};

export const exportDiffAsText = (result: CompareResult): string => {
  const lines: string[] = [];
  const s = result.stats;

  lines.push('══════════════════════════════════════════');
  lines.push(`  DOCUMENT COMPARISON REPORT`);
  lines.push(`  ${result.titleA} vs ${result.titleB}`);
  lines.push('══════════════════════════════════════════');
  lines.push('');
  lines.push('STATS');
  lines.push('─────');
  lines.push(`  Lines in A:     ${s.totalLinesA}`);
  lines.push(`  Lines in B:     ${s.totalLinesB}`);
  lines.push(`  Added:          +${s.addedLines}`);
  lines.push(`  Removed:        -${s.removedLines}`);
  lines.push(`  Modified:       ~${s.modifiedLines}`);
  lines.push(`  Unchanged:       ${s.unchangedLines}`);
  lines.push(`  Changed:        ${s.changePercentage}%`);
  lines.push('');

  if (result.aiSummary) {
    lines.push('AI SUMMARY');
    lines.push('──────────');
    lines.push(`  ${result.aiSummary}`);
    lines.push('');
  }

  if (result.keyChanges.length > 0) {
    lines.push('KEY CHANGES');
    lines.push('───────────');
    for (const kc of result.keyChanges) {
      const badge = kc.severity === 'major' ? '[MAJOR]' : kc.severity === 'minor' ? '[MINOR]' : '[COSMETIC]';
      lines.push(`  ${badge} ${kc.description}`);
    }
    lines.push('');
  }

  lines.push('LINE-BY-LINE DIFF');
  lines.push('─────────────────');
  lines.push('');

  const maxLen = Math.max(result.linesA.length, result.linesB.length);
  for (let i = 0; i < maxLen; i++) {
    const lineA = result.linesA[i];
    const lineB = result.linesB[i];

    if (lineA && lineA.type === 'removed') {
      lines.push(`  - ${lineA.text}`);
    }
    if (lineB && lineB.type === 'added') {
      lines.push(`  + ${lineB.text}`);
    }
    if (lineA && lineB && lineA.type === 'modified' && lineB.type === 'modified') {
      lines.push(`  ~ OLD: ${lineA.text}`);
      lines.push(`  ~ NEW: ${lineB.text}`);
    }
    if (lineA && lineA.type === 'unchanged' && lineB && lineB.type === 'unchanged') {
      if (lineA.text.length > 120) {
        lines.push(`    ${lineA.text.slice(0, 120)}...`);
      } else {
        lines.push(`    ${lineA.text}`);
      }
    }
    if (lineA && lineA.type === 'removed' && (!lineB || lineB.type !== 'modified')) {
      // already handled above
    }
    if (lineB && lineB.type === 'added' && (!lineA || lineA.type !== 'modified')) {
      // already handled above
    }
  }

  lines.push('');
  lines.push('══════════════════════════════════════════');
  lines.push(`  Generated: ${new Date(result.createdAt).toLocaleString()}`);
  lines.push('══════════════════════════════════════════');

  return lines.join('\n');
};

function generateId(): string {
  return `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
