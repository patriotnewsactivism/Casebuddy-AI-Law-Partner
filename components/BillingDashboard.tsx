import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import {
  DollarSign, FileText, Clock, Receipt, Plus, Trash2, Copy, Download, CheckCircle2,
  AlertTriangle, Clock3, Timer, TimerOff, Play, Square, TrendingUp, TrendingDown,
  CreditCard, Wallet, Building2, Send, Eye, EyeOff, Loader2, ChevronDown,
  ArrowUpRight, ArrowDownRight, Calendar, Filter, Search, X
} from 'lucide-react';
import {
  getInvoices, saveInvoice, deleteInvoice, generateInvoiceNumber, createInvoice,
  updateInvoiceStatus, recordPayment, getTimeEntries, saveTimeEntry, deleteTimeEntry,
  getUnbilledTime, getTotalUnbilledTime, getExpenses, saveExpense, deleteExpense,
  getUnbilledExpenses, getTotalUnbilledExpenses, getRetainers, saveRetainer,
  deleteRetainer, drawRetainer, getRates, saveRate, deleteRate, getDefaultRate,
  getBillingDashboard, exportInvoiceAsMarkdown, exportInvoiceAsText, generateId
} from '../services/billingService';
import type {
  Invoice, InvoiceStatus, TimeEntry, Expense, Retainer, Payment,
  BillingDashboard as BillingDashboardType, BillingRate, InvoiceLineItem
} from '../types';

const PAYMENTS_KEY = 'casebuddy_payments';

