import type { Invoice, InvoiceLineItem, InvoiceStatus, TimeEntry, Expense, Retainer, Payment, BillingRate, BillingDashboard } from '../types';

const KEYS = {
  INVOICES: 'casebuddy_invoices',
  TIME_ENTRIES: 'casebuddy_time_entries',
  EXPENSES: 'casebuddy_expenses',
  RETAINERS: 'casebuddy_retainers',
  PAYMENTS: 'casebuddy_payments',
  BILLING_RATES: 'casebuddy_billing_rates',
};

// ─── Generic helpers ────────────────────────────────────────────────────────────

const loadItems = <T>(key: string): T[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveItems = <T>(key: string, items: T[]): void => {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // storage full or unavailable — silently ignore
  }
};

export const generateId = (): string =>
  `billing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// ─── Billing Rates ──────────────────────────────────────────────────────────────

export const getRates = (): BillingRate[] => loadItems<BillingRate>(KEYS.BILLING_RATES);

export const saveRate = (rate: BillingRate): void => {
  const rates = getRates();
  const idx = rates.findIndex(r => r.id === rate.id);
  if (idx >= 0) {
    rates[idx] = rate;
  } else {
    rates.push(rate);
  }
  saveItems(KEYS.BILLING_RATES, rates);
};

export const deleteRate = (id: string): void => {
  const rates = getRates().filter(r => r.id !== id);
  saveItems(KEYS.BILLING_RATES, rates);
};

export const getDefaultRate = (): number => {
  const rates = getRates();
  const hourly = rates.find(r => r.frequency === 'hourly');
  return hourly?.rate ?? 250;
};

// ─── Time Entries ───────────────────────────────────────────────────────────────

export const getTimeEntries = (caseId?: string): TimeEntry[] => {
  const entries = loadItems<TimeEntry>(KEYS.TIME_ENTRIES);
  if (!caseId) return entries;
  return entries.filter(e => e.caseId === caseId);
};

export const saveTimeEntry = (entry: TimeEntry): void => {
  const entries = loadItems<TimeEntry>(KEYS.TIME_ENTRIES);
  const idx = entries.findIndex(e => e.id === entry.id);
  if (idx >= 0) {
    entries[idx] = entry;
  } else {
    entries.push(entry);
  }
  saveItems(KEYS.TIME_ENTRIES, entries);
};

export const deleteTimeEntry = (id: string): void => {
  const entries = loadItems<TimeEntry>(KEYS.TIME_ENTRIES).filter(e => e.id !== id);
  saveItems(KEYS.TIME_ENTRIES, entries);
};

export const getUnbilledTime = (caseId: string): TimeEntry[] => {
  return getTimeEntries(caseId).filter(e => !e.billed);
};

export const getTotalUnbilledTime = (caseId: string): { hours: number; amount: number } => {
  const unbilled = getUnbilledTime(caseId);
  return {
    hours: unbilled.reduce((sum, e) => sum + e.hours, 0),
    amount: unbilled.reduce((sum, e) => sum + e.amount, 0),
  };
};

export const markTimeBilled = (ids: string[], invoiceId: string): void => {
  const entries = loadItems<TimeEntry>(KEYS.TIME_ENTRIES);
  for (const entry of entries) {
    if (ids.includes(entry.id)) {
      entry.billed = true;
      entry.invoiceId = invoiceId;
    }
  }
  saveItems(KEYS.TIME_ENTRIES, entries);
};

// ─── Expenses ───────────────────────────────────────────────────────────────────

export const getExpenses = (caseId?: string): Expense[] => {
  const expenses = loadItems<Expense>(KEYS.EXPENSES);
  if (!caseId) return expenses;
  return expenses.filter(e => e.caseId === caseId);
};

export const saveExpense = (expense: Expense): void => {
  const expenses = loadItems<Expense>(KEYS.EXPENSES);
  const idx = expenses.findIndex(e => e.id === expense.id);
  if (idx >= 0) {
    expenses[idx] = expense;
  } else {
    expenses.push(expense);
  }
  saveItems(KEYS.EXPENSES, expenses);
};

export const deleteExpense = (id: string): void => {
  const expenses = loadItems<Expense>(KEYS.EXPENSES).filter(e => e.id !== id);
  saveItems(KEYS.EXPENSES, expenses);
};

export const getUnbilledExpenses = (caseId: string): Expense[] => {
  return getExpenses(caseId).filter(e => !e.billed);
};

export const getTotalUnbilledExpenses = (caseId: string): number => {
  return getUnbilledExpenses(caseId).reduce((sum, e) => sum + e.amount, 0);
};

export const markExpensesBilled = (ids: string[], invoiceId: string): void => {
  const expenses = loadItems<Expense>(KEYS.EXPENSES);
  for (const expense of expenses) {
    if (ids.includes(expense.id)) {
      expense.billed = true;
      expense.invoiceId = invoiceId;
    }
  }
  saveItems(KEYS.EXPENSES, expenses);
};

// ─── Invoices ───────────────────────────────────────────────────────────────────

export const getInvoices = (caseId?: string): Invoice[] => {
  const invoices = loadItems<Invoice>(KEYS.INVOICES);
  const sorted = invoices.sort((a, b) => b.createdAt - a.createdAt);
  if (!caseId) return sorted;
  return sorted.filter(i => i.caseId === caseId);
};

export const saveInvoice = (invoice: Invoice): void => {
  const invoices = loadItems<Invoice>(KEYS.INVOICES);
  const idx = invoices.findIndex(i => i.id === invoice.id);
  if (idx >= 0) {
    invoices[idx] = invoice;
  } else {
    invoices.push(invoice);
  }
  saveItems(KEYS.INVOICES, invoices);
};

export const deleteInvoice = (id: string): void => {
  const invoices = loadItems<Invoice>(KEYS.INVOICES).filter(i => i.id !== id);
  saveItems(KEYS.INVOICES, invoices);
};

export const generateInvoiceNumber = (): string => {
  const invoices = loadItems<Invoice>(KEYS.INVOICES);
  const year = new Date().getFullYear();
  const count = invoices.length;
  return `INV-${year}-${String(count + 1).padStart(4, '0')}`;
};

export const createInvoice = (
  caseId: string,
  caseTitle: string,
  clientName: string,
  clientEmail?: string,
  timeEntryIds?: string[],
  expenseIds?: string[],
  notes?: string,
): Invoice => {
  const now = Date.now();
  const today = new Date().toISOString().split('T')[0];

  // 30 days from now for due date
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const dueDateStr = dueDate.toISOString().split('T')[0];

  const lineItems: InvoiceLineItem[] = [];

  // Time entries
  const timeSource = timeEntryIds
    ? getTimeEntries(caseId).filter(e => timeEntryIds.includes(e.id))
    : getUnbilledTime(caseId);

  for (const entry of timeSource) {
    lineItems.push({
      id: generateId(),
      type: 'time',
      description: entry.description,
      date: entry.date,
      hours: entry.hours,
      rate: entry.rate,
      amount: entry.amount,
      sourceId: entry.id,
    });
  }

  // Expenses
  const expenseSource = expenseIds
    ? getExpenses(caseId).filter(e => expenseIds.includes(e.id))
    : getUnbilledExpenses(caseId);

  for (const expense of expenseSource) {
    lineItems.push({
      id: generateId(),
      type: 'expense',
      description: `${expense.description} (${expense.category})`,
      date: expense.date,
      amount: expense.amount,
      sourceId: expense.id,
    });
  }

  const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
  const taxRate = 0;
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;

  const invoice: Invoice = {
    id: generateId(),
    number: generateInvoiceNumber(),
    caseId,
    caseTitle,
    clientName,
    clientEmail,
    status: 'draft',
    issueDate: today,
    dueDate: dueDateStr,
    lineItems,
    subtotal,
    taxRate,
    taxAmount,
    total,
    amountPaid: 0,
    notes,
    createdAt: now,
    updatedAt: now,
  };

  saveInvoice(invoice);

  // Mark source items as billed
  const timeIds = timeSource.map(e => e.id);
  const expIds = expenseSource.map(e => e.id);
  if (timeIds.length > 0) markTimeBilled(timeIds, invoice.id);
  if (expIds.length > 0) markExpensesBilled(expIds, invoice.id);

  return invoice;
};

export const updateInvoiceStatus = (id: string, status: InvoiceStatus): void => {
  const invoices = loadItems<Invoice>(KEYS.INVOICES);
  const invoice = invoices.find(i => i.id === id);
  if (!invoice) return;

  invoice.status = status;
  invoice.updatedAt = Date.now();

  if (status === 'paid') {
    invoice.paidAt = new Date().toISOString();
    invoice.amountPaid = invoice.total;
  }
  if (status === 'cancelled') {
    invoice.amountPaid = 0;
  }

  saveItems(KEYS.INVOICES, invoices);
};

export const recordPayment = (
  invoiceId: string,
  caseId: string,
  amount: number,
  method: string,
  reference?: string,
  notes?: string,
): Payment => {
  const payment: Payment = {
    id: generateId(),
    invoiceId,
    caseId,
    amount,
    date: new Date().toISOString().split('T')[0],
    method,
    reference,
    notes,
    createdAt: Date.now(),
  };

  const payments = loadItems<Payment>(KEYS.PAYMENTS);
  payments.push(payment);
  saveItems(KEYS.PAYMENTS, payments);

  // Update the invoice
  const invoices = loadItems<Invoice>(KEYS.INVOICES);
  const invoice = invoices.find(i => i.id === invoiceId);
  if (invoice) {
    invoice.amountPaid = (invoice.amountPaid || 0) + amount;
    invoice.updatedAt = Date.now();

    if (invoice.amountPaid >= invoice.total) {
      invoice.status = 'paid';
      invoice.paidAt = new Date().toISOString();
    } else if (invoice.amountPaid > 0) {
      invoice.status = 'partial';
    }

    saveItems(KEYS.INVOICES, invoices);
  }

  return payment;
};

// ─── Retainers ──────────────────────────────────────────────────────────────────

export const getRetainers = (caseId?: string): Retainer[] => {
  const retainers = loadItems<Retainer>(KEYS.RETAINERS);
  if (!caseId) return retainers;
  return retainers.filter(r => r.caseId === caseId);
};

export const saveRetainer = (retainer: Retainer): void => {
  const retainers = loadItems<Retainer>(KEYS.RETAINERS);
  const idx = retainers.findIndex(r => r.id === retainer.id);
  if (idx >= 0) {
    retainers[idx] = retainer;
  } else {
    retainers.push(retainer);
  }
  saveItems(KEYS.RETAINERS, retainers);
};

export const deleteRetainer = (id: string): void => {
  const retainers = loadItems<Retainer>(KEYS.RETAINERS).filter(r => r.id !== id);
  saveItems(KEYS.RETAINERS, retainers);
};

export const drawRetainer = (
  id: string,
  amount: number,
  description: string,
  caseId: string,
): InvoiceLineItem | null => {
  const retainers = loadItems<Retainer>(KEYS.RETAINERS);
  const retainer = retainers.find(r => r.id === id);
  if (!retainer) return null;

  const drawAmount = Math.min(amount, retainer.remainingAmount);
  if (drawAmount <= 0) return null;

  retainer.remainingAmount -= drawAmount;
  retainer.lastDrawAt = new Date().toISOString();
  retainer.updatedAt = Date.now();
  saveItems(KEYS.RETAINERS, retainers);

  return {
    id: generateId(),
    type: 'retainer-draw',
    description: `Retainer draw: ${description}`,
    date: new Date().toISOString().split('T')[0],
    amount: drawAmount,
    sourceId: id,
  };
};

// ─── Dashboard ──────────────────────────────────────────────────────────────────

export const getBillingDashboard = (): BillingDashboard => {
  const invoices = loadItems<Invoice>(KEYS.INVOICES);
  const payments = loadItems<Payment>(KEYS.PAYMENTS);
  const timeEntries = loadItems<TimeEntry>(KEYS.TIME_ENTRIES);
  const retainers = loadItems<Retainer>(KEYS.RETAINERS);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const todayStr = now.toISOString().split('T')[0];

  const totalInvoiced = invoices.reduce((sum, i) => sum + i.total, 0);
  const totalCollected = invoices.reduce((sum, i) => sum + (i.amountPaid || 0), 0);
  const totalOutstanding = totalInvoiced - totalCollected;

  // Overdue: not paid/cancelled and past due date
  const overdueInvoices = invoices.filter(
    i => i.status !== 'paid' && i.status !== 'cancelled' && i.dueDate < todayStr,
  );
  const overdueCount = overdueInvoices.length;
  const overdueAmount = overdueInvoices.reduce((sum, i) => sum + (i.total - (i.amountPaid || 0)), 0);

  // This month
  const thisMonthBilled = invoices
    .filter(i => i.createdAt >= monthStart)
    .reduce((sum, i) => sum + i.total, 0);

  const thisMonthCollected = payments
    .filter(p => p.createdAt >= monthStart)
    .reduce((sum, p) => sum + p.amount, 0);

  const thisMonthHours = timeEntries
    .filter(e => e.createdAt >= monthStart)
    .reduce((sum, e) => sum + e.hours, 0);

  const activeRetainers = retainers.filter(r => r.remainingAmount > 0);
  const retainerBalance = retainers.reduce((sum, r) => sum + r.remainingAmount, 0);

  return {
    totalInvoiced,
    totalCollected,
    totalOutstanding,
    overdueCount,
    overdueAmount,
    thisMonthBilled,
    thisMonthCollected,
    thisMonthHours,
    activeRetainers: activeRetainers.length,
    retainerBalance,
  };
};

// ─── Data Export ────────────────────────────────────────────────────────────────

export const exportInvoiceAsText = (invoice: Invoice): string => {
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════');
  lines.push('              I N V O I C E');
  lines.push('═══════════════════════════════════════════');
  lines.push('');
  lines.push(`Invoice #: ${invoice.number}`);
  lines.push(`Case:      ${invoice.caseTitle}`);
  lines.push(`Client:    ${invoice.clientName}`);
  if (invoice.clientEmail) lines.push(`Email:     ${invoice.clientEmail}`);
  lines.push(`Issued:    ${invoice.issueDate}`);
  lines.push(`Due:       ${invoice.dueDate}`);
  lines.push(`Status:    ${invoice.status.toUpperCase()}`);
  lines.push('');
  lines.push('───────────────────────────────────────────');
  lines.push('Line Items');
  lines.push('───────────────────────────────────────────');
  for (const item of invoice.lineItems) {
    const label = `[${item.type.toUpperCase()}] ${item.description}`;
    lines.push(label);
    if (item.hours) lines.push(`  Hours: ${item.hours.toFixed(2)} @ $${item.rate?.toFixed(2) ?? '0.00'}/hr`);
    lines.push(`  Amount: $${item.amount.toFixed(2)}`);
    if (item.date) lines.push(`  Date: ${item.date}`);
    lines.push('');
  }
  lines.push('───────────────────────────────────────────');
  lines.push(`Subtotal:    $${invoice.subtotal.toFixed(2)}`);
  if (invoice.taxRate > 0) {
    lines.push(`Tax (${(invoice.taxRate * 100).toFixed(1)}%):  $${invoice.taxAmount.toFixed(2)}`);
  }
  lines.push(`Total:       $${invoice.total.toFixed(2)}`);
  lines.push(`Amount Paid: $${(invoice.amountPaid || 0).toFixed(2)}`);
  lines.push(`Balance Due: $${(invoice.total - (invoice.amountPaid || 0)).toFixed(2)}`);
  lines.push('───────────────────────────────────────────');
  if (invoice.notes) {
    lines.push('');
    lines.push(`Notes: ${invoice.notes}`);
  }
  if (invoice.terms) {
    lines.push('');
    lines.push(`Terms: ${invoice.terms}`);
  }
  lines.push('');
  lines.push('═══════════════════════════════════════════');

  return lines.join('\n');
};

