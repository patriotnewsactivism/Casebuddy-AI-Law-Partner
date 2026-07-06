import React, { useState, useEffect, useContext } from 'react';
import {
  CreditCard, DollarSign, CheckCircle2, XCircle, Clock, Building2,
  Wallet, Receipt, ArrowRight, Shield, Copy, Download, Plus, Trash2,
  Loader2, AlertTriangle, TrendingUp, Calendar, Banknote
} from 'lucide-react';
import {
  getPaymentMethods, addPaymentMethod, deletePaymentMethod, setDefaultPaymentMethod,
  createPaymentSession, processPayment, getPaymentSessions,
  getPayoutSchedule, savePayoutSchedule, createDefaultPayoutSchedule,
  payInvoiceWithStripe, generatePaymentReceipt,
  type PaymentMethod, type PaymentSession, type PaymentMethodType, type PayoutSchedule
} from '../services/paymentService';
import { getInvoices, recordPayment } from '../services/billingService';
import type { Invoice } from '../types';
import { AppContext } from '../App';

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);
};

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTimestamp = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatDateTime = (isoStr: string): string => {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const statusBadge = (status: string): { bg: string; text: string; label: string } => {
  switch (status) {
    case 'completed': return { bg: 'bg-green-900/50', text: 'text-green-400', label: 'Completed' };
    case 'pending': return { bg: 'bg-amber-900/50', text: 'text-amber-400', label: 'Pending' };
    case 'processing': return { bg: 'bg-blue-900/50', text: 'text-blue-400', label: 'Processing' };
    case 'failed': return { bg: 'bg-red-900/50', text: 'text-red-400', label: 'Failed' };
    default: return { bg: 'bg-slate-700', text: 'text-slate-300', label: status };
  }
};

const brandEmoji = (brand: string): string => {
  const b = brand.toLowerCase();
  if (b.includes('visa')) return '💳';
  if (b.includes('mastercard') || b.includes('mc')) return '💳';
  if (b.includes('amex') || b.includes('american')) return '💎';
  if (b.includes('discover')) return '🟠';
  return '🏦';
};

const cardMask = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  const groups = [];
  for (let i = 0; i < digits.length && i < 16; i += 4) {
    groups.push(digits.slice(i, i + 4));
  }
  return groups.join(' ');
};

const TABS = [
  { key: 'payments', label: 'Payments', icon: DollarSign },
  { key: 'methods', label: 'Methods', icon: CreditCard },
  { key: 'payouts', label: 'Payouts', icon: Banknote },
];

