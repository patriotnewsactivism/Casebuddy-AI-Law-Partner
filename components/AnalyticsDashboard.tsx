import React, { useState, useEffect } from 'react';
import {
  BarChart3, TrendingUp, DollarSign, Clock, Users,
  Target, Activity, Award, Zap, Loader2, Calendar, ArrowUpRight,
  ArrowDownRight, Gavel, Percent, FileText, ChevronUp, BrainCircuit
} from 'lucide-react';
import {
  getFirmAnalytics, getPerformanceMetrics, generateAnalyticsInsight,
  getRevenueForecast, type FirmAnalytics, type PerformanceMetric
} from '../services/analyticsService';

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
};

const formatNumber = (n: number): string => {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
};

const formatDecimal = (n: number): string => {
  return n.toFixed(1);
};

interface KpiCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  trend?: 'up' | 'down' | 'flat';
  trendValue?: string;
  description?: string;
  colorClass: string;
  bgClass: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ icon: Icon, label, value, trend, trendValue, description, colorClass, bgClass }) => {
  const trendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : ChevronUp;
  const trendColor = trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-slate-500';

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-5 hover:border-slate-600/50 transition-colors">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${bgClass}`}>
          <Icon size={17} className={colorClass} />
        </div>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{label}</p>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-white tracking-tight">{value}</span>
        {trend && (
          <span className={`flex items-center gap-0.5 text-xs font-semibold ${trendColor}`}>
            <trendIcon size={14} />
            {trendValue}
          </span>
        )}
      </div>
      {description && (
        <p className="text-xs text-slate-500 mt-1.5">{description}</p>
      )}
    </div>
  );
};

// ─── Performance Metric Card ─────────────────────────────────────────────────