const loadPayments = (): Payment[] => {
  try {
    const raw = localStorage.getItem(PAYMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);
};

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTimer = (seconds: number): string => {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

const statusBadge = (status: InvoiceStatus): { bg: string; text: string; label: string } => {
  switch (status) {
    case 'draft': return { bg: 'bg-slate-700', text: 'text-slate-300', label: 'Draft' };
    case 'sent': return { bg: 'bg-blue-900/50', text: 'text-blue-400', label: 'Sent' };
    case 'paid': return { bg: 'bg-green-900/50', text: 'text-green-400', label: 'Paid' };
    case 'overdue': return { bg: 'bg-red-900/50', text: 'text-red-400', label: 'Overdue' };
    case 'cancelled': return { bg: 'bg-slate-700', text: 'text-slate-400 line-through', label: 'Cancelled' };
    case 'partial': return { bg: 'bg-amber-900/50', text: 'text-amber-400', label: 'Partial' };
  }
};

const TABS = [
  { key: 'overview', label: 'Overview', icon: TrendingUp },
  { key: 'invoices', label: 'Invoices', icon: FileText },
  { key: 'time', label: 'Time', icon: Clock },
  { key: 'expenses', label: 'Expenses', icon: Receipt },
  { key: 'retainers', label: 'Retainers', icon: Wallet },
];

const EXPENSE_CATEGORIES = [
  'filing-fee', 'expert-witness', 'travel', 'copying', 'postage',
  'research', 'court-reporter', 'other',
];

const BillingDashboard = () => {
  const { cases } = useContext(AppContext);

  const [activeTab, setActiveTab] = useState('overview');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [retainers, setRetainers] = useState<Retainer[]>([]);
  const [rates, setRates] = useState<BillingRate[]>([]);
  const [dashboard, setDashboard] = useState<BillingDashboardType | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [showAddTime, setShowAddTime] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddRetainer, setShowAddRetainer] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [timerElapsed, setTimerElapsed] = useState(0);
  const [timerDescription, setTimerDescription] = useState('');
  const [timerCaseId, setTimerCaseId] = useState('');
  const [selectedCaseFilter, setSelectedCaseFilter] = useState('all');
  const [invoiceDetailId, setInvoiceDetailId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Invoice creation form
  const [invFormCaseId, setInvFormCaseId] = useState('');
  const [invFormClientName, setInvFormClientName] = useState('');
  const [invFormClientEmail, setInvFormClientEmail] = useState('');
  const [invFormNotes, setInvFormNotes] = useState('');
  const [invFormDueDays, setInvFormDueDays] = useState(30);
  const [invFormSelectedTimes, setInvFormSelectedTimes] = useState<string[]>([]);
  const [invFormSelectedExpenses, setInvFormSelectedExpenses] = useState<string[]>([]);

  // Time entry form
  const [timeDate, setTimeDate] = useState(new Date().toISOString().split('T')[0]);
  const [timeCaseId, setTimeCaseId] = useState('');
  const [timeDescription, setTimeDescription] = useState('');
  const [timeHours, setTimeHours] = useState(1);
  const [timeRate, setTimeRate] = useState(() => getDefaultRate());

  // Expense form
  const [expDate, setExpDate] = useState(new Date().toISOString().split('T')[0]);
  const [expCaseId, setExpCaseId] = useState('');
  const [expDescription, setExpDescription] = useState('');
  const [expCategory, setExpCategory] = useState('other');
  const [expAmount, setExpAmount] = useState(0);

  // Retainer form
  const [retCaseId, setRetCaseId] = useState('');
  const [retClientName, setRetClientName] = useState('');
  const [retTotalAmount, setRetTotalAmount] = useState(0);
  const [retHourlyRate, setRetHourlyRate] = useState(() => getDefaultRate());
  const [retMinBalance, setRetMinBalance] = useState(0);

  // Draw retainer form
  const [drawRetainerId, setDrawRetainerId] = useState<string | null>(null);
  const [drawAmount, setDrawAmount] = useState(0);
  const [drawDescription, setDrawDescription] = useState('');

  // Record payment form
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('bank-transfer');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  const loadAllData = () => {
    setInvoices(getInvoices());
    setTimeEntries(getTimeEntries());
    setExpenses(getExpenses());
    setRetainers(getRetainers());
    setRates(getRates());
    setDashboard(getBillingDashboard());
    setPayments(loadPayments());
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Timer interval
  useEffect(() => {
    if (!timerRunning || !timerStart) return;
    const interval = setInterval(() => {
      setTimerElapsed(Math.floor((Date.now() - timerStart) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning, timerStart]);

  // Auto-populate client name when case is selected for invoice
  useEffect(() => {
    if (invFormCaseId) {
      const c = cases.find(c => c.id === invFormCaseId);
      if (c) setInvFormClientName(c.client);
    }
  }, [invFormCaseId, cases]);

  // Auto-set case filter for time entries timer
  useEffect(() => {
    if (timerCaseId && selectedCaseFilter === 'all') {
      // keep as-is
    }
  }, [timerCaseId]);

  const filteredInvoices = React.useMemo(() => {
    let list = invoices;
    if (selectedCaseFilter !== 'all') {
      list = list.filter(i => i.caseId === selectedCaseFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i =>
        i.number.toLowerCase().includes(q) ||
        i.clientName.toLowerCase().includes(q) ||
        i.caseTitle.toLowerCase().includes(q)
      );
    }
    return list;
  }, [invoices, selectedCaseFilter, searchQuery]);

  const filteredTimeEntries = React.useMemo(() => {
    let list = timeEntries;
    if (selectedCaseFilter !== 'all') {
      list = list.filter(e => e.caseId === selectedCaseFilter);
    }
    list = [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return list;
  }, [timeEntries, selectedCaseFilter]);

  const filteredExpenses = React.useMemo(() => {
    let list = expenses;
    if (selectedCaseFilter !== 'all') {
      list = list.filter(e => e.caseId === selectedCaseFilter);
    }
    list = [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return list;
  }, [expenses, selectedCaseFilter]);

  const handleStartTimer = () => {
    if (!timerCaseId) return;
    setTimerStart(Date.now());
    setTimerElapsed(0);
    setTimerRunning(true);
  };

  const handleStopTimer = () => {
    setTimerRunning(false);
  };

  const handleLogTimerEntry = () => {
    if (!timerCaseId || timerElapsed < 1) return;
    const c = cases.find(c => c.id === timerCaseId);
    const hours = Math.round((timerElapsed / 3600) * 100) / 100;
    const rate = timeRate;
    const entry: TimeEntry = {
      id: generateId(),
      caseId: timerCaseId,
      caseTitle: c?.title || timerCaseId,
      date: new Date().toISOString().split('T')[0],
      description: timerDescription || 'Timer entry',
      hours,
      rate,
      amount: Math.round(hours * rate * 100) / 100,
      billed: false,
      createdAt: Date.now(),
    };
    saveTimeEntry(entry);
    setTimerRunning(false);
    setTimerStart(null);
    setTimerElapsed(0);
    setTimerDescription('');
    loadAllData();
  };

  const handleAddTimeEntry = () => {
    if (!timeCaseId || !timeDescription || timeHours <= 0) return;
    const c = cases.find(c => c.id === timeCaseId);
    const amount = Math.round(timeHours * timeRate * 100) / 100;
    const entry: TimeEntry = {
      id: generateId(),
      caseId: timeCaseId,
      caseTitle: c?.title || timeCaseId,
      date: timeDate,
      description: timeDescription,
      hours: timeHours,
      rate: timeRate,
      amount,
      billed: false,
      createdAt: Date.now(),
    };
    saveTimeEntry(entry);
    setTimeDescription('');
    setTimeHours(1);
    setTimeRate(getDefaultRate());
    loadAllData();
  };

  const handleDeleteTimeEntry = (id: string) => {
    deleteTimeEntry(id);
    loadAllData();
  };

  const handleAddExpense = () => {
    if (!expCaseId || !expDescription || expAmount <= 0) return;
    const c = cases.find(c => c.id === expCaseId);
    const entry: Expense = {
      id: generateId(),
      caseId: expCaseId,
      caseTitle: c?.title || expCaseId,
      date: expDate,
      description: expDescription,
      category: expCategory,
      amount: expAmount,
      billed: false,
      createdAt: Date.now(),
    };
    saveExpense(entry);
    setExpDescription('');
    setExpAmount(0);
    setExpCategory('other');
    loadAllData();
  };

  const handleDeleteExpense = (id: string) => {
    deleteExpense(id);
    loadAllData();
  };

  const handleAddRetainer = () => {
    if (!retCaseId || !retClientName || retTotalAmount <= 0) return;
    const c = cases.find(c => c.id === retCaseId);
    const retainer: Retainer = {
      id: generateId(),
      caseId: retCaseId,
      caseTitle: c?.title || retCaseId,
      clientName: retClientName,
      totalAmount: retTotalAmount,
      remainingAmount: retTotalAmount,
      hourlyRate: retHourlyRate,
      minimumBalance: retMinBalance,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    saveRetainer(retainer);
    setRetClientName('');
    setRetTotalAmount(0);
    setRetHourlyRate(getDefaultRate());
    setRetMinBalance(0);
    loadAllData();
  };

  const handleDeleteRetainer = (id: string) => {
    deleteRetainer(id);
    loadAllData();
  };

  const handleDrawRetainer = () => {
    if (!drawRetainerId || drawAmount <= 0) return;
    const retainer = retainers.find(r => r.id === drawRetainerId);
    if (!retainer) return;
    drawRetainer(drawRetainerId, drawAmount, drawDescription, retainer.caseId);
    setDrawRetainerId(null);
    setDrawAmount(0);
    setDrawDescription('');
    loadAllData();
  };

  const handleCreateInvoice = () => {
    if (!invFormCaseId) return;
    const c = cases.find(c => c.id === invFormCaseId);
    if (!c) return;
    const inv = createInvoice(
      invFormCaseId,
      c.title,
      invFormClientName || c.client,
      invFormClientEmail || undefined,
      invFormSelectedTimes,
      invFormSelectedExpenses,
      invFormNotes || undefined,
    );
    setShowCreateInvoice(false);
    setInvFormCaseId('');
    setInvFormClientName('');
    setInvFormClientEmail('');
    setInvFormNotes('');
    setInvFormSelectedTimes([]);
    setInvFormSelectedExpenses([]);
    setInvoiceDetailId(inv.id);
    loadAllData();
  };

  const handleRecordPayment = () => {
    if (!paymentInvoiceId || paymentAmount <= 0) return;
    const inv = invoices.find(i => i.id === paymentInvoiceId);
    if (!inv) return;
    recordPayment(paymentInvoiceId, inv.caseId, paymentAmount, paymentMethod, paymentReference || undefined, paymentNotes || undefined);
    setPaymentInvoiceId(null);
    setPaymentAmount(0);
    setPaymentReference('');
    setPaymentNotes('');
    loadAllData();
  };

  const handleStatusChange = (id: string, status: InvoiceStatus) => {
    updateInvoiceStatus(id, status);
    loadAllData();
  };

  const handleDeleteInvoice = (id: string) => {
    deleteInvoice(id);
    if (invoiceDetailId === id) setInvoiceDetailId(null);
    loadAllData();
  };

  const handleCopyMarkdown = (inv: Invoice) => {
    navigator.clipboard.writeText(exportInvoiceAsMarkdown(inv)).catch(() => {});
  };

  const handleCopyText = (inv: Invoice) => {
    navigator.clipboard.writeText(exportInvoiceAsText(inv)).catch(() => {});
  };

  const invoiceDetail = invoiceDetailId ? invoices.find(i => i.id === invoiceDetailId) : null;
  const invoicePayments = invoiceDetail ? payments.filter(p => p.invoiceId === invoiceDetail.id) : [];

  const unbilledTimes = React.useMemo(() => {
    if (!invFormCaseId) return [];
    return getUnbilledTime(invFormCaseId);
  }, [invFormCaseId, showCreateInvoice, timeEntries]);

  const unbilledExpenses = React.useMemo(() => {
    if (!invFormCaseId) return [];
    return getUnbilledExpenses(invFormCaseId);
  }, [invFormCaseId, showCreateInvoice, expenses]);

  const invPreviewTotal = React.useMemo(() => {
    const timeAmt = unbilledTimes
      .filter(e => invFormSelectedTimes.includes(e.id))
      .reduce((s, e) => s + e.amount, 0);
    const expAmt = unbilledExpenses
      .filter(e => invFormSelectedExpenses.includes(e.id))
      .reduce((s, e) => s + e.amount, 0);
    return timeAmt + expAmt;
  }, [unbilledTimes, unbilledExpenses, invFormSelectedTimes, invFormSelectedExpenses]);

  // ── Render helpers ──────────────────────────────────────────────────────────

  const MetricCard = ({ icon: Icon, label, value, subtitle, color = 'text-gold-500' }: {
    icon: React.FC<{ size?: number; className?: string }>;
    label: string;
    value: string;
    subtitle?: string;
    color?: string;
  }) => (
    <div className="bg-slate-900 border border-slate-700/50 rounded-lg p-5 transition-all duration-200 hover:border-slate-600/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{label}</span>
        <Icon size={20} className={color} />
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {subtitle && <div className="text-slate-500 text-xs mt-1">{subtitle}</div>}
    </div>
  );

  const renderOverview = () => {
    if (!dashboard) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="text-gold-500 animate-spin" />
        </div>
      );
    }
    return (
      <div className="space-y-6">
        {/* Row 1 — Revenue */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard icon={DollarSign} label="Total Invoiced" value={formatCurrency(dashboard.totalInvoiced)} color="text-green-400" />
          <MetricCard icon={TrendingUp} label="Total Collected" value={formatCurrency(dashboard.totalCollected)} color="text-gold-500" />
          <MetricCard icon={Clock3} label="Outstanding" value={formatCurrency(dashboard.totalOutstanding)} color="text-amber-400" />
          <MetricCard icon={AlertTriangle} label="Overdue" value={formatCurrency(dashboard.overdueAmount)} subtitle={`${dashboard.overdueCount} invoice${dashboard.overdueCount !== 1 ? 's' : ''}`} color="text-red-400" />
        </div>

        {/* Row 2 — This Month */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard icon={Calendar} label="Billed This Month" value={formatCurrency(dashboard.thisMonthBilled)} color="text-blue-400" />
          <MetricCard icon={CreditCard} label="Collected This Month" value={formatCurrency(dashboard.thisMonthCollected)} color="text-green-400" />
          <MetricCard icon={Clock} label="Hours This Month" value={`${dashboard.thisMonthHours.toFixed(1)}h`} color="text-purple-400" />
        </div>

        {/* Row 3 — Retainers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MetricCard icon={Wallet} label="Active Retainers" value={String(dashboard.activeRetainers)} color="text-gold-500" />
          <MetricCard icon={Building2} label="Retainer Balance" value={formatCurrency(dashboard.retainerBalance)} color="text-green-400" />
        </div>

        {/* Quick Actions */}
        <div className="bg-slate-900 border border-slate-700/50 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Quick Actions</h3>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => { setActiveTab('invoices'); setShowCreateInvoice(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-gold-500 text-black text-sm font-semibold rounded-lg transition-all duration-200 hover:bg-gold-400"
            >
              <Plus size={16} /> New Invoice
            </button>
            <button
              onClick={() => setActiveTab('time')}
              className="flex items-center gap-2 px-4 py-2 border border-slate-600 text-slate-300 text-sm font-semibold rounded-lg transition-all duration-200 hover:border-slate-500 hover:text-white"
            >
              <Clock size={16} /> Log Time
            </button>
            <button
              onClick={() => setActiveTab('expenses')}
              className="flex items-center gap-2 px-4 py-2 border border-slate-600 text-slate-300 text-sm font-semibold rounded-lg transition-all duration-200 hover:border-slate-500 hover:text-white"
            >
              <Receipt size={16} /> Add Expense
            </button>
          </div>
        </div>

        {/* Recent Invoices */}
        <div className="bg-slate-900 border border-slate-700/50 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Recent Invoices</h3>
          {invoices.length === 0 ? (
            <p className="text-slate-500 text-sm">No invoices yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                    <th className="pb-2">Number</th>
                    <th className="pb-2">Case</th>
                    <th className="pb-2">Client</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2 text-right">Total</th>
                    <th className="pb-2 text-right">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.slice(0, 5).map(inv => {
                    const sb = statusBadge(inv.status);
                    return (
                      <tr key={inv.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-all duration-200" onClick={() => { setActiveTab('invoices'); setInvoiceDetailId(inv.id); }}>
                        <td className="py-2.5 text-white font-medium">{inv.number}</td>
                        <td className="py-2.5 text-slate-300">{inv.caseTitle}</td>
                        <td className="py-2.5 text-slate-400">{inv.clientName}</td>
                        <td className="py-2.5"><span className={`px-2 py-0.5 rounded text-xs font-medium ${sb.bg} ${sb.text}`}>{sb.label}</span></td>
                        <td className="py-2.5 text-right text-white">{formatCurrency(inv.total)}</td>
                        <td className="py-2.5 text-right text-green-400">{formatCurrency(inv.amountPaid || 0)}</td>
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
  };

  const renderInvoices = () => (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Invoices</h2>
        <button
          onClick={() => setShowCreateInvoice(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gold-500 text-black text-sm font-semibold rounded-lg transition-all duration-200 hover:bg-gold-400"
        >
          <Plus size={16} /> New Invoice
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={selectedCaseFilter}
          onChange={e => setSelectedCaseFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
        >
          <option value="all">All Cases</option>
          {cases.map(c => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search by number, client, or case..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-gold-500/50 placeholder-slate-500"
          />
        </div>
      </div>

      {/* Invoice list */}
      {filteredInvoices.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <FileText size={48} className="mx-auto mb-3 opacity-30" />
          <p>No invoices yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-slate-900 border border-slate-700/50 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                <th className="p-3">Number</th>
                <th className="p-3">Case</th>
                <th className="p-3">Client</th>
                <th className="p-3">Status</th>
                <th className="p-3">Issue Date</th>
                <th className="p-3">Due Date</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">Paid</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map(inv => {
                const sb = statusBadge(inv.status);
                return (
                  <tr key={inv.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-all duration-200">
                    <td className="p-3">
                      <button
                        onClick={() => setInvoiceDetailId(invoiceDetailId === inv.id ? null : inv.id)}
                        className="text-gold-400 font-medium hover:text-gold-300 transition-all duration-200"
                      >
                        {inv.number}
                      </button>
                    </td>
                    <td className="p-3 text-slate-300">{inv.caseTitle}</td>
                    <td className="p-3 text-slate-400">{inv.clientName}</td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${sb.bg} ${sb.text}`}>{sb.label}</span></td>
                    <td className="p-3 text-slate-400">{formatDate(inv.issueDate)}</td>
                    <td className="p-3 text-slate-400">{formatDate(inv.dueDate)}</td>
                    <td className="p-3 text-right text-white">{formatCurrency(inv.total)}</td>
                    <td className="p-3 text-right text-green-400">{formatCurrency(inv.amountPaid || 0)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setInvoiceDetailId(invoiceDetailId === inv.id ? null : inv.id)}
                          className="p-1.5 text-slate-400 hover:text-white transition-all duration-200"
                          title="View"
                        >
                          <Eye size={15} />
                        </button>
                        {inv.status === 'draft' && (
                          <button
                            onClick={() => handleStatusChange(inv.id, 'sent')}
                            className="p-1.5 text-blue-400 hover:text-blue-300 transition-all duration-200"
                            title="Mark as Sent"
                          >
                            <Send size={15} />
                          </button>
                        )}
                        {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                          <button
                            onClick={() => handleStatusChange(inv.id, 'paid')}
                            className="p-1.5 text-green-400 hover:text-green-300 transition-all duration-200"
                            title="Mark as Paid"
                          >
                            <CheckCircle2 size={15} />
                          </button>
                        )}
                        {inv.status !== 'paid' && inv.status !== 'cancelled' && inv.dueDate < new Date().toISOString().split('T')[0] && (
                          <button
                            onClick={() => handleStatusChange(inv.id, 'overdue')}
                            className="p-1.5 text-red-400 hover:text-red-300 transition-all duration-200"
                            title="Mark Overdue"
                          >
                            <AlertTriangle size={15} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteInvoice(inv.id)}
                          className="p-1.5 text-slate-500 hover:text-red-400 transition-all duration-200"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Invoice Detail */}
      {invoiceDetail && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-lg p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">Invoice {invoiceDetail.number}</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopyMarkdown(invoiceDetail)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-600 text-slate-300 text-xs rounded-lg transition-all duration-200 hover:border-slate-500"
              >
                <Copy size={13} /> Markdown
              </button>
              <button
                onClick={() => handleCopyText(invoiceDetail)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-600 text-slate-300 text-xs rounded-lg transition-all duration-200 hover:border-slate-500"
              >
                <Download size={13} /> Text
              </button>
              <button
                onClick={() => setPaymentInvoiceId(invoiceDetail.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/80 text-white text-xs rounded-lg transition-all duration-200 hover:bg-green-500"
              >
                <DollarSign size={13} /> Record Payment
              </button>
              <button
                onClick={() => setInvoiceDetailId(null)}
                className="p-1.5 text-slate-400 hover:text-white transition-all duration-200"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Invoice header info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500">From:</span>
              <p className="text-white font-medium">CaseBuddy Law Firm</p>
            </div>
            <div>
              <span className="text-slate-500">Bill To:</span>
              <p className="text-white font-medium">{invoiceDetail.clientName}</p>
              {invoiceDetail.clientEmail && <p className="text-slate-400">{invoiceDetail.clientEmail}</p>}
            </div>
            <div>
              <span className="text-slate-500">Case:</span>
              <p className="text-white">{invoiceDetail.caseTitle}</p>
            </div>
            <div>
              <span className="text-slate-500">Status:</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ml-1 ${statusBadge(invoiceDetail.status).bg} ${statusBadge(invoiceDetail.status).text}`}>
                {statusBadge(invoiceDetail.status).label}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Issued:</span>
              <p className="text-white">{formatDate(invoiceDetail.issueDate)}</p>
            </div>
            <div>
              <span className="text-slate-500">Due:</span>
              <p className="text-white">{formatDate(invoiceDetail.dueDate)}</p>
            </div>
          </div>

          {/* Line items */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-2">Line Items</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                    <th className="pb-2">Type</th>
                    <th className="pb-2">Description</th>
                    <th className="pb-2">Date</th>
                    <th className="pb-2 text-right">Hours</th>
                    <th className="pb-2 text-right">Rate</th>
                    <th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceDetail.lineItems.map(item => (
                    <tr key={item.id} className="border-b border-slate-800/50">
                      <td className="py-2"><span className="px-2 py-0.5 text-xs rounded bg-slate-800 text-slate-400 uppercase">{item.type}</span></td>
                      <td className="py-2 text-slate-300">{item.description}</td>
                      <td className="py-2 text-slate-400">{item.date ? formatDate(item.date) : '-'}</td>
                      <td className="py-2 text-right text-slate-300">{item.hours ? item.hours.toFixed(2) : '-'}</td>
                      <td className="py-2 text-right text-slate-300">{item.rate ? formatCurrency(item.rate) : '-'}</td>
                      <td className="py-2 text-right text-white">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col items-end gap-1 mt-3 text-sm">
              <div className="flex justify-between w-48"><span className="text-slate-500">Subtotal</span><span className="text-white">{formatCurrency(invoiceDetail.subtotal)}</span></div>
              {invoiceDetail.taxRate > 0 && (
                <div className="flex justify-between w-48"><span className="text-slate-500">Tax ({(invoiceDetail.taxRate * 100).toFixed(1)}%)</span><span className="text-white">{formatCurrency(invoiceDetail.taxAmount)}</span></div>
              )}
              <div className="flex justify-between w-48 border-t border-slate-700 pt-1"><span className="text-white font-semibold">Total</span><span className="text-gold-400 font-bold">{formatCurrency(invoiceDetail.total)}</span></div>
              <div className="flex justify-between w-48"><span className="text-slate-500">Paid</span><span className="text-green-400">{formatCurrency(invoiceDetail.amountPaid || 0)}</span></div>
              <div className="flex justify-between w-48"><span className="text-slate-500">Balance</span><span className="text-amber-400">{formatCurrency(invoiceDetail.total - (invoiceDetail.amountPaid || 0))}</span></div>
            </div>
          </div>

          {/* Payment history */}
          {invoicePayments.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-white mb-2">Payment History</h4>
              <div className="space-y-1">
                {invoicePayments.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm bg-slate-800/50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className="text-green-400 font-medium">{formatCurrency(p.amount)}</span>
                      <span className="text-slate-400">{p.method}</span>
                      <span className="text-slate-500">{p.date}</span>
                    </div>
                    {p.reference && <span className="text-slate-500 text-xs">Ref: {p.reference}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {invoiceDetail.notes && (
            <div>
              <h4 className="text-sm font-semibold text-white mb-1">Notes</h4>
              <p className="text-slate-400 text-sm">{invoiceDetail.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Create Invoice Modal */}
      {showCreateInvoice && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Create Invoice</h3>
              <button onClick={() => setShowCreateInvoice(false)} className="text-slate-400 hover:text-white transition-all duration-200"><X size={20} /></button>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Case</label>
              <select
                value={invFormCaseId}
                onChange={e => setInvFormCaseId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
              >
                <option value="">Select a case...</option>
                {cases.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Client Name</label>
              <input
                type="text"
                value={invFormClientName}
                onChange={e => setInvFormClientName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Client Email</label>
              <input
                type="email"
                value={invFormClientEmail}
                onChange={e => setInvFormClientEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Due in (days)</label>
              <input
                type="number"
                value={invFormDueDays}
                onChange={e => setInvFormDueDays(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Notes</label>
              <textarea
                value={invFormNotes}
                onChange={e => setInvFormNotes(e.target.value)}
                rows={2}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
              />
            </div>

            {unbilledTimes.length > 0 && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">Unbilled Time Entries</label>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {unbilledTimes.map(e => (
                    <label key={e.id} className="flex items-center gap-2 text-sm text-slate-300 bg-slate-800/50 rounded px-3 py-2 cursor-pointer hover:bg-slate-800 transition-all duration-200">
                      <input
                        type="checkbox"
                        checked={invFormSelectedTimes.includes(e.id)}
                        onChange={checked => {
                          setInvFormSelectedTimes(prev =>
                            checked.target.checked ? [...prev, e.id] : prev.filter(id => id !== e.id)
                          );
                        }}
                        className="rounded accent-gold-500"
                      />
                      <span className="flex-1">{e.description}</span>
                      <span className="text-slate-400">{e.hours.toFixed(1)}h</span>
                      <span className="text-gold-400">{formatCurrency(e.amount)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {unbilledExpenses.length > 0 && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">Unbilled Expenses</label>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {unbilledExpenses.map(e => (
                    <label key={e.id} className="flex items-center gap-2 text-sm text-slate-300 bg-slate-800/50 rounded px-3 py-2 cursor-pointer hover:bg-slate-800 transition-all duration-200">
                      <input
                        type="checkbox"
                        checked={invFormSelectedExpenses.includes(e.id)}
                        onChange={checked => {
                          setInvFormSelectedExpenses(prev =>
                            checked.target.checked ? [...prev, e.id] : prev.filter(id => id !== e.id)
                          );
                        }}
                        className="rounded accent-gold-500"
                      />
                      <span className="flex-1">{e.description}</span>
                      <span className="text-slate-400 text-xs">[{e.category}]</span>
                      <span className="text-gold-400">{formatCurrency(e.amount)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center border-t border-slate-700 pt-3">
              <span className="text-slate-400">Total Preview:</span>
              <span className="text-gold-400 text-lg font-bold">{formatCurrency(invPreviewTotal)}</span>
            </div>

            <button
              onClick={handleCreateInvoice}
              disabled={!invFormCaseId}
              className="w-full py-2.5 bg-gold-500 text-black font-semibold rounded-lg transition-all duration-200 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Create Invoice
            </button>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {paymentInvoiceId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Record Payment</h3>
              <button onClick={() => setPaymentInvoiceId(null)} className="text-slate-400 hover:text-white transition-all duration-200"><X size={20} /></button>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                value={paymentAmount || ''}
                onChange={e => setPaymentAmount(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Method</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
              >
                <option value="bank-transfer">Bank Transfer</option>
                <option value="check">Check</option>
                <option value="credit-card">Credit Card</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Reference</label>
              <input
                type="text"
                value={paymentReference}
                onChange={e => setPaymentReference(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Notes</label>
              <input
                type="text"
                value={paymentNotes}
                onChange={e => setPaymentNotes(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
              />
            </div>
            <button
              onClick={handleRecordPayment}
              disabled={paymentAmount <= 0}
              className="w-full py-2.5 bg-green-600 text-white font-semibold rounded-lg transition-all duration-200 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Record Payment
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderTimeTracking = () => (
    <div className="space-y-6">
      {/* Timer */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            {timerRunning ? <Timer size={16} className="text-green-400 animate-pulse" /> : <TimerOff size={16} className="text-slate-500" />}
            Time Tracker
          </h3>
          {timerRunning && <span className="text-xs text-green-400 font-medium">Running</span>}
        </div>

        <div className="text-5xl font-mono text-center text-gold-400 font-bold py-6 tabular-nums">
          {formatTimer(timerElapsed)}
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Case</label>
            <select
              value={timerCaseId}
              onChange={e => setTimerCaseId(e.target.value)}
              disabled={timerRunning}
              className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50 disabled:opacity-50"
            >
              <option value="">Select case...</option>
              {cases.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Description</label>
            <input
              type="text"
              value={timerDescription}
              onChange={e => setTimerDescription(e.target.value)}
              disabled={timerRunning}
              placeholder="What are you working on?"
              className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50 disabled:opacity-50 placeholder-slate-500"
            />
          </div>

          <div className="flex items-center gap-3">
            {!timerRunning ? (
              <button
                onClick={handleStartTimer}
                disabled={!timerCaseId}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg font-semibold transition-all duration-200 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play size={16} /> Start
              </button>
            ) : (
              <button
                onClick={handleStopTimer}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg font-semibold transition-all duration-200 hover:bg-red-500"
              >
                <Square size={16} /> Stop
              </button>
            )}

            {!timerRunning && timerElapsed > 0 && (
              <button
                onClick={handleLogTimerEntry}
                className="flex items-center gap-2 px-5 py-2.5 bg-gold-500 text-black rounded-lg font-semibold transition-all duration-200 hover:bg-gold-400"
              >
                <Plus size={16} /> Log Entry ({formatTimer(timerElapsed)})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Manual time entry */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Log Time Manually</h3>
          <button
            onClick={() => setShowAddTime(!showAddTime)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-600 text-slate-300 text-xs rounded-lg transition-all duration-200 hover:border-slate-500"
          >
            <Plus size={14} /> Add Entry
          </button>
        </div>

        {showAddTime && (
          <div className="space-y-3 mb-4 border border-slate-700/50 rounded-lg p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Date</label>
                <input
                  type="date"
                  value={timeDate}
                  onChange={e => setTimeDate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Case</label>
                <select
                  value={timeCaseId}
                  onChange={e => setTimeCaseId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
                >
                  <option value="">Select case...</option>
                  {cases.map(c => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Description</label>
                <input
                  type="text"
                  value={timeDescription}
                  onChange={e => setTimeDescription(e.target.value)}
                  placeholder="Work description..."
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50 placeholder-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Hours</label>
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  value={timeHours}
                  onChange={e => setTimeHours(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Rate ($/hr)</label>
                <input
                  type="number"
                  step="1"
                  value={timeRate}
                  onChange={e => setTimeRate(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
                />
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">
                Amount: <span className="text-gold-400 font-semibold">{formatCurrency(timeHours * timeRate)}</span>
              </span>
              <button
                onClick={handleAddTimeEntry}
                disabled={!timeCaseId || !timeDescription || timeHours <= 0}
                className="px-4 py-2 bg-gold-500 text-black text-sm font-semibold rounded-lg transition-all duration-200 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add Entry
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Time entries list */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Time Entries</h3>
          <select
            value={selectedCaseFilter}
            onChange={e => setSelectedCaseFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-gold-500/50"
          >
            <option value="all">All Cases</option>
            {cases.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>

        {filteredTimeEntries.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">No time entries yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Case</th>
                  <th className="pb-2">Description</th>
                  <th className="pb-2 text-right">Hours</th>
                  <th className="pb-2 text-right">Rate</th>
                  <th className="pb-2 text-right">Amount</th>
                  <th className="pb-2">Billed</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredTimeEntries.map(e => (
                  <tr key={e.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-all duration-200">
                    <td className="py-2 text-slate-400">{formatDate(e.date)}</td>
                    <td className="py-2 text-slate-300">{e.caseTitle}</td>
                    <td className="py-2 text-slate-300 max-w-xs truncate">{e.description}</td>
                    <td className="py-2 text-right text-slate-300">{e.hours.toFixed(2)}</td>
                    <td className="py-2 text-right text-slate-400">{formatCurrency(e.rate)}</td>
                    <td className="py-2 text-right text-white">{formatCurrency(e.amount)}</td>
                    <td className="py-2">
                      {e.billed ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-900/50 text-green-400">Billed</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-900/50 text-amber-400">Unbilled</span>
                      )}
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => handleDeleteTimeEntry(e.id)}
                        className="p-1 text-slate-500 hover:text-red-400 transition-all duration-200"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  const renderExpenses = () => (
    <div className="space-y-6">
      {/* Add expense */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Add Expense</h3>
          <button
            onClick={() => setShowAddExpense(!showAddExpense)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-600 text-slate-300 text-xs rounded-lg transition-all duration-200 hover:border-slate-500"
          >
            <Plus size={14} /> Add Expense
          </button>
        </div>

        {showAddExpense && (
          <div className="space-y-3 border border-slate-700/50 rounded-lg p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Date</label>
                <input
                  type="date"
                  value={expDate}
                  onChange={e => setExpDate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Case</label>
                <select
                  value={expCaseId}
                  onChange={e => setExpCaseId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
                >
                  <option value="">Select case...</option>
                  {cases.map(c => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Description</label>
                <input
                  type="text"
                  value={expDescription}
                  onChange={e => setExpDescription(e.target.value)}
                  placeholder="Expense description..."
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50 placeholder-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Category</label>
                <select
                  value={expCategory}
                  onChange={e => setExpCategory(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
                >
                  {EXPENSE_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat.replace(/-/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={expAmount || ''}
                  onChange={e => setExpAmount(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
                />
              </div>
            </div>
            <button
              onClick={handleAddExpense}
              disabled={!expCaseId || !expDescription || expAmount <= 0}
              className="w-full py-2 bg-gold-500 text-black text-sm font-semibold rounded-lg transition-all duration-200 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add Expense
            </button>
          </div>
        )}
      </div>

      {/* Expenses list */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Expenses</h3>
          <select
            value={selectedCaseFilter}
            onChange={e => setSelectedCaseFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-gold-500/50"
          >
            <option value="all">All Cases</option>
            {cases.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>

        {filteredExpenses.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">No expenses yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Case</th>
                  <th className="pb-2">Description</th>
                  <th className="pb-2">Category</th>
                  <th className="pb-2 text-right">Amount</th>
                  <th className="pb-2">Billed</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map(e => (
                  <tr key={e.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-all duration-200">
                    <td className="py-2 text-slate-400">{formatDate(e.date)}</td>
                    <td className="py-2 text-slate-300">{e.caseTitle}</td>
                    <td className="py-2 text-slate-300 max-w-xs truncate">{e.description}</td>
                    <td className="py-2">
                      <span className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-400 capitalize">{e.category.replace(/-/g, ' ')}</span>
                    </td>
                    <td className="py-2 text-right text-white">{formatCurrency(e.amount)}</td>
                    <td className="py-2">
                      {e.billed ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-900/50 text-green-400">Billed</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-900/50 text-amber-400">Unbilled</span>
                      )}
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => handleDeleteExpense(e.id)}
                        className="p-1 text-slate-500 hover:text-red-400 transition-all duration-200"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  const renderRetainers = () => (
    <div className="space-y-6">
      {/* Add retainer */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Add Retainer</h3>
          <button
            onClick={() => setShowAddRetainer(!showAddRetainer)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-600 text-slate-300 text-xs rounded-lg transition-all duration-200 hover:border-slate-500"
          >
            <Plus size={14} /> Add Retainer
          </button>
        </div>

        {showAddRetainer && (
          <div className="space-y-3 border border-slate-700/50 rounded-lg p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Case</label>
                <select
                  value={retCaseId}
                  onChange={e => setRetCaseId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
                >
                  <option value="">Select case...</option>
                  {cases.map(c => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Client Name</label>
                <input
                  type="text"
                  value={retClientName}
                  onChange={e => setRetClientName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Total Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={retTotalAmount || ''}
                  onChange={e => setRetTotalAmount(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Hourly Rate</label>
                <input
                  type="number"
                  step="1"
                  value={retHourlyRate}
                  onChange={e => setRetHourlyRate(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Minimum Balance</label>
                <input
                  type="number"
                  step="0.01"
                  value={retMinBalance || ''}
                  onChange={e => setRetMinBalance(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
                />
              </div>
            </div>
            <button
              onClick={handleAddRetainer}
              disabled={!retCaseId || !retClientName || retTotalAmount <= 0}
              className="w-full py-2 bg-gold-500 text-black text-sm font-semibold rounded-lg transition-all duration-200 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add Retainer
            </button>
          </div>
        )}
      </div>

      {/* Retainers list */}
      <div className="space-y-4">
        {retainers.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Wallet size={48} className="mx-auto mb-3 opacity-30" />
            <p>No retainers yet</p>
          </div>
        ) : (
          retainers.map(r => {
            const pct = r.totalAmount > 0 ? (r.remainingAmount / r.totalAmount) * 100 : 0;
            const isLow = r.remainingAmount < r.minimumBalance;
            return (
              <div key={r.id} className="bg-slate-900 border border-slate-700/50 rounded-lg p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-white font-semibold">{r.caseTitle}</h4>
                    <p className="text-slate-400 text-sm">{r.clientName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setDrawRetainerId(r.id); setDrawAmount(0); setDrawDescription(''); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-600 text-slate-300 text-xs rounded-lg transition-all duration-200 hover:border-slate-500"
                    >
                      <ArrowUpRight size={13} /> Draw
                    </button>
                    <button
                      onClick={() => handleDeleteRetainer(r.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400 transition-all duration-200"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-slate-500 text-xs">Total</span>
                    <p className="text-white font-medium">{formatCurrency(r.totalAmount)}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Remaining</span>
                    <p className={`font-medium ${isLow ? 'text-red-400' : 'text-green-400'}`}>{formatCurrency(r.remainingAmount)}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Hourly Rate</span>
                    <p className="text-white">{formatCurrency(r.hourlyRate)}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Min Balance</span>
                    <p className="text-white">{formatCurrency(r.minimumBalance)}</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">Used: {formatCurrency(r.totalAmount - r.remainingAmount)}</span>
                    <span className="text-slate-500">{pct.toFixed(0)}% remaining</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${isLow ? 'bg-red-500' : 'bg-gold-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {r.lastDrawAt && (
                  <p className="text-xs text-slate-500">Last draw: {formatDate(r.lastDrawAt.split('T')[0])}</p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Draw retainer modal */}
      {drawRetainerId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Draw from Retainer</h3>
              <button onClick={() => setDrawRetainerId(null)} className="text-slate-400 hover:text-white transition-all duration-200"><X size={20} /></button>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                value={drawAmount || ''}
                onChange={e => setDrawAmount(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Description</label>
              <input
                type="text"
                value={drawDescription}
                onChange={e => setDrawDescription(e.target.value)}
                placeholder="Reason for draw..."
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold-500/50 placeholder-slate-500"
              />
            </div>
            <button
              onClick={handleDrawRetainer}
              disabled={drawAmount <= 0}
              className="w-full py-2.5 bg-gold-500 text-black font-semibold rounded-lg transition-all duration-200 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Draw Funds
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <DollarSign size={24} className="text-gold-500" />
        <h1 className="text-xl font-bold text-white">Billing</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 border border-slate-700/50 rounded-lg p-1 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setInvoiceDetailId(null); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                active
                  ? 'bg-gold-500/20 text-gold-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'invoices' && renderInvoices()}
      {activeTab === 'time' && renderTimeTracking()}
      {activeTab === 'expenses' && renderExpenses()}
      {activeTab === 'retainers' && renderRetainers()}
    </div>
  );
};

export default BillingDashboard;