const PaymentCenter = () => {
  const { cases } = useContext(AppContext);

  const [activeTab, setActiveTab] = useState('payments');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentSessions, setPaymentSessions] = useState<PaymentSession[]>([]);
  const [payoutSchedule, setPayoutSchedule] = useState<PayoutSchedule | null>(null);

  // Payment tab state
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [selectedMethodId, setSelectedMethodId] = useState('');
  const [useNewCard, setUseNewCard] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardName, setCardName] = useState('');
  const [paying, setPaying] = useState(false);
  const [payResult, setPayResult] = useState<{ success: boolean; message: string; receipt?: string } | null>(null);

  // Method tab state
  const [showAddMethod, setShowAddMethod] = useState(false);
  const [newCardNumber, setNewCardNumber] = useState('');
  const [newCardExpiry, setNewCardExpiry] = useState('');
  const [newCardCvc, setNewCardCvc] = useState('');
  const [newCardHolder, setNewCardHolder] = useState('');
  const [newCardType, setNewCardType] = useState<PaymentMethodType>('credit-card');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Payout tab state
  const [payoutFreq, setPayoutFreq] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [payoutNextDate, setPayoutNextDate] = useState('');
  const [payoutEstAmount, setPayoutEstAmount] = useState(0);
  const [payoutBankLast4, setPayoutBankLast4] = useState('');
  const [savingPayout, setSavingPayout] = useState(false);

  const loadAllData = () => {
    setInvoices(getInvoices());
    setPaymentMethods(getPaymentMethods());
    setPaymentSessions(getPaymentSessions());
    setPayoutSchedule(getPayoutSchedule());
  };

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    if (payoutSchedule) {
      setPayoutFreq(payoutSchedule.frequency);
      setPayoutNextDate(payoutSchedule.nextPayoutDate);
      setPayoutEstAmount(payoutSchedule.estimatedAmount);
      setPayoutBankLast4(payoutSchedule.bankAccountLast4);
    }
  }, [payoutSchedule]);

  const unpaidInvoices = invoices.filter(i =>
    i.status === 'sent' || i.status === 'overdue' || i.status === 'draft' || i.status === 'partial'
  );

  const selectedInvoice = invoices.find(i => i.id === selectedInvoiceId);

  useEffect(() => {
    if (selectedInvoice) {
      const balance = selectedInvoice.total - (selectedInvoice.amountPaid || 0);
      setPaymentAmount(balance > 0 ? balance : 0);
    }
  }, [selectedInvoiceId, selectedInvoice]);

  const allCompletedSessions = paymentSessions.filter(s => s.status !== 'pending' && s.status !== 'processing');
  const filteredSessions = selectedInvoiceId
    ? allCompletedSessions.filter(s => s.invoiceId === selectedInvoiceId)
    : allCompletedSessions;

  const handleCardNumberChange = (value: string) => {
    const masked = cardMask(value);
    setCardNumber(masked);
  };

  const handleExpiryChange = (value: string) => {
    let digits = value.replace(/\D/g, '');
    if (digits.length > 2) {
      digits = digits.slice(0, 2) + '/' + digits.slice(2, 4);
    }
    setCardExpiry(digits);
  };

  const handlePayNow = async () => {
    if (!selectedInvoiceId || paymentAmount <= 0) return;
    setPaying(true);
    setPayResult(null);

    try {
      const result = await payInvoiceWithStripe(selectedInvoiceId, paymentAmount);
      if (result.success) {
        recordPayment(selectedInvoiceId, selectedInvoice?.caseId || '', paymentAmount, 'credit-card', result.sessionId);
        const defaultMethod = paymentMethods.find(m => m.isDefault) || paymentMethods[0];
        const receipt = generatePaymentReceipt(
          selectedInvoice?.number || '',
          paymentAmount,
          useNewCard ? cardNumber.replace(/\s/g, '').slice(-4) : (defaultMethod?.last4 || '0000'),
          result.sessionId
        );
        setPayResult({ success: true, message: result.message, receipt });
      } else {
        setPayResult({ success: false, message: result.message });
      }
    } catch (err: any) {
      setPayResult({ success: false, message: err?.message || 'Payment processing error.' });
    } finally {
      setPaying(false);
      loadAllData();
    }
  };

  const handleAddMethod = () => {
    if (!newCardNumber || !newCardExpiry || !newCardCvc || !newCardHolder) return;
    const digits = newCardNumber.replace(/\D/g, '');
    const brand = digits.startsWith('4') ? 'Visa'
      : digits.startsWith('5') ? 'Mastercard'
      : digits.startsWith('3') ? 'Amex'
      : digits.startsWith('6') ? 'Discover'
      : 'Card';

    const [mm, yy] = newCardExpiry.split('/');
    const method: PaymentMethod = {
      id: '',
      type: newCardType,
      last4: digits.slice(-4),
      brand,
      expiryMonth: parseInt(mm) || 1,
      expiryYear: 2000 + (parseInt(yy) || 24),
      isDefault: paymentMethods.length === 0,
      createdAt: Date.now(),
    };
    addPaymentMethod(method);
    setShowAddMethod(false);
    setNewCardNumber('');
    setNewCardExpiry('');
    setNewCardCvc('');
    setNewCardHolder('');
    setNewCardType('credit-card');
    loadAllData();
  };

  const handleDeleteMethod = (id: string) => {
    deletePaymentMethod(id);
    setDeleteConfirmId(null);
    loadAllData();
  };

  const handleSetDefault = (id: string) => {
    setDefaultPaymentMethod(id);
    loadAllData();
  };

  const handleSavePayout = () => {
    setSavingPayout(true);
    const schedule: PayoutSchedule = {
      id: payoutSchedule?.id || '',
      frequency: payoutFreq,
      nextPayoutDate: payoutNextDate,
      estimatedAmount: payoutEstAmount,
      bankAccountLast4: payoutBankLast4,
      active: true,
    };
    savePayoutSchedule(schedule);
    setPayoutSchedule(schedule);
    setTimeout(() => {
      setSavingPayout(false);
      loadAllData();
    }, 300);
  };

  const handleCreateDefaultPayout = () => {
    const schedule = createDefaultPayoutSchedule();
    setPayoutSchedule(schedule);
    loadAllData();
  };

  const mockPayoutHistory = [
    { date: '2026-06-28', amount: 4250.00, status: 'completed', reference: 'PO-2026-0628-001' },
    { date: '2026-06-21', amount: 3800.00, status: 'completed', reference: 'PO-2026-0621-001' },
    { date: '2026-06-14', amount: 5100.00, status: 'completed', reference: 'PO-2026-0614-001' },
    { date: '2026-06-07', amount: 2900.00, status: 'completed', reference: 'PO-2026-0607-001' },
  ];

  const renderPayments = () => (
    <div className="space-y-6">
      {/* Pay an Invoice */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-lg p-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <DollarSign size={20} className="text-gold-400" />
          Pay an Invoice
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Invoice selection & details */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1.5 font-semibold uppercase tracking-wider">Select Invoice</label>
              <select
                value={selectedInvoiceId}
                onChange={e => { setSelectedInvoiceId(e.target.value); setPayResult(null); }}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-gold-500/50"
              >
                <option value="">Choose an unpaid invoice...</option>
                {unpaidInvoices.map(inv => {
                  const balance = inv.total - (inv.amountPaid || 0);
                  return (
                    <option key={inv.id} value={inv.id}>
                      {inv.number} — {inv.caseTitle} ({formatCurrency(balance)})
                    </option>
                  );
                })}
              </select>
            </div>

            {selectedInvoice && (
              <div className="bg-slate-800/50 border border-slate-700/30 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-500 text-xs">Invoice</span>
                    <p className="text-white font-medium">{selectedInvoice.number}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Case</span>
                    <p className="text-white">{selectedInvoice.caseTitle}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Client</span>
                    <p className="text-white">{selectedInvoice.clientName}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Due Date</span>
                    <p className="text-white">{formatDate(selectedInvoice.dueDate)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-700/50">
                  <div className="text-center">
                    <span className="text-slate-500 text-xs block">Total Due</span>
                    <span className="text-white font-bold">{formatCurrency(selectedInvoice.total)}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-slate-500 text-xs block">Amount Paid</span>
                    <span className="text-green-400 font-medium">{formatCurrency(selectedInvoice.amountPaid || 0)}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-slate-500 text-xs block">Balance</span>
                    <span className="text-amber-400 font-bold">{formatCurrency(selectedInvoice.total - (selectedInvoice.amountPaid || 0))}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Payment details */}
          <div className="space-y-4">
            {selectedInvoiceId ? (
              <>
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5 font-semibold uppercase tracking-wider">Payment Amount</label>
                  <div className="relative">
                    <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={paymentAmount || ''}
                      onChange={e => setPaymentAmount(Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-gold-500/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-1.5 font-semibold uppercase tracking-wider">Payment Method</label>
                  {paymentMethods.length > 0 && !useNewCard && (
                    <select
                      value={selectedMethodId}
                      onChange={e => setSelectedMethodId(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-gold-500/50 mb-2"
                    >
                      {paymentMethods.map(m => (
                        <option key={m.id} value={m.id}>
                          {brandEmoji(m.brand)} {m.brand} •••• {m.last4} {m.isDefault ? '(default)' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={() => setUseNewCard(!useNewCard)}
                    className="text-sm text-gold-400 hover:text-gold-300 transition-all duration-200"
                  >
                    {useNewCard ? 'Use saved method' : 'Or enter new card'}
                  </button>
                </div>

                {useNewCard && (
                  <div className="space-y-3 border border-slate-700/50 rounded-lg p-4 bg-slate-800/30">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Card Number</label>
                      <input
                        type="text"
                        maxLength={19}
                        value={cardNumber}
                        onChange={e => handleCardNumberChange(e.target.value)}
                        placeholder="1234 5678 9012 3456"
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-gold-500/50 placeholder-slate-500 font-mono"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Expiry</label>
                        <input
                          type="text"
                          maxLength={5}
                          value={cardExpiry}
                          onChange={e => handleExpiryChange(e.target.value)}
                          placeholder="MM/YY"
                          className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-gold-500/50 placeholder-slate-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">CVC</label>
                        <input
                          type="text"
                          maxLength={4}
                          value={cardCvc}
                          onChange={e => setCardCvc(e.target.value.replace(/\D/g, ''))}
                          placeholder="123"
                          className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-gold-500/50 placeholder-slate-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Cardholder Name</label>
                      <input
                        type="text"
                        value={cardName}
                        onChange={e => setCardName(e.target.value)}
                        placeholder="Name on card"
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-gold-500/50 placeholder-slate-500"
                      />
                    </div>
                  </div>
                )}

                <button
                  onClick={handlePayNow}
                  disabled={paying || paymentAmount <= 0 || (useNewCard && (!cardNumber || !cardExpiry || !cardCvc))}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-gold-500 text-black font-bold text-sm rounded-lg transition-all duration-200 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {paying ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Shield size={18} />
                      Pay {formatCurrency(paymentAmount)}
                    </>
                  )}
                </button>

                {payResult && (
                  <div className={`rounded-lg p-4 border ${payResult.success ? 'bg-green-900/20 border-green-700/50' : 'bg-red-900/20 border-red-700/50'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {payResult.success ? (
                        <CheckCircle2 size={18} className="text-green-400" />
                      ) : (
                        <XCircle size={18} className="text-red-400" />
                      )}
                      <span className={`text-sm font-semibold ${payResult.success ? 'text-green-400' : 'text-red-400'}`}>
                        {payResult.success ? 'Payment Successful' : 'Payment Failed'}
                      </span>
                    </div>
                    <p className="text-slate-300 text-sm">{payResult.message}</p>
                    {payResult.success && payResult.receipt && (
                      <div className="mt-3 space-y-2">
                        <button
                          onClick={() => navigator.clipboard.writeText(payResult.receipt || '')}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-green-600/50 text-green-400 text-xs rounded-lg transition-all duration-200 hover:bg-green-950/50"
                        >
                          <Copy size={13} /> Copy Receipt
                        </button>
                        <pre className="text-xs text-slate-400 bg-slate-950 rounded-lg p-3 overflow-x-auto font-mono whitespace-pre-wrap">{payResult.receipt}</pre>
                      </div>
                    )}
                    {!payResult.success && (
                      <button
                        onClick={handlePayNow}
                        className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 text-red-400 text-xs rounded-lg transition-all duration-200 hover:bg-red-600/30"
                      >
                        <ArrowRight size={13} /> Try Again
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm py-12">
                <div className="text-center">
                  <Receipt size={40} className="mx-auto mb-3 opacity-30" />
                  <p>Select an invoice to pay</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-lg p-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Clock size={20} className="text-gold-400" />
          Recent Transactions
        </h2>

        {filteredSessions.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <TrendingUp size={40} className="mx-auto mb-3 opacity-30" />
            <p>No transactions yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Invoice</th>
                  <th className="pb-3 pr-4">Amount</th>
                  <th className="pb-3 pr-4">Method</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3">Transaction ID</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map(session => {
                  const sb = statusBadge(session.status);
                  const inv = invoices.find(i => i.id === session.invoiceId);
                  return (
                    <tr key={session.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-all duration-200">
                      <td className="py-3 pr-4 text-slate-400 whitespace-nowrap">{formatTimestamp(session.createdAt)}</td>
                      <td className="py-3 pr-4 text-white font-medium whitespace-nowrap">{inv?.number || session.invoiceId}</td>
                      <td className="py-3 pr-4 text-slate-300 whitespace-nowrap">{formatCurrency(session.amount)}</td>
                      <td className="py-3 pr-4 text-slate-400 whitespace-nowrap">•••• {session.method === 'credit-card' ? 'Card' : session.method}</td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${sb.bg} ${sb.text}`}>{sb.label}</span>
                      </td>
                      <td className="py-3 text-slate-500 text-xs font-mono whitespace-nowrap truncate max-w-[180px]">{session.id}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  const renderMethods = () => (
    <div className="space-y-6">
      {/* Saved Payment Methods */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CreditCard size={20} className="text-gold-400" />
            Saved Payment Methods
          </h2>
          <button
            onClick={() => setShowAddMethod(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gold-500 text-black text-xs font-semibold rounded-lg transition-all duration-200 hover:bg-gold-400"
          >
            <Plus size={14} /> Add Method
          </button>
        </div>

        {paymentMethods.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Wallet size={40} className="mx-auto mb-3 opacity-30" />
            <p>No payment methods saved</p>
            <button
              onClick={() => setShowAddMethod(true)}
              className="mt-3 text-gold-400 text-sm hover:text-gold-300 transition-all duration-200"
            >
              Add your first payment method
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paymentMethods.map(method => (
              <div
                key={method.id}
                className={`relative bg-slate-800 border rounded-lg p-4 transition-all duration-200 ${method.isDefault ? 'border-gold-500/60' : 'border-slate-700/50 hover:border-slate-600/50'}`}
              >
                {method.isDefault && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 bg-gold-500/20 text-gold-400 text-[10px] font-semibold rounded uppercase tracking-wider">
                    Default
                  </span>
                )}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{brandEmoji(method.brand)}</span>
                  <div>
                    <p className="text-white text-sm font-semibold">{method.brand}</p>
                    <p className="text-slate-400 text-xs">•••• •••• •••• {method.last4}</p>
                  </div>
                </div>
                <p className="text-slate-500 text-xs mb-3">
                  Expires {String(method.expiryMonth).padStart(2, '0')}/{String(method.expiryYear).slice(-2)}
                </p>
                <div className="flex items-center gap-2">
                  {!method.isDefault && (
                    <button
                      onClick={() => handleSetDefault(method.id)}
                      className="text-xs text-slate-400 hover:text-gold-400 transition-all duration-200"
                    >
                      Set default
                    </button>
                  )}
                  <button
                    onClick={() => setDeleteConfirmId(method.id)}
                    className="text-xs text-slate-500 hover:text-red-400 transition-all duration-200 ml-auto"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Security Notice */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-lg p-5">
        <div className="flex items-start gap-3">
          <Shield size={18} className="text-gold-400 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Security Notice</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Payment methods are stored locally. In production, card data is tokenized by Stripe and never touches your server.
            </p>
          </div>
        </div>
      </div>

      {/* Add Method Modal */}
      {showAddMethod && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowAddMethod(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Add Payment Method</h3>
              <button onClick={() => setShowAddMethod(false)} className="text-slate-400 hover:text-white transition-all duration-200">
                <XCircle size={20} />
              </button>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Card Type</label>
              <select
                value={newCardType}
                onChange={e => setNewCardType(e.target.value as PaymentMethodType)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
              >
                <option value="credit-card">Credit Card</option>
                <option value="ach">ACH / Bank Account</option>
                <option value="wire">Wire Transfer</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Card Number</label>
              <input
                type="text"
                maxLength={19}
                value={newCardNumber}
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g, '');
                  const groups = [];
                  for (let i = 0; i < digits.length && i < 16; i += 4) {
                    groups.push(digits.slice(i, i + 4));
                  }
                  setNewCardNumber(groups.join(' '));
                }}
                placeholder="1234 5678 9012 3456"
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50 placeholder-slate-500 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Expiry (MM/YY)</label>
                <input
                  type="text"
                  maxLength={5}
                  value={newCardExpiry}
                  onChange={e => {
                    let digits = e.target.value.replace(/\D/g, '');
                    if (digits.length > 2) {
                      digits = digits.slice(0, 2) + '/' + digits.slice(2, 4);
                    }
                    setNewCardExpiry(digits);
                  }}
                  placeholder="MM/YY"
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50 placeholder-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">CVC</label>
                <input
                  type="text"
                  maxLength={4}
                  value={newCardCvc}
                  onChange={e => setNewCardCvc(e.target.value.replace(/\D/g, ''))}
                  placeholder="123"
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50 placeholder-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Cardholder Name</label>
              <input
                type="text"
                value={newCardHolder}
                onChange={e => setNewCardHolder(e.target.value)}
                placeholder="Name on card"
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50 placeholder-slate-500"
              />
            </div>

            <button
              onClick={handleAddMethod}
              disabled={!newCardNumber || !newCardExpiry || !newCardCvc || !newCardHolder}
              className="w-full py-2.5 bg-gold-500 text-black font-semibold text-sm rounded-lg transition-all duration-200 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save Card
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <AlertTriangle size={24} className="text-amber-400" />
              <h3 className="text-lg font-bold text-white">Delete Payment Method</h3>
            </div>
            <p className="text-slate-400 text-sm">Are you sure you want to remove this payment method? This action cannot be undone.</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2 border border-slate-600 text-slate-300 text-sm font-semibold rounded-lg transition-all duration-200 hover:border-slate-500"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteMethod(deleteConfirmId)}
                className="flex-1 py-2 bg-red-600/80 text-white text-sm font-semibold rounded-lg transition-all duration-200 hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderPayouts = () => (
    <div className="space-y-6">
      {/* Payout Schedule */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building2 size={20} className="text-gold-400" />
            Payout Schedule
          </h2>
          {!payoutSchedule && (
            <button
              onClick={handleCreateDefaultPayout}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gold-500 text-black text-xs font-semibold rounded-lg transition-all duration-200 hover:bg-gold-400"
            >
              <Plus size={14} /> Create Schedule
            </button>
          )}
        </div>

        {!payoutSchedule ? (
          <div className="text-center py-12 text-slate-500">
            <Banknote size={40} className="mx-auto mb-3 opacity-30" />
            <p>No payout schedule configured</p>
            <p className="text-xs mt-1">Create a schedule to automatically receive payments</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1.5 font-semibold uppercase tracking-wider">Frequency</label>
                <select
                  value={payoutFreq}
                  onChange={e => setPayoutFreq(e.target.value as 'daily' | 'weekly' | 'monthly')}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-gold-500/50"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5 font-semibold uppercase tracking-wider">Next Payout Date</label>
                <input
                  type="date"
                  value={payoutNextDate}
                  onChange={e => setPayoutNextDate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-gold-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5 font-semibold uppercase tracking-wider">Estimated Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={payoutEstAmount || ''}
                  onChange={e => setPayoutEstAmount(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-gold-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5 font-semibold uppercase tracking-wider">Bank Account (last 4)</label>
                <div className="relative">
                  <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    maxLength={4}
                    value={payoutBankLast4}
                    onChange={e => setPayoutBankLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="0000"
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-gold-500/50 placeholder-slate-500"
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/30 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar size={18} className="text-gold-400" />
                <div>
                  <p className="text-slate-400 text-xs">Current schedule</p>
                  <p className="text-white text-sm font-medium capitalize">
                    {payoutFreq} — Next: {formatDate(payoutNextDate)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-slate-400 text-xs">Estimated</p>
                <p className="text-gold-400 font-bold">{formatCurrency(payoutEstAmount)}</p>
              </div>
            </div>

            <button
              onClick={handleSavePayout}
              disabled={savingPayout}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-gold-500 text-black font-semibold text-sm rounded-lg transition-all duration-200 hover:bg-gold-400 disabled:opacity-60"
            >
              {savingPayout ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving...
                </>
              ) : (
                'Update Schedule'
              )}
            </button>
          </div>
        )}
      </div>

      {/* Payout History */}
      {payoutSchedule && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-lg p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Receipt size={20} className="text-gold-400" />
            Payout History
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Amount</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3">Reference</th>
                </tr>
              </thead>
              <tbody>
                {mockPayoutHistory.map((payout, idx) => {
                  const sb = statusBadge(payout.status);
                  return (
                    <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-all duration-200">
                      <td className="py-3 pr-4 text-slate-400 whitespace-nowrap">{formatDate(payout.date)}</td>
                      <td className="py-3 pr-4 text-white font-medium whitespace-nowrap">{formatCurrency(payout.amount)}</td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${sb.bg} ${sb.text}`}>{sb.label}</span>
                      </td>
                      <td className="py-3 text-slate-500 text-xs font-mono whitespace-nowrap">{payout.reference}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Payment Center</h1>
            <p className="text-slate-400 text-sm mt-0.5">Process payments, manage methods, and configure payouts</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-700/50 rounded-lg p-1 w-fit">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${isActive ? 'bg-gold-500 text-black' : 'text-slate-400 hover:text-white'}`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === 'payments' && renderPayments()}
        {activeTab === 'methods' && renderMethods()}
        {activeTab === 'payouts' && renderPayouts()}
      </div>
    </div>
  );
};

export default PaymentCenter;