const MetricCard: React.FC<{ metric: PerformanceMetric }> = ({ metric }) => {
  const pctToTarget = metric.target > 0 ? Math.min(100, Math.round((metric.value / metric.target) * 100)) : 0;
  const barColor = pctToTarget >= 90 ? 'bg-green-500' : pctToTarget >= 50 ? 'bg-amber-500' : 'bg-red-500';
  const textColor = pctToTarget >= 90 ? 'text-green-400' : pctToTarget >= 50 ? 'text-amber-400' : 'text-red-400';

  const formatValue = (v: number, unit: string): string => {
    if (unit === '$') return formatCurrency(v);
    if (unit === 'hrs') return formatDecimal(v);
    return v.toString();
  };

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-300">{metric.name}</span>
        <span className={`text-xs font-semibold ${textColor}`}>{pctToTarget}%</span>
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-xl font-bold text-white">{formatValue(metric.value, metric.unit)}</span>
        <span className="text-xs text-slate-500">/ {metric.unit === '$' ? formatCurrency(metric.target) : metric.unit === 'hrs' ? metric.target : metric.target}{metric.unit !== '$' && metric.unit !== 'hrs' ? ` ${metric.unit}` : ''}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pctToTarget}%` }}
        />
      </div>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

const AnalyticsDashboard: React.FC = () => {
  const [analytics, setAnalytics] = useState<FirmAnalytics | null>(null);
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [forecast, setForecast] = useState<{ nextMonth: number; nextQuarter: number; confidence: number } | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const a = getFirmAnalytics();
    const m = getPerformanceMetrics();
    const f = getRevenueForecast();
    setAnalytics(a);
    setMetrics(m);
    setForecast(f);
    setLoading(false);
  }, []);

  const handleGenerateInsight = async () => {
    if (!analytics) return;
    setInsightLoading(true);
    try {
      const result = await generateAnalyticsInsight(analytics);
      setInsight(result);
    } catch {
      setInsight('Unable to generate insight at this time.');
    } finally {
      setInsightLoading(false);
    }
  };

  const revenueGrowth = analytics?.revenueGrowth ?? 0;
  const revenueTrend: 'up' | 'down' | 'flat' = revenueGrowth > 5 ? 'up' : revenueGrowth < -5 ? 'down' : 'flat';

  const maxRevenue = analytics
    ? Math.max(...analytics.monthlyRevenueTrend.map(m => m.revenue), 1)
    : 1;

  const maxCaseCount = analytics
    ? Math.max(...analytics.caseTypeDistribution.map(c => c.count), 1)
    : 1;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={28} className="text-gold-500 animate-spin" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="flex items-center justify-center py-32">
        <p className="text-slate-400">No analytics data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Firm Analytics</h1>
          <p className="text-sm text-slate-400 mt-1">Performance metrics, revenue trends, and case intelligence</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-900 border border-slate-700/50 rounded-lg px-3 py-1.5">
          <Calendar size={14} />
          <span>Last 12 months</span>
        </div>
      </div>

      {/* ── AI Insight Bar ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gold-500/20 bg-gold-500/5 p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gold-500/10 flex items-center justify-center shrink-0">
              <BrainCircuit size={18} className="text-gold-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gold-400 mb-1">AI Executive Summary</h3>
              {insight ? (
                <p className="text-sm text-slate-300 leading-relaxed">{insight}</p>
              ) : (
                <p className="text-sm text-slate-500 italic">Click "Generate Insight" to get an AI-powered executive summary of your firm's performance.</p>
              )}
            </div>
          </div>
          <button
            onClick={handleGenerateInsight}
            disabled={insightLoading}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gold-500/10 border border-gold-500/30 text-gold-400 text-sm font-semibold hover:bg-gold-500/20 hover:border-gold-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {insightLoading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Zap size={14} />
                Generate Insight
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Row 1: Revenue KPIs ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={DollarSign}
          label="Total Revenue"
          value={formatCurrency(analytics.totalRevenue)}
          trend={revenueTrend}
          trendValue={`${revenueGrowth > 0 ? '+' : ''}${revenueGrowth}%`}
          description="Overall firm revenue"
          colorClass="text-emerald-400"
          bgClass="bg-emerald-500/10"
        />
        <KpiCard
          icon={TrendingUp}
          label="Revenue This Month"
          value={formatCurrency(analytics.revenueThisMonth)}
          trend={revenueTrend}
          trendValue={`${revenueGrowth > 0 ? '+' : ''}${revenueGrowth}%`}
          description={`Last month: ${formatCurrency(analytics.revenueLastMonth)}`}
          colorClass="text-gold-400"
          bgClass="bg-gold-500/10"
        />
        <KpiCard
          icon={Activity}
          label="Avg Per Case"
          value={formatCurrency(analytics.averageRevenuePerCase)}
          trend={analytics.averageRevenuePerCase >= 5000 ? 'up' : analytics.averageRevenuePerCase >= 3000 ? 'flat' : 'down'}
          trendValue={analytics.averageRevenuePerCase >= 5000 ? 'Strong' : analytics.averageRevenuePerCase >= 3000 ? 'Avg' : 'Low'}
          description="Revenue per case average"
          colorClass="text-blue-400"
          bgClass="bg-blue-500/10"
        />
        <KpiCard
          icon={BarChart3}
          label="Revenue Forecast"
          value={forecast ? formatCurrency(forecast.nextMonth) : '-'}
          trend="up"
          trendValue={`${forecast?.confidence ?? 0}% confidence`}
          description={`Next quarter: ${forecast ? formatCurrency(forecast.nextQuarter) : '-'}`}
          colorClass="text-purple-400"
          bgClass="bg-purple-500/10"
        />
      </div>

      {/* ── Row 2: Case KPIs ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Gavel}
          label="Total Cases"
          value={formatNumber(analytics.totalCases)}
          description="Cases in the system"
          colorClass="text-cyan-400"
          bgClass="bg-cyan-500/10"
        />
        <KpiCard
          icon={Zap}
          label="Active Cases"
          value={formatNumber(analytics.activeCases)}
          trend={analytics.activeCases > analytics.totalCases * 0.5 ? 'up' : 'flat'}
          trendValue={`${analytics.totalCases > 0 ? Math.round((analytics.activeCases / analytics.totalCases) * 100) : 0}% of total`}
          description="Currently in progress"
          colorClass="text-gold-400"
          bgClass="bg-gold-500/10"
        />
        <KpiCard
          icon={Award}
          label="Win Rate"
          value={`${analytics.winRate}%`}
          trend={analytics.winRate >= 70 ? 'up' : analytics.winRate >= 50 ? 'flat' : 'down'}
          trendValue={analytics.winRate >= 70 ? 'Excellent' : analytics.winRate >= 50 ? 'Good' : 'Needs work'}
          description="Closed cases won"
          colorClass="text-green-400"
          bgClass="bg-green-500/10"
        />
        <KpiCard
          icon={FileText}
          label="Opened This Month"
          value={formatNumber(analytics.casesOpenedThisMonth)}
          trend={analytics.casesOpenedThisMonth >= 5 ? 'up' : analytics.casesOpenedThisMonth >= 3 ? 'flat' : 'down'}
          trendValue={analytics.casesOpenedThisMonth >= 5 ? 'Strong' : analytics.casesOpenedThisMonth >= 3 ? 'Steady' : 'Slow'}
          description="New matters opened"
          colorClass="text-orange-400"
          bgClass="bg-orange-500/10"
        />
      </div>

      {/* ── Row 3: Efficiency KPIs ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Clock}
          label="Total Hours Billed"
          value={formatDecimal(analytics.totalHoursBilled)}
          trend={analytics.totalHoursBilled > 500 ? 'up' : analytics.totalHoursBilled > 200 ? 'flat' : 'down'}
          trendValue={analytics.totalHoursBilled > 500 ? 'High volume' : 'Moderate'}
          description="All-time billable hours"
          colorClass="text-sky-400"
          bgClass="bg-sky-500/10"
        />
        <KpiCard
          icon={Clock}
          label="Hours This Month"
          value={formatDecimal(analytics.hoursBilledThisMonth)}
          trend={analytics.hoursBilledThisMonth >= 160 ? 'up' : analytics.hoursBilledThisMonth >= 80 ? 'flat' : 'down'}
          trendValue={analytics.hoursBilledThisMonth >= 160 ? 'Target+' : analytics.hoursBilledThisMonth >= 80 ? 'On track' : 'Below'}
          description="Monthly billable hours"
          colorClass="text-gold-400"
          bgClass="bg-gold-500/10"
        />
        <KpiCard
          icon={Target}
          label="Avg Hours / Case"
          value={formatDecimal(analytics.averageHoursPerCase)}
          description="Average billed per case"
          colorClass="text-indigo-400"
          bgClass="bg-indigo-500/10"
        />
        <KpiCard
          icon={Percent}
          label="Utilization Rate"
          value={`${analytics.utilizationRate}%`}
          trend={analytics.utilizationRate >= 80 ? 'up' : analytics.utilizationRate >= 60 ? 'flat' : 'down'}
          trendValue={analytics.utilizationRate >= 80 ? 'Excellent' : analytics.utilizationRate >= 60 ? 'Good' : 'Low'}
          description="Billed vs total hours"
          colorClass="text-teal-400"
          bgClass="bg-teal-500/10"
        />
      </div>

      {/* ── Row 4: Client KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Users}
          label="Total Leads"
          value={formatNumber(analytics.totalLeads)}
          trend={analytics.totalLeads > 50 ? 'up' : analytics.totalLeads > 20 ? 'flat' : 'down'}
          trendValue={analytics.totalLeads > 50 ? 'Strong' : 'Steady'}
          description="All-time lead count"
          colorClass="text-pink-400"
          bgClass="bg-pink-500/10"
        />
        <KpiCard
          icon={TrendingUp}
          label="Conversion Rate"
          value={`${analytics.conversionRate}%`}
          trend={analytics.conversionRate >= 40 ? 'up' : analytics.conversionRate >= 25 ? 'flat' : 'down'}
          trendValue={analytics.conversionRate >= 40 ? 'High' : analytics.conversionRate >= 25 ? 'Average' : 'Low'}
          description="Lead to client rate"
          colorClass="text-emerald-400"
          bgClass="bg-emerald-500/10"
        />
        <KpiCard
          icon={DollarSign}
          label="Overdue Invoices"
          value={formatNumber(analytics.overdueInvoiceCount)}
          trend={analytics.overdueInvoiceCount > 0 ? 'down' : 'flat'}
          trendValue={analytics.overdueInvoiceCount > 0 ? formatCurrency(analytics.overdueInvoiceAmount) : 'All clear'}
          description="Outstanding payments"
          colorClass={analytics.overdueInvoiceCount > 0 ? 'text-red-400' : 'text-green-400'}
          bgClass={analytics.overdueInvoiceCount > 0 ? 'bg-red-500/10' : 'bg-green-500/10'}
        />
        <KpiCard
          icon={Users}
          label="Cases Per Attorney"
          value={formatDecimal(analytics.casesPerAttorney)}
          description="Average caseload"
          colorClass="text-violet-400"
          bgClass="bg-violet-500/10"
        />
      </div>

      {/* ── Two Column: Performance Metrics + Revenue Trend ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Metrics */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <Activity size={18} className="text-gold-400" />
            <h2 className="text-base font-bold text-white">Performance Metrics</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {metrics.map(m => (
              <MetricCard key={m.id} metric={m} />
            ))}
          </div>
        </div>

        {/* Revenue Trend */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <BarChart3 size={18} className="text-gold-400" />
            <h2 className="text-base font-bold text-white">Revenue Trend</h2>
          </div>
          <div className="flex items-end gap-1.5 h-48 mb-3">
            {analytics.monthlyRevenueTrend.map((m, i) => {
              const heightPct = maxRevenue > 0 ? (m.revenue / maxRevenue) * 100 : 0;
              const isUp = i > 0 ? m.revenue >= (analytics.monthlyRevenueTrend[i - 1]?.revenue ?? 0) : true;
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group" title={`${m.month}: ${formatCurrency(m.revenue)} (${m.cases} cases)`}>
                  <span className="text-[10px] text-slate-500 font-mono">{m.cases}</span>
                  <div className="w-full relative flex-1 flex flex-col justify-end">
                    <div
                      className={`w-full rounded-t transition-all duration-300 group-hover:brightness-125 ${isUp ? 'bg-gold-500' : 'bg-gold-500/70'}`}
                      style={{ height: `${Math.max(heightPct, 2)}%`, minHeight: 4 }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 rotate-45 sm:rotate-0 whitespace-nowrap mt-1">{m.month}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-gold-500" />
              Revenue
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-mono text-[10px]">3</span>
              Cases opened
            </div>
          </div>
        </div>
      </div>

      {/* ── Two Column: Case Type Distribution + Top Performing Cases ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Case Type Distribution */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <Gavel size={18} className="text-gold-400" />
            <h2 className="text-base font-bold text-white">Case Type Distribution</h2>
          </div>
          <div className="space-y-3">
            {analytics.caseTypeDistribution
              .sort((a, b) => b.count - a.count)
              .map(ct => {
                const widthPct = maxCaseCount > 0 ? (ct.count / maxCaseCount) * 100 : 0;
                return (
                  <div key={ct.type} className="group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-300">{ct.type}</span>
                      <span className="text-xs text-slate-500">{ct.count} cases · {formatCurrency(ct.revenue)}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gold-500/80 transition-all duration-500 group-hover:bg-gold-400"
                        style={{ width: `${Math.max(widthPct, 4)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            {analytics.caseTypeDistribution.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-4">No case type data available.</p>
            )}
          </div>
        </div>

        {/* Top Performing Cases */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <Award size={18} className="text-gold-400" />
            <h2 className="text-base font-bold text-white">Top Performing Cases</h2>
          </div>
          {analytics.topPerformingCases.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider py-2 pr-4">Case Title</th>
                    <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider py-2 px-3">Revenue</th>
                    <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider py-2 px-3">Hours</th>
                    <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider py-2 pl-3">Rev/Hour</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.topPerformingCases.map((c, i) => {
                    const revPerHour = c.hours > 0 ? Math.round(c.revenue / c.hours) : 0;
                    return (
                      <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 pr-4 font-medium text-slate-200 max-w-[180px] truncate">{c.title}</td>
                        <td className="py-2.5 px-3 text-right text-gold-400 font-semibold">{formatCurrency(c.revenue)}</td>
                        <td className="py-2.5 px-3 text-right text-slate-400">{formatDecimal(c.hours)}</td>
                        <td className="py-2.5 pl-3 text-right text-slate-400">{formatCurrency(revPerHour)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-8">No case revenue data available.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
