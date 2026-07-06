import { loadCases } from '../utils/storage';
import { getInvoices, exportInvoiceAsMarkdown } from './billingService';
import { loadPipelineState } from './casePipeline';
import { getFirmAnalytics } from './analyticsService';
import { getAuditLog, exportAuditLog } from './auditLogService';
import type { Case, Invoice, PipelineState } from '../types';

export type ExportFormat = 'csv' | 'json' | 'text' | 'markdown';

export interface ExportOptions {
  format: ExportFormat;
  includeCases: boolean;
  includeInvoices: boolean;
  includePipeline: boolean;
  includeAnalytics: boolean;
  includeAuditLog: boolean;
  caseId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ExportResult {
  filename: string;
  content: string;
  format: ExportFormat;
  sizeBytes: number;
  generatedAt: number;
}

const formatDate = (): string => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getExtension = (format: ExportFormat): string => {
  switch (format) {
    case 'csv': return 'csv';
    case 'json': return 'json';
    case 'markdown': return 'md';
    case 'text': return 'txt';
  }
};

const escapeCsvField = (val: string | number | undefined | null): string => {
  const s = val != null ? String(val) : '';
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
};

const csvToRows = (headers: string[], rows: string[][]): string => {
  const headerLine = headers.join(',');
  const dataLines = rows.map(row => row.map(escapeCsvField).join(','));
  return [headerLine, ...dataLines].join('\n');
};

const padColumn = (val: string, width: number): string => {
  return val.length >= width ? val : val + ' '.repeat(width - val.length);
};

const textToColumns = (headers: string[], rows: string[][], colWidths: number[]): string => {
  const divider = colWidths.map(w => '-'.repeat(w)).join('-+-');
  const headerLine = headers.map((h, i) => padColumn(h, colWidths[i])).join(' | ');
  const dataLines = rows.map(row => row.map((v, i) => padColumn(v, colWidths[i])).join(' | '));
  return [headerLine, divider, ...dataLines].join('\n');
};

const filterByDate = <T extends { updatedAt?: string }>(items: T[], from?: string, to?: string): T[] => {
  if (!from && !to) return items;
  return items.filter(item => {
    const itemDate = item.updatedAt;
    if (!itemDate) return false;
    if (from && itemDate < from) return false;
    if (to && itemDate > to) return false;
    return true;
  });
};

export const exportCases = (format: ExportFormat, caseId?: string): string => {
  const cases = loadCases();
  const filtered = caseId ? cases.filter(c => c.id === caseId) : cases;

  if (filtered.length === 0) {
    return format === 'json' ? '[]' : 'No cases to export.';
  }

  const headers = ['id', 'title', 'client', 'status', 'opposingCounsel', 'judge', 'nextCourtDate', 'summary', 'winProbability'];
  const rows = filtered.map(c => [
    c.id,
    c.title,
    c.client,
    c.status,
    c.opposingCounsel,
    c.judge,
    c.nextCourtDate,
    c.summary,
    String(c.winProbability),
  ]);

  switch (format) {
    case 'csv':
      return csvToRows(headers, rows);

    case 'json':
      return JSON.stringify(filtered, null, 2);

    case 'markdown': {
      const lines: string[] = [];
      lines.push('# Cases Export');
      lines.push('');
      lines.push('| ' + headers.join(' | ') + ' |');
      lines.push('|' + headers.map(() => '---').join('|') + '|');
      for (const row of rows) {
        lines.push('| ' + row.map(v => v.replace(/\n/g, ' ')).join(' | ') + ' |');
      }
      return lines.join('\n');
    }

    case 'text': {
      const colWidths = headers.map((h, i) => {
        const maxData = rows.reduce((max, row) => Math.max(max, (row[i] || '').length), 0);
        return Math.max(h.length, Math.min(maxData, 40));
      });
      const lines: string[] = [];
      lines.push('CASES EXPORT');
      lines.push('='.repeat(colWidths.reduce((s, w) => s + w + 3, 0)));
      lines.push(textToColumns(headers, rows, colWidths));
      return lines.join('\n');
    }
  }
};

export const exportInvoices = (format: ExportFormat, caseId?: string): string => {
  const invoices = getInvoices(caseId);

  if (invoices.length === 0) {
    return format === 'json' ? '[]' : 'No invoices to export.';
  }

  const headers = ['number', 'caseTitle', 'clientName', 'status', 'issueDate', 'dueDate', 'total', 'amountPaid', 'notes'];
  const rows = invoices.map(inv => [
    inv.number,
    inv.caseTitle,
    inv.clientName,
    inv.status,
    inv.issueDate,
    inv.dueDate,
    inv.total.toFixed(2),
    (inv.amountPaid || 0).toFixed(2),
    inv.notes || '',
  ]);

  switch (format) {
    case 'csv':
      return csvToRows(headers, rows);

    case 'json':
      return JSON.stringify(invoices, null, 2);

    case 'markdown': {
      const lines: string[] = [];
      lines.push('# Invoices Export');
      lines.push('');
      lines.push('| ' + headers.join(' | ') + ' |');
      lines.push('|' + headers.map(() => '---').join('|') + '|');
      for (const row of rows) {
        lines.push('| ' + row.map(v => v.replace(/\n/g, ' ')).join(' | ') + ' |');
      }
      return lines.join('\n');
    }

    case 'text': {
      const colWidths = headers.map((h, i) => {
        const maxData = rows.reduce((max, row) => Math.max(max, (row[i] || '').length), 0);
        return Math.max(h.length, Math.min(maxData, 30));
      });
      const lines: string[] = [];
      lines.push('INVOICES EXPORT');
      lines.push('='.repeat(colWidths.reduce((s, w) => s + w + 3, 0)));
      lines.push(textToColumns(headers, rows, colWidths));
      return lines.join('\n');
    }
  }
};

export const exportPipelineBriefing = (caseId: string, format: ExportFormat): string | null => {
  const state = loadPipelineState(caseId);
  if (!state || !state.briefing) return null;

  const briefing = state.briefing;

  if (format === 'markdown') {
    const lines: string[] = [];
    lines.push(`# Pipeline Briefing — ${state.caseTitle}`);
    lines.push('');
    lines.push('## Executive Summary');
    lines.push(briefing.executiveSummary);
    lines.push('');
    lines.push('## Case Posture');
    lines.push(briefing.casePosture);
    lines.push('');

    if (briefing.topRisks.length > 0) {
      lines.push('## Top Risks');
      for (const risk of briefing.topRisks) {
        lines.push(`- ${risk}`);
      }
      lines.push('');
    }

    if (briefing.topOpportunities.length > 0) {
      lines.push('## Top Opportunities');
      for (const opp of briefing.topOpportunities) {
        lines.push(`- ${opp}`);
      }
      lines.push('');
    }

    if (briefing.keyFindings.length > 0) {
      lines.push('## Key Findings');
      for (const finding of briefing.keyFindings) {
        lines.push(`- ${finding}`);
      }
      lines.push('');
    }

    if (briefing.recommendedActions.length > 0) {
      lines.push('## Recommended Actions');
      lines.push('');
      lines.push('| Action | Priority | Assigned To |');
      lines.push('|--------|----------|-------------|');
      for (const action of briefing.recommendedActions) {
        lines.push(`| ${action.action} | ${action.priority} | ${action.assignedTo} |`);
      }
      lines.push('');
    }

    if (briefing.nextSteps.length > 0) {
      lines.push('## Next Steps');
      for (const step of briefing.nextSteps) {
        lines.push(`- ${step}`);
      }
      lines.push('');
    }

    lines.push(`*Generated: ${new Date(briefing.generatedAt).toISOString()}*`);
    return lines.join('\n');
  }

  const textLines: string[] = [];
  textLines.push(`PIPELINE BRIEFING — ${state.caseTitle}`);
  textLines.push('='.repeat(60));
  textLines.push('');
  textLines.push('EXECUTIVE SUMMARY');
  textLines.push('-'.repeat(40));
  textLines.push(briefing.executiveSummary);
  textLines.push('');
  textLines.push('CASE POSTURE');
  textLines.push('-'.repeat(40));
  textLines.push(briefing.casePosture);
  textLines.push('');

  if (briefing.topRisks.length > 0) {
    textLines.push('TOP RISKS');
    textLines.push('-'.repeat(40));
    briefing.topRisks.forEach((r, i) => textLines.push(`  ${i + 1}. ${r}`));
    textLines.push('');
  }

  if (briefing.topOpportunities.length > 0) {
    textLines.push('TOP OPPORTUNITIES');
    textLines.push('-'.repeat(40));
    briefing.topOpportunities.forEach((o, i) => textLines.push(`  ${i + 1}. ${o}`));
    textLines.push('');
  }

  if (briefing.keyFindings.length > 0) {
    textLines.push('KEY FINDINGS');
    textLines.push('-'.repeat(40));
    briefing.keyFindings.forEach((f, i) => textLines.push(`  ${i + 1}. ${f}`));
    textLines.push('');
  }

  if (briefing.recommendedActions.length > 0) {
    textLines.push('RECOMMENDED ACTIONS');
    textLines.push('-'.repeat(40));
    briefing.recommendedActions.forEach((a, i) => {
      textLines.push(`  ${i + 1}. [${a.priority.toUpperCase()}] ${a.action} → ${a.assignedTo}`);
    });
    textLines.push('');
  }

  if (briefing.nextSteps.length > 0) {
    textLines.push('NEXT STEPS');
    textLines.push('-'.repeat(40));
    briefing.nextSteps.forEach((s, i) => textLines.push(`  ${i + 1}. ${s}`));
    textLines.push('');
  }

  textLines.push(`Generated: ${new Date(briefing.generatedAt).toISOString()}`);
  return textLines.join('\n');
};

export const exportAnalytics = (format: ExportFormat): string => {
  const analytics = getFirmAnalytics();

  if (format === 'json') {
    return JSON.stringify(analytics, null, 2);
  }

  const scalarFields: { key: string; label: string; value: string }[] = [
    { key: 'totalRevenue', label: 'Total Revenue', value: `$${analytics.totalRevenue.toFixed(2)}` },
    { key: 'revenueThisMonth', label: 'Revenue This Month', value: `$${analytics.revenueThisMonth.toFixed(2)}` },
    { key: 'revenueThisYear', label: 'Revenue This Year', value: `$${analytics.revenueThisYear.toFixed(2)}` },
    { key: 'revenueLastMonth', label: 'Revenue Last Month', value: `$${analytics.revenueLastMonth.toFixed(2)}` },
    { key: 'revenueGrowth', label: 'Revenue Growth', value: `${analytics.revenueGrowth}%` },
    { key: 'averageRevenuePerCase', label: 'Avg Revenue Per Case', value: `$${analytics.averageRevenuePerCase.toFixed(2)}` },
    { key: 'totalCases', label: 'Total Cases', value: String(analytics.totalCases) },
    { key: 'activeCases', label: 'Active Cases', value: String(analytics.activeCases) },
    { key: 'casesOpenedThisMonth', label: 'Cases Opened This Month', value: String(analytics.casesOpenedThisMonth) },
    { key: 'casesClosedThisMonth', label: 'Cases Closed This Month', value: String(analytics.casesClosedThisMonth) },
    { key: 'winRate', label: 'Win Rate', value: `${analytics.winRate}%` },
    { key: 'averageWinProbability', label: 'Avg Win Probability', value: `${analytics.averageWinProbability}%` },
    { key: 'totalHoursBilled', label: 'Total Hours Billed', value: analytics.totalHoursBilled.toFixed(1) },
    { key: 'hoursBilledThisMonth', label: 'Hours Billed This Month', value: analytics.hoursBilledThisMonth.toFixed(1) },
    { key: 'averageHoursPerCase', label: 'Avg Hours Per Case', value: analytics.averageHoursPerCase.toFixed(1) },
    { key: 'utilizationRate', label: 'Utilization Rate', value: `${analytics.utilizationRate}%` },
    { key: 'totalLeads', label: 'Total Leads', value: String(analytics.totalLeads) },
    { key: 'conversionRate', label: 'Conversion Rate', value: `${analytics.conversionRate}%` },
    { key: 'averageRetentionMonths', label: 'Avg Retention (Months)', value: analytics.averageRetentionMonths.toFixed(1) },
    { key: 'casesPerAttorney', label: 'Cases Per Attorney', value: analytics.casesPerAttorney.toFixed(1) },
    { key: 'revenuePerAttorney', label: 'Revenue Per Attorney', value: `$${analytics.revenuePerAttorney.toFixed(2)}` },
    { key: 'overdueInvoiceCount', label: 'Overdue Invoice Count', value: String(analytics.overdueInvoiceCount) },
    { key: 'overdueInvoiceAmount', label: 'Overdue Invoice Amount', value: `$${analytics.overdueInvoiceAmount.toFixed(2)}` },
  ];

  if (format === 'csv') {
    const headers = ['Metric', 'Value'];
    const rows = scalarFields.map(f => [f.label, f.value]);
    return csvToRows(headers, rows);
  }

  if (format === 'markdown') {
    const lines: string[] = [];
    lines.push('# Firm Analytics Export');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    for (const f of scalarFields) {
      lines.push(`| ${f.label} | ${f.value} |`);
    }

    if (analytics.monthlyRevenueTrend.length > 0) {
      lines.push('');
      lines.push('## Monthly Revenue Trend');
      lines.push('');
      lines.push('| Month | Revenue | Cases |');
      lines.push('|-------|---------|-------|');
      for (const m of analytics.monthlyRevenueTrend) {
        lines.push(`| ${m.month} | $${m.revenue.toFixed(2)} | ${m.cases} |`);
      }
    }

    if (analytics.caseTypeDistribution.length > 0) {
      lines.push('');
      lines.push('## Case Type Distribution');
      lines.push('');
      lines.push('| Type | Count | Revenue |');
      lines.push('|------|-------|---------|');
      for (const ct of analytics.caseTypeDistribution) {
        lines.push(`| ${ct.type} | ${ct.count} | $${ct.revenue.toFixed(2)} |`);
      }
    }

    if (analytics.topPerformingCases.length > 0) {
      lines.push('');
      lines.push('## Top Performing Cases');
      lines.push('');
      lines.push('| Case | Revenue | Hours |');
      lines.push('|------|---------|-------|');
      for (const tc of analytics.topPerformingCases) {
        lines.push(`| ${tc.title} | $${tc.revenue.toFixed(2)} | ${tc.hours.toFixed(1)} |`);
      }
    }

    return lines.join('\n');
  }

  const textLines: string[] = [];
  textLines.push('FIRM ANALYTICS EXPORT');
  textLines.push('='.repeat(50));
  textLines.push('');
  const maxLabelLen = scalarFields.reduce((max, f) => Math.max(max, f.label.length), 0);
  for (const f of scalarFields) {
    textLines.push(`  ${padColumn(f.label, maxLabelLen + 2)} ${f.value}`);
  }

  if (analytics.monthlyRevenueTrend.length > 0) {
    textLines.push('');
    textLines.push('MONTHLY REVENUE TREND');
    textLines.push('-'.repeat(40));
    const trendHeaders = ['Month', 'Revenue', 'Cases'];
    const trendColWidths = [10, 12, 8];
    const trendRows = analytics.monthlyRevenueTrend.map(m => [
      m.month,
      `$${m.revenue.toFixed(2)}`,
      String(m.cases),
    ]);
    textLines.push(textToColumns(trendHeaders, trendRows, trendColWidths));
  }

  return textLines.join('\n');
};

export const exportAllPipelineData = (caseId: string): string => {
  const state = loadPipelineState(caseId);
  if (!state) return '# Pipeline Report\n\nNo pipeline state found for this case.';

  const lines: string[] = [];

  lines.push(`# Pipeline Report — ${state.caseTitle}`);
  lines.push('');
  lines.push(`**Status:** ${state.status} | **Progress:** ${state.overallProgress}%`);
  lines.push(`**Started:** ${state.startedAt ? new Date(state.startedAt).toISOString() : 'N/A'}`);
  lines.push(`**Completed:** ${state.completedAt ? new Date(state.completedAt).toISOString() : 'N/A'}`);
  lines.push('');

  if (state.stages.length > 0) {
    lines.push('## Stage Status');
    lines.push('');
    lines.push('| Stage | Status | Started | Completed |');
    lines.push('|-------|--------|---------|-----------|');
    for (const stage of state.stages) {
      const started = stage.startedAt ? new Date(stage.startedAt).toLocaleTimeString() : '-';
      const completed = stage.completedAt ? new Date(stage.completedAt).toLocaleTimeString() : '-';
      lines.push(`| ${stage.label} | ${stage.status} | ${started} | ${completed} |`);
      if (stage.error) {
        lines.push(`  > Error: ${stage.error}`);
      }
    }
    lines.push('');
  }

  if (state.inventory.length > 0) {
    lines.push('## Document Inventory');
    lines.push('');
    lines.push(`*${state.inventory.length} documents*`);
    lines.push('');
    lines.push('| Bates | File | Type | Size | Category |');
    lines.push('|-------|------|------|------|----------|');
    for (const item of state.inventory) {
      const sizeKB = Math.round(item.fileSize / 1024);
      lines.push(`| ${item.batesNumber || '-'} | ${item.fileName} | ${item.fileType} | ${sizeKB}KB | ${item.category || '-'} |`);
      if (item.summary) {
        lines.push(`  > ${item.summary}`);
      }
    }
    lines.push('');
  }

  if (state.entities.length > 0) {
    lines.push('## Entities');
    lines.push('');
    lines.push('| Name | Type | Role | Mentions |');
    lines.push('|------|------|------|----------|');
    for (const entity of state.entities) {
      lines.push(`| ${entity.name} | ${entity.type} | ${entity.role || '-'} | ${entity.mentions} |`);
    }
    lines.push('');
  }

  if (state.chronology.length > 0) {
    lines.push('## Chronology');
    lines.push('');
    lines.push('| Date | Event | Source | Confidence |');
    lines.push('|------|-------|--------|------------|');
    for (const entry of state.chronology) {
      lines.push(`| ${entry.date} | ${entry.title} | ${entry.source} | ${entry.confidence} |`);
      if (entry.description) {
        lines.push(`  > ${entry.description}`);
      }
    }
    lines.push('');
  }

  if (state.contradictions.length > 0) {
    lines.push('## Contradictions');
    lines.push('');
    for (const c of state.contradictions) {
      lines.push(`### ${c.id} [${c.severity.toUpperCase()}]`);
      lines.push('');
      lines.push(c.description);
      lines.push('');
      lines.push(`- **Source A:** ${c.sourceA}`);
      lines.push(`- **Source B:** ${c.sourceB}`);
      lines.push(`- **Detail:** ${c.detail}`);
      lines.push(`- **Implication:** ${c.implication}`);
      lines.push('');
    }
  }

  if (state.constitutionalIssues.length > 0) {
    lines.push('## Constitutional Issues');
    lines.push('');
    for (const ci of state.constitutionalIssues) {
      lines.push(`### ${ci.amendment} Amendment — ${ci.issue} [${ci.severity.toUpperCase()}]`);
      lines.push('');
      lines.push(ci.description);
      lines.push('');
      lines.push(`**Recommendation:** ${ci.recommendation}`);
      lines.push('');
      if (ci.relevantFacts.length > 0) {
        lines.push('**Relevant Facts:**');
        for (const fact of ci.relevantFacts) {
          lines.push(`- ${fact}`);
        }
        lines.push('');
      }
    }
  }

  if (state.motions.length > 0) {
    lines.push('## Motions');
    lines.push('');
    for (const m of state.motions) {
      lines.push(`### ${m.title} [${m.priority.toUpperCase()}]`);
      lines.push('');
      lines.push(`**Type:** ${m.type}`);
      lines.push(`**Basis:** ${m.basis}`);
      if (m.draftContent) {
        lines.push('');
        lines.push(m.draftContent);
      }
      lines.push('');
    }
  }

  if (state.discoveryItems.length > 0) {
    lines.push('## Discovery Plan');
    lines.push('');
    for (const di of state.discoveryItems) {
      lines.push(`### ${di.type} — ${di.target} [${di.priority.toUpperCase()}]`);
      lines.push('');
      lines.push(di.description);
      if (di.draftContent) {
        lines.push('');
        lines.push(di.draftContent);
      }
      lines.push('');
    }
  }

  if (state.gaps.length > 0) {
    lines.push('## Evidence Gaps');
    lines.push('');
    for (const g of state.gaps) {
      lines.push(`- [${g.severity.toUpperCase()}] [${g.category}] ${g.description}`);
      lines.push(`  → ${g.recommendation}`);
    }
    lines.push('');
  }

  if (state.impeachments.length > 0) {
    lines.push('## Impeachment Material');
    lines.push('');
    for (const im of state.impeachments) {
      lines.push(`### ${im.targetName} (${im.targetRole}) [${im.impeachmentValue.toUpperCase()}]`);
      lines.push('');
      lines.push(`**Statement:** ${im.statement}`);
      lines.push(`**Source:** ${im.source}`);
      lines.push(`**Contradiction:** ${im.contradiction}`);
      lines.push('');
      if (im.suggestedQuestions.length > 0) {
        lines.push('**Suggested Cross-Examination Questions:**');
        for (const q of im.suggestedQuestions) {
          lines.push(`- ${q}`);
        }
        lines.push('');
      }
    }
  }

  if (state.witnessQuestions.length > 0) {
    lines.push('## Witness Questions');
    lines.push('');
    for (const wq of state.witnessQuestions) {
      lines.push(`### ${wq.witnessName} (${wq.witnessRole})`);
      lines.push('');

      if (wq.keyTopics.length > 0) {
        lines.push('**Key Topics:** ' + wq.keyTopics.join(', '));
        lines.push('');
      }

      if (wq.directExamination.length > 0) {
        lines.push('**Direct Examination:**');
        for (const q of wq.directExamination) {
          lines.push(`- ${q}`);
        }
        lines.push('');
      }

      if (wq.crossExamination.length > 0) {
        lines.push('**Cross Examination:**');
        for (const q of wq.crossExamination) {
          lines.push(`- ${q}`);
        }
        lines.push('');
      }
    }
  }

  if (state.briefing) {
    lines.push('## Final Briefing');
    lines.push('');
    lines.push('### Executive Summary');
    lines.push(state.briefing.executiveSummary);
    lines.push('');
    lines.push('### Case Posture');
    lines.push(state.briefing.casePosture);
    lines.push('');

    if (state.briefing.topRisks.length > 0) {
      lines.push('### Top Risks');
      for (const risk of state.briefing.topRisks) {
        lines.push(`- ${risk}`);
      }
      lines.push('');
    }

    if (state.briefing.topOpportunities.length > 0) {
      lines.push('### Top Opportunities');
      for (const opp of state.briefing.topOpportunities) {
        lines.push(`- ${opp}`);
      }
      lines.push('');
    }

    if (state.briefing.keyFindings.length > 0) {
      lines.push('### Key Findings');
      for (const finding of state.briefing.keyFindings) {
        lines.push(`- ${finding}`);
      }
      lines.push('');
    }

    if (state.briefing.recommendedActions.length > 0) {
      lines.push('### Recommended Actions');
      lines.push('');
      lines.push('| Action | Priority | Assigned To |');
      lines.push('|--------|----------|-------------|');
      for (const action of state.briefing.recommendedActions) {
        lines.push(`| ${action.action} | ${action.priority} | ${action.assignedTo} |`);
      }
      lines.push('');
    }

    if (state.briefing.nextSteps.length > 0) {
      lines.push('### Next Steps');
      for (const step of state.briefing.nextSteps) {
        lines.push(`- ${step}`);
      }
      lines.push('');
    }

    lines.push(`*Generated: ${new Date(state.briefing.generatedAt).toISOString()}*`);
  }

  return lines.join('\n');
};

export const exportData = (options: ExportOptions): ExportResult => {
  const sections: string[] = [];
  const date = formatDate();

  if (options.includeCases) {
    const casesContent = exportCases(options.format, options.caseId);
    sections.push(casesContent);
  }

  if (options.includeInvoices) {
    const invoicesContent = exportInvoices(options.format, options.caseId);
    sections.push(invoicesContent);
  }

  if (options.includePipeline && options.caseId) {
    const briefing = exportPipelineBriefing(options.caseId, options.format === 'json' ? 'markdown' : options.format);
    if (briefing) {
      sections.push(briefing);
    }
  }

  if (options.includeAnalytics) {
    const analyticsContent = exportAnalytics(options.format);
    sections.push(analyticsContent);
  }

  if (options.includeAuditLog) {
    const auditContent = exportAuditLog(options.format === 'json' ? 'json' : 'csv');
    sections.push(auditContent);
  }

  const content = sections.join('\n\n');
  const ext = options.format === 'json' ? 'json' : options.format === 'csv' ? 'csv' : options.format === 'markdown' ? 'md' : 'txt';

  return {
    filename: `casebuddy-export-${date}.${ext}`,
    content,
    format: options.format,
    sizeBytes: new Blob([content]).size,
    generatedAt: Date.now(),
  };
};

export const downloadExport = (result: ExportResult): void => {
  const mimeMap: Record<string, string> = {
    csv: 'text/csv',
    json: 'application/json',
    markdown: 'text/plain',
    text: 'text/plain',
  };

  const mime = mimeMap[result.format] || 'text/plain';
  const blob = new Blob([result.content], { type: mime });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = result.filename;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => URL.revokeObjectURL(url), 100);
};

export const copyExportToClipboard = async (result: ExportResult): Promise<void> => {
  try {
    await navigator.clipboard.writeText(result.content);
    console.log('[ExportService] Copied to clipboard:', result.filename);
  } catch (err) {
    console.error('[ExportService] Clipboard copy failed:', err);
    throw err;
  }
};
