import { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Sparkles,
  Info,
  Layers,
  BarChart3,
  CalendarClock
} from 'lucide-react';
import { generateProphetCashFlowForecast } from '../utils/prophetForecast';
import type { Account, Bill, Debt, Transaction } from '../db';
import HelpTooltip from './HelpTooltip';

interface CashFlowProjectionProps {
  accounts: Account[];
  bills: Bill[];
  debts: Debt[];
  transactions: Transaction[];
}

export default function CashFlowProjection({
  accounts,
  bills,
  debts,
  transactions
}: CashFlowProjectionProps) {
  const [viewMode, setViewMode] = useState<'balance' | 'netflow' | 'decomposition'>('balance');
  const [showConfidence, setShowConfidence] = useState(true);
  const [selectedAnomalyId, setSelectedAnomalyId] = useState<string | null>(null);

  // Generate Prophet forecast
  const forecast = useMemo(() => {
    return generateProphetCashFlowForecast(accounts, bills, debts, transactions, 30);
  }, [accounts, bills, debts, transactions]);

  // Format points for Recharts
  const chartData = useMemo(() => {
    return forecast.points.map(pt => ({
      ...pt,
      // For confidence band in Recharts: lowerBound base + range (upperBound - lowerBound)
      bandBase: pt.lowerBound,
      bandRange: Math.max(0, pt.upperBound - pt.lowerBound),
      inflow: pt.dailyInflow,
      outflow: pt.dailyOutflow
    }));
  }, [forecast.points]);

  const anomalyPoints = useMemo(() => {
    return forecast.points.filter(p => p.isAnomaly || p.isLowBalanceWarning);
  }, [forecast.points]);

  const netPercent = forecast.startingBalance > 0 
    ? ((forecast.netChange / forecast.startingBalance) * 100).toFixed(1)
    : '0';

  return (
    <div className="bg-white/80 dark:bg-zinc-900/40 backdrop-blur-xl rounded-3xl p-5 sm:p-6 border border-zinc-200 dark:border-white/10 shadow-lg relative overflow-hidden space-y-5">
      {/* Decorative gradient orb */}
      <div className="absolute -left-12 -top-12 w-48 h-48 bg-indigo-500/10 dark:bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
              <Sparkles size={11} /> Prophet Time-Series
            </span>
            <HelpTooltip
              title="Prophet Cash Flow Projection"
              text="Forecasts account balance 30 days ahead using Facebook Prophet principles: decomposes baseline trend, weekly day-of-the-week spending patterns, and scheduled bill/loan obligations."
            />
          </div>
          <h2 className="text-lg sm:text-xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center gap-2">
            Cash Flow Projection
            <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500">30-Day Outlook</span>
          </h2>
        </div>

        {/* View Toggle */}
        <div className="flex bg-zinc-100 dark:bg-zinc-800/70 p-1 rounded-2xl border border-zinc-200 dark:border-white/10 shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('balance')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              viewMode === 'balance'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <TrendingUp size={13} /> Balance
          </button>
          <button
            type="button"
            onClick={() => setViewMode('netflow')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              viewMode === 'netflow'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <BarChart3 size={13} /> Daily Net
          </button>
          <button
            type="button"
            onClick={() => setViewMode('decomposition')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              viewMode === 'decomposition'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Layers size={13} /> Model
          </button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 relative z-10">
        <div className="bg-zinc-50/80 dark:bg-zinc-800/40 p-3 rounded-2xl border border-zinc-200/60 dark:border-white/5">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider truncate">Current Balance</p>
          <p className="text-base sm:text-lg font-black text-zinc-900 dark:text-white tabular-nums mt-0.5">
            ₱{forecast.startingBalance.toLocaleString()}
          </p>
        </div>

        <div className="bg-zinc-50/80 dark:bg-zinc-800/40 p-3 rounded-2xl border border-zinc-200/60 dark:border-white/5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider truncate">Day 30 Forecast</p>
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
              forecast.netChange >= 0
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
            }`}>
              {forecast.netChange >= 0 ? `+${netPercent}%` : `${netPercent}%`}
            </span>
          </div>
          <p className="text-base sm:text-lg font-black text-zinc-900 dark:text-white tabular-nums mt-0.5">
            ₱{forecast.endingBalance.toLocaleString()}
          </p>
        </div>

        <div className="bg-zinc-50/80 dark:bg-zinc-800/40 p-3 rounded-2xl border border-zinc-200/60 dark:border-white/5">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider truncate">Lowest Point</p>
          <p className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
            ₱{forecast.minProjectedBalance.amount.toLocaleString()}
          </p>
          <p className="text-[10px] font-semibold text-zinc-400 mt-0.5 truncate">
            {forecast.minProjectedBalance.dateStr}
          </p>
        </div>

        <div className="bg-zinc-50/80 dark:bg-zinc-800/40 p-3 rounded-2xl border border-zinc-200/60 dark:border-white/5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider truncate">Anomalies</p>
            {forecast.anomalies.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </div>
          <p className="text-base sm:text-lg font-black text-zinc-900 dark:text-white mt-0.5 flex items-center gap-1">
            <AlertTriangle size={15} className="text-amber-500" />
            {forecast.anomalies.length} Flagged
          </p>
          <p className="text-[10px] font-semibold text-zinc-400 mt-0.5 truncate">
            Risk & outlier alerts
          </p>
        </div>
      </div>

      {/* Chart Section */}
      {viewMode === 'balance' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 ring-2 ring-purple-500/20" />
                Projected Balance
              </span>
              {showConfidence && (
                <span className="flex items-center gap-1.5 font-bold text-zinc-400">
                  <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400/30 border border-indigo-400/50" />
                  80% Prophet Interval
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowConfidence(prev => !prev)}
              className="text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:underline"
            >
              {showConfidence ? 'Hide Range' : 'Show Range'}
            </button>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 15, right: 10, left: -15, bottom: 5 }}>
                <defs>
                  {/* Confidence Interval Gradient */}
                  <linearGradient id="prophetInterval" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0.05} />
                  </linearGradient>
                  {/* Projected Balance Line Gradient */}
                  <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#9333ea" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#9333ea" stopOpacity={0.0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="dateStr"
                  stroke="#a1a1aa"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  interval={4}
                />
                <YAxis
                  stroke="#a1a1aa"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `₱${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`}
                />

                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const data = payload[0].payload as (typeof chartData)[0];
                    return (
                      <div className="bg-zinc-900/95 backdrop-blur-xl border border-white/10 p-3.5 rounded-2xl shadow-xl text-white text-xs max-w-xs space-y-2">
                        <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                          <span className="font-black text-zinc-300">
                            {data.dayName}, {data.dateStr}
                          </span>
                          <span className="text-[10px] font-bold text-zinc-400">Day {data.dayIndex}</span>
                        </div>

                        <div>
                          <p className="text-[11px] text-zinc-400">Projected Balance</p>
                          <p className="text-base font-black text-purple-400 tabular-nums">
                            ₱{data.projectedBalance.toLocaleString()}
                          </p>
                        </div>

                        {showConfidence && (
                          <div className="text-[11px] text-zinc-400 flex items-center justify-between bg-white/5 px-2 py-1 rounded-lg">
                            <span>80% Interval:</span>
                            <span className="font-bold text-zinc-200">
                              ₱{data.lowerBound.toLocaleString()} – ₱{data.upperBound.toLocaleString()}
                            </span>
                          </div>
                        )}

                        {data.events.length > 0 && (
                          <div className="border-t border-white/10 pt-1.5 space-y-1">
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">
                              Scheduled Events
                            </p>
                            {data.events.map((ev, i) => (
                              <div key={i} className="flex items-center justify-between text-[11px]">
                                <span className="truncate max-w-[140px] text-zinc-300">{ev.name}</span>
                                <span className={`font-black ${ev.type === 'salary' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {ev.type === 'salary' ? '+' : '-'}₱{ev.amount.toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {data.isAnomaly && (
                          <div className="bg-rose-500/20 border border-rose-500/30 p-1.5 rounded-lg flex items-center gap-1.5 text-[10px] font-bold text-rose-300">
                            <AlertTriangle size={12} className="shrink-0 text-rose-400" />
                            <span>{data.anomalyReason || 'Spending anomaly / outflow cluster'}</span>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />

                {/* Starting balance baseline */}
                <ReferenceLine
                  y={forecast.startingBalance}
                  stroke="#a1a1aa"
                  strokeDasharray="4 4"
                  strokeOpacity={0.4}
                />

                {/* Safe buffer warning threshold */}
                <ReferenceLine
                  y={forecast.safeBufferAmount}
                  stroke="#f59e0b"
                  strokeDasharray="2 2"
                  strokeOpacity={0.6}
                  label={{
                    value: 'Safe Buffer',
                    position: 'insideBottomRight',
                    fill: '#f59e0b',
                    fontSize: 9,
                    fontWeight: 'bold'
                  }}
                />

                {/* Confidence Ribbon (Stacking lower bound base + range) */}
                {showConfidence && (
                  <>
                    <Area
                      type="monotone"
                      dataKey="bandBase"
                      stackId="confidence"
                      fill="transparent"
                      stroke="none"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="bandRange"
                      stackId="confidence"
                      fill="url(#prophetInterval)"
                      stroke="none"
                      isAnimationActive={false}
                    />
                  </>
                )}

                {/* Projected Balance Line */}
                <Line
                  type="monotone"
                  dataKey="projectedBalance"
                  stroke="#a855f7"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6, fill: '#a855f7', stroke: '#fff', strokeWidth: 2 }}
                />

                {/* Anomaly / Event dots */}
                {anomalyPoints.map(pt => (
                  <ReferenceDot
                    key={`dot_${pt.dayIndex}`}
                    x={pt.dateStr}
                    y={pt.projectedBalance}
                    r={5}
                    fill={pt.isAnomaly ? '#ef4444' : '#f59e0b'}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Net Daily Flow View */}
      {viewMode === 'netflow' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Inflows (Salary/Income)
              </span>
              <span className="flex items-center gap-1.5 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                Outflows (Bills/Spend)
              </span>
            </div>
            <span className="text-[11px] font-bold text-zinc-400">Daily Delta</span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 15, right: 10, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="dateStr" stroke="#a1a1aa" fontSize={11} tickLine={false} axisLine={false} interval={4} />
                <YAxis stroke="#a1a1aa" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `₱${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const data = payload[0].payload as (typeof chartData)[0];
                    return (
                      <div className="bg-zinc-900/95 backdrop-blur-xl border border-white/10 p-3 rounded-xl shadow-xl text-white text-xs space-y-1.5">
                        <p className="font-black text-zinc-300 border-b border-white/10 pb-1">
                          {data.dayName}, {data.dateStr}
                        </p>
                        <div className="flex justify-between gap-4 text-emerald-400 font-bold">
                          <span>Inflow:</span>
                          <span>+₱{data.inflow.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between gap-4 text-rose-400 font-bold">
                          <span>Outflow:</span>
                          <span>-₱{data.outflow.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between gap-4 text-zinc-200 font-black border-t border-white/10 pt-1">
                          <span>Net:</span>
                          <span className={data.netDaily >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {data.netDaily >= 0 ? '+' : ''}₱{data.netDaily.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="inflow" fill="#10b981" fillOpacity={0.2} stroke="#10b981" strokeWidth={2} />
                <Area type="monotone" dataKey="outflow" fill="#f43f5e" fillOpacity={0.2} stroke="#f43f5e" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Decomposition Principles View */}
      {viewMode === 'decomposition' && (
        <div className="space-y-4 py-1">
          <div className="bg-zinc-100/80 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-200 dark:border-white/5 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-md">
                y(t) = g(t) + s(t) + h(t) + ε_t
              </span>
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Prophet Additive Architecture</span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              This cash flow model adapts Facebook Prophet&apos;s modular formulation to household finances:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <div className="bg-white/60 dark:bg-zinc-900/60 p-3 rounded-xl border border-black/5 dark:border-white/5">
                <p className="text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                  g(t) Trend & Drift
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                  Baseline daily discretionary expenditure (₱{forecast.dailyBurnRate.toLocaleString()}/day) minus steady income drift.
                </p>
              </div>

              <div className="bg-white/60 dark:bg-zinc-900/60 p-3 rounded-xl border border-black/5 dark:border-white/5">
                <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  s(t) Day-of-Week Seasonality
                </p>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {forecast.weeklySeasonality.map(ws => (
                    <span
                      key={ws.day}
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        ws.factor > 0.1
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : ws.factor < -0.1
                          ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                          : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500'
                      }`}
                    >
                      {ws.day} {ws.factor > 0 ? `+${Math.round(ws.factor * 100)}%` : `${Math.round(ws.factor * 100)}%`}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-white/60 dark:bg-zinc-900/60 p-3 rounded-xl border border-black/5 dark:border-white/5">
                <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  h(t) Calendar Events
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                  Deterministic bill due days, active loan installments, and semi-monthly payday anchors.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Spending Anomalies & Risk Section */}
      <div className="border-t border-zinc-200 dark:border-white/10 pt-4 space-y-3 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertTriangle size={13} />
            </div>
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Spending Anomalies & Key Events ({forecast.anomalies.length})
            </h3>
          </div>
          <span className="text-[10px] font-bold text-zinc-400">Time-series variance detector</span>
        </div>

        {forecast.anomalies.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {forecast.anomalies.map((anomaly) => {
              const isSelected = selectedAnomalyId === anomaly.id;
              return (
                <div
                  key={anomaly.id}
                  onClick={() => setSelectedAnomalyId(isSelected ? null : anomaly.id)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                    anomaly.severity === 'high'
                      ? 'bg-rose-500/10 border-rose-500/30 hover:bg-rose-500/15'
                      : 'bg-amber-500/10 border-amber-500/25 hover:bg-amber-500/15'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {anomaly.type === 'projected_cluster' ? (
                        <CalendarClock size={14} className="text-rose-500 shrink-0" />
                      ) : anomaly.type === 'balance_dip' ? (
                        <TrendingDown size={14} className="text-amber-500 shrink-0" />
                      ) : (
                        <AlertTriangle size={14} className="text-purple-500 shrink-0" />
                      )}
                      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                        {anomaly.title}
                      </p>
                    </div>
                    <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-zinc-700 dark:text-zinc-300 shrink-0">
                      {anomaly.dateStr}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-1 leading-relaxed">
                    {anomaly.description}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-emerald-500/10 border border-emerald-500/20 p-3.5 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-700 dark:text-emerald-300">
            <Info size={16} className="shrink-0" />
            <p className="font-semibold">
              No critical spending anomalies or severe liquidity dip risks detected in the next 30 days!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