export const exportInvoiceAsMarkdown = (invoice: Invoice): string => {
  const lines: string[] = [];
  const balance = invoice.total - (invoice.amountPaid || 0);

  lines.push(`# Invoice ${invoice.number}`);
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push(`| **Case** | ${invoice.caseTitle} |`);
  lines.push(`| **Client** | ${invoice.clientName} |`);
  if (invoice.clientEmail) lines.push(`| **Email** | ${invoice.clientEmail} |`);
  lines.push(`| **Issued** | ${invoice.issueDate} |`);
  lines.push(`| **Due** | ${invoice.dueDate} |`);
  lines.push(`| **Status** | ${invoice.status.toUpperCase()} |`);
  lines.push('');
  lines.push('## Line Items');
  lines.push('');
  lines.push('| Type | Description | Date | Hours | Rate | Amount |');
  lines.push('|------|-------------|------|-------|------|--------|');
  for (const item of invoice.lineItems) {
    const hours = item.hours ? item.hours.toFixed(2) : '-';
    const rate = item.rate ? `$${item.rate.toFixed(2)}` : '-';
    lines.push(
      `| ${item.type} | ${item.description} | ${item.date || '-'} | ${hours} | ${rate} | $${item.amount.toFixed(2)} |`,
    );
  }
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Subtotal:** $${invoice.subtotal.toFixed(2)}`);
  if (invoice.taxRate > 0) lines.push(`- **Tax (${(invoice.taxRate * 100).toFixed(1)}%):** $${invoice.taxAmount.toFixed(2)}`);
  lines.push(`- **Total:** $${invoice.total.toFixed(2)}`);
  lines.push(`- **Amount Paid:** $${(invoice.amountPaid || 0).toFixed(2)}`);
  lines.push(`- **Balance Due:** $${balance.toFixed(2)}`);
  if (invoice.notes) {
    lines.push('');
    lines.push('## Notes');
    lines.push('');
    lines.push(invoice.notes);
  }
  if (invoice.terms) {
    lines.push('');
    lines.push('## Terms');
    lines.push('');
    lines.push(invoice.terms);
  }

  return lines.join('\n');
};

// ─── AI Generation Helper ──────────────────────────────────────────────────────

export const generateInvoiceDescription = (
  caseTitle: string,
  entries: TimeEntry[],
  expenses: Expense[],
): string => {
  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
  const totalTimeAmount = entries.reduce((sum, e) => sum + e.amount, 0);
  const totalExpenseAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

  const lines: string[] = [];
  lines.push(`Legal services rendered for ${caseTitle}.`);
  lines.push('');
  if (entries.length > 0) {
    lines.push(`Time Entries (${entries.length} entries, ${totalHours.toFixed(1)} total hours):`);
    for (const entry of entries) {
      lines.push(`  - ${entry.date}: ${entry.description} (${entry.hours.toFixed(1)}h @ $${entry.rate}/hr = $${entry.amount.toFixed(2)})`);
    }
  }
  if (expenses.length > 0) {
    lines.push('');
    lines.push('Expenses:');
    for (const expense of expenses) {
      lines.push(`  - ${expense.date}: ${expense.description} [${expense.category}] — $${expense.amount.toFixed(2)}`);
    }
  }
  lines.push('');
  lines.push(`Summary: ${totalHours.toFixed(1)} hours ($${totalTimeAmount.toFixed(2)}) + $${totalExpenseAmount.toFixed(2)} in expenses = $${(totalTimeAmount + totalExpenseAmount).toFixed(2)} total.`);

  return lines.join('\n');
};
