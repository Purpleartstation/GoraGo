import { useState } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis } from 'recharts';
import { BarChart3, PieChart as PieIcon, TrendingUp, Info } from 'lucide-react';

export interface AIChartData {
  title: string;
  subtitle?: string;
  chartType: 'bar' | 'pie' | 'area' | 'comparison';
  dataPoints: Array<{
    name: string;
    value: number;
    secondaryValue?: number;
    color?: string;
    label?: string;
  }>;
  summaryText?: string;
  primaryMetricLabel?: string;
  primaryMetricValue?: string;
}

const DEFAULT_COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#6366F1', '#14B8A6', '#F43F5E'];

export function AIChartCard({ chart }: { chart: AIChartData }) {
  const [viewMode, setViewMode] = useState<'bar' | 'pie' | 'area'>(
    chart.chartType === 'area' ? 'area' : chart.chartType === 'pie' ? 'pie' : 'bar'
  );

  const totalValue = chart.dataPoints.reduce((sum, item) => sum + (item.value || 0), 0);

  const formattedData = chart.dataPoints.map((item, idx) => ({
    ...item,
    color: item.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length]
  }));

  return (
    <div className="mt-2.5 bg-white dark:bg-zinc-900 border border-purple-200 dark:border-purple-900/60 rounded-2xl p-4 space-y-3.5 shadow-sm text-left animate-in fade-in duration-200">
      {/* Chart Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="p-1 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
              <BarChart3 size={14} />
            </span>
            <h5 className="font-black text-xs sm:text-sm text-zinc-900 dark:text-zinc-100">{chart.title}</h5>
          </div>
          {chart.subtitle && (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{chart.subtitle}</p>
          )}
        </div>

        {/* View Toggle */}
        <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-xl border border-zinc-200 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setViewMode('bar')}
            className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'bar'
                ? 'bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-300 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
            title="Bar Chart"
          >
            <BarChart3 size={13} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('pie')}
            className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'pie'
                ? 'bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-300 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
            title="Pie Chart"
          >
            <PieIcon size={13} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('area')}
            className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'area'
                ? 'bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-300 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
            title="Trend Area Chart"
          >
            <TrendingUp size={13} />
          </button>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-48 w-full pt-1">
        <ResponsiveContainer width="100%" height="100%">
          {viewMode === 'pie' ? (
            <PieChart>
              <Tooltip
                formatter={(val: any) => [`₱${Number(val).toLocaleString()}`, 'Amount']}
                contentStyle={{
                  backgroundColor: 'rgba(24, 24, 27, 0.95)',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 'bold'
                }}
              />
              <Pie
                data={formattedData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={36}
                outerRadius={68}
                paddingAngle={3}
              >
                {formattedData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          ) : viewMode === 'area' ? (
            <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="goraChartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#71717a' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₱${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
              <Tooltip
                formatter={(val: any) => [`₱${Number(val).toLocaleString()}`, 'Total']}
                contentStyle={{
                  backgroundColor: 'rgba(24, 24, 27, 0.95)',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 'bold'
                }}
              />
              <Area type="monotone" dataKey="value" stroke="#8B5CF6" strokeWidth={2.5} fillOpacity={1} fill="url(#goraChartGradient)" />
            </AreaChart>
          ) : (
            <BarChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#71717a' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₱${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
              <Tooltip
                formatter={(val: any) => [`₱${Number(val).toLocaleString()}`, 'Amount']}
                contentStyle={{
                  backgroundColor: 'rgba(24, 24, 27, 0.95)',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 'bold'
                }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {formattedData.map((entry, index) => (
                  <Cell key={`bar-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Legend & Breakdown Pills */}
      <div className="grid grid-cols-2 gap-1.5 pt-1">
        {formattedData.slice(0, 6).map((item, idx) => {
          const pct = totalValue > 0 ? Math.round((item.value / totalValue) * 100) : 0;
          return (
            <div key={idx} className="flex items-center justify-between p-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 text-[10px]">
              <div className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="font-bold text-zinc-700 dark:text-zinc-300 truncate">{item.name}</span>
              </div>
              <span className="font-black text-zinc-900 dark:text-zinc-100 shrink-0 tabular-nums">
                ₱{item.value.toLocaleString()} <span className="text-zinc-400 font-normal">({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Summary Insight */}
      {chart.summaryText && (
        <div className="p-2.5 bg-purple-50/80 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/40 rounded-xl flex items-start gap-2 text-[11px] text-purple-900 dark:text-purple-200">
          <Info size={14} className="shrink-0 text-purple-600 mt-0.5" />
          <p className="font-medium leading-relaxed">{chart.summaryText}</p>
        </div>
      )}
    </div>
  );
}
