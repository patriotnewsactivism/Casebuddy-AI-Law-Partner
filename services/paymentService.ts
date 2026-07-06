import type { Invoice } from '../types';

export type PaymentMethodType = 'credit-card' | 'ach' | 'wire';

export interface PaymentSession {
  id: string;
  invoiceId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  method: PaymentMethodType;
  clientSecret: string;
  createdAt: number;
  completedAt?: string;
}

export interface PaymentMethod {
  id: string;
  type: PaymentMethodType;
  last4: string;
  brand: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
  createdAt: number;
}

export interface PayoutSchedule {
  id: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  nextPayoutDate: string;
  estimatedAmount: number;
  bankAccountLast4: string;
  active: boolean;
}

const KEYS = {
  METHODS: 'casebuddy_payment_methods',
  SESSIONS: 'casebuddy_payment_sessions',
  PAYOUT_SCHEDULE: 'casebuddy_payout_schedule',
};

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

const loadSingle = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const saveSingle = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable — silently ignore
  }
};

const generateId = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// ─── Payment Methods ────────────────────────────────────────────────────────────

export const getPaymentMethods = (): PaymentMethod[] =>
  loadItems<PaymentMethod>(KEYS.METHODS);

export const addPaymentMethod = (method: PaymentMethod): void => {
  const methods = getPaymentMethods();
  if (!method.id) {
    method.id = generateId('pm');
  }
  if (method.isDefault) {
    methods.forEach(m => { m.isDefault = false; });
  }
  if (methods.length === 0) {
    method.isDefault = true;
  }
  methods.push(method);
  saveItems(KEYS.METHODS, methods);
};

export const deletePaymentMethod = (id: string): void => {
  const methods = getPaymentMethods().filter(m => m.id !== id);
  if (methods.length > 0 && !methods.some(m => m.isDefault)) {
    methods[0].isDefault = true;
  }
  saveItems(KEYS.METHODS, methods);
};

export const setDefaultPaymentMethod = (id: string): void => {
  const methods = getPaymentMethods();
  methods.forEach(m => { m.isDefault = m.id === id; });
  saveItems(KEYS.METHODS, methods);
};

// ─── Payment Sessions ───────────────────────────────────────────────────────────

export const createPaymentSession = (invoiceId: string, amount: number): PaymentSession => {
  const now = Date.now();
  const secret = `pi_sim_${generateId('cs')}_secret_${Math.random().toString(36).slice(2, 18)}`;
  const session: PaymentSession = {
    id: generateId('ps'),
    invoiceId,
    amount,
    currency: 'USD',
    status: 'pending',
    method: 'credit-card',
    clientSecret: secret,
    createdAt: now,
  };
  const sessions = loadItems<PaymentSession>(KEYS.SESSIONS);
  sessions.push(session);
  saveItems(KEYS.SESSIONS, sessions);
  return session;
};

export const processPayment = (sessionId: string, last4: string): { success: boolean; transactionId: string } => {
  const sessions = loadItems<PaymentSession>(KEYS.SESSIONS);
  const session = sessions.find(s => s.id === sessionId);
  if (!session) {
    return { success: false, transactionId: '' };
  }
  if (session.status === 'completed' || session.status === 'processing') {
    const txId = `txn_${sessionId}_dup`;
    return { success: session.status === 'completed', transactionId: txId };
  }
  
  session.status = 'processing';
  saveItems(KEYS.SESSIONS, sessions);

  const success = Math.random() < 0.9;
  const transactionId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  session.status = success ? 'completed' : 'failed';
  if (success) {
    session.completedAt = new Date().toISOString();
  }
  saveItems(KEYS.SESSIONS, sessions);

  return { success, transactionId };
};

export const getPaymentSessions = (invoiceId?: string): PaymentSession[] => {
  const sessions = loadItems<PaymentSession>(KEYS.SESSIONS);
  if (!invoiceId) return sessions;
  return sessions.filter(s => s.invoiceId === invoiceId);
};

// ─── Payouts ────────────────────────────────────────────────────────────────────

export const getPayoutSchedule = (): PayoutSchedule | null =>
  loadSingle<PayoutSchedule>(KEYS.PAYOUT_SCHEDULE);

export const savePayoutSchedule = (schedule: PayoutSchedule): void => {
  if (!schedule.id) {
    schedule.id = generateId('payout');
  }
  saveSingle(KEYS.PAYOUT_SCHEDULE, schedule);
};

export const createDefaultPayoutSchedule = (): PayoutSchedule => {
  const now = new Date();
  const next = new Date(now);
  next.setDate(next.getDate() + 7);
  const schedule: PayoutSchedule = {
    id: generateId('payout'),
    frequency: 'weekly',
    nextPayoutDate: next.toISOString().split('T')[0],
    estimatedAmount: 0,
    bankAccountLast4: '0000',
    active: true,
  };
  saveSingle(KEYS.PAYOUT_SCHEDULE, schedule);
  return schedule;
};

// ─── Invoice Payment ────────────────────────────────────────────────────────────

export const payInvoiceWithStripe = async (
  invoiceId: string,
  amount: number
): Promise<{ success: boolean; sessionId: string; message: string }> => {
  if (!invoiceId) {
    return { success: false, sessionId: '', message: 'Invoice ID is required.' };
  }
  if (!amount || amount <= 0) {
    return { success: false, sessionId: '', message: 'Amount must be greater than zero.' };
  }

  const defaults = getPaymentMethods();
  if (defaults.length === 0) {
    return { success: false, sessionId: '', message: 'No payment method on file. Please add a payment method first.' };
  }

  const session = createPaymentSession(invoiceId, amount);

  await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 600));

  const defaultMethod = defaults.find(m => m.isDefault) || defaults[0];
  const result = processPayment(session.id, defaultMethod.last4);

  if (result.success) {
    return {
      success: true,
      sessionId: session.id,
      message: `Payment of $${amount.toFixed(2)} processed successfully.`,
    };
  }
  return {
    success: false,
    sessionId: session.id,
    message: 'Payment failed. Please check your payment method and try again.',
  };
};

export const generatePaymentReceipt = (
  invoiceNumber: string,
  amount: number,
  last4: string,
  transactionId: string
): string => {
  const date = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return [
    '═══════════════════════════════════════',
    '           PAYMENT RECEIPT',
    '═══════════════════════════════════════',
    '',
    `  Invoice:      ${invoiceNumber || 'N/A'}`,
    `  Amount:       $${(amount || 0).toFixed(2)} USD`,
    `  Card:         **** **** **** ${last4 || 'N/A'}`,
    `  Transaction:  ${transactionId || 'N/A'}`,
    `  Date:         ${date}`,
    `  Status:       Completed`,
    '',
    '═══════════════════════════════════════',
    '  Thank you for your payment.',
    '  CaseBuddy Legal Technology',
    '═══════════════════════════════════════',
  ].join('\n');
};
