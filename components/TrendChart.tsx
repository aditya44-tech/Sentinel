import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { weekNum } from '@/lib/weeks';
import { padWeeklyData } from '@/lib/chartHelpers';

interface TrendChartProps {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  title?: string;
  unit?: string;
  lineColor?: string;
  targetThreshold?: number;
  thresholdLabel?: string;
  secondThreshold?: number;
  secondThresholdLabel?: string;
  height?: number;
  yDomain?: [number, number];
  totalWeeks?: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
  unit?: string;
}

const CustomNeoTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label, unit = '' }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border-[3px] border-[#0D0D0D] shadow-[4px_4px_0px_#0D0D0D] p-2.5 text-xs">
        <p className="font-extrabold text-[#0D0D0D] uppercase tracking-wider">{label}</p>
        <p className="font-black text-sm text-[#D62828] mt-0.5">
          {payload[0].value}
          <span className="text-xs text-[#0D0D0D] ml-0.5">{unit}</span>
        </p>
      </div>
    );
  }
  return null;
};

/** Extract numeric part from a week label: "Week 3" -> 3, "Initial" -> 0 */
function weekSortKey(label: string): number {
  return weekNum(label);
}

export const TrendChart: React.FC<TrendChartProps> = ({
  data,
  xKey,
  yKey,
  title,
  unit = '',
  lineColor = '#D62828',
  targetThreshold,
  thresholdLabel,
  secondThreshold,
  secondThresholdLabel,
  height = 240,
  yDomain,
  totalWeeks,
}) => {
  const sortedData = [...data].sort((a, b) => {
    const aLabel = String(a[xKey] ?? '');
    const bLabel = String(b[xKey] ?? '');
    return weekSortKey(aLabel) - weekSortKey(bLabel);
  });

  // Always pad the attendance chart to show all weeks on the X-axis.
  // Weeks with no real data get a null value so the line stops at the last
  // real reading while all week labels remain visible.
  const isWeeklyAttendance = xKey === 'displayWeek' || xKey === 'week';
  const paddedData: Record<string, unknown>[] = React.useMemo(() => {
    if (!isWeeklyAttendance) return sortedData;
    return padWeeklyData(sortedData, xKey, yKey, totalWeeks);
  }, [sortedData, xKey, yKey, isWeeklyAttendance, totalWeeks]);

  const displayData = isWeeklyAttendance ? paddedData : sortedData;

  // A trend needs at least two readings with real values. With one, a line
  // chart draws nothing but a dot — show a level marker and explain why.
  const realPoints = displayData.filter((d) => d[yKey] !== null && !isNaN(Number(d[yKey])));
  const singlePoint = realPoints.length === 1;
  const singleValue = singlePoint ? Number(realPoints[0][yKey]) : NaN;

  const computedDomain: [number, number] = React.useMemo(() => {
    if (yDomain) return yDomain;
    if (realPoints.length === 0) return [0, 100];
    const values = realPoints.map(d => Number(d[yKey])).filter(v => !isNaN(v));
    if (values.length === 0) return [0, 100];
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const pad = Math.max(5, (maxVal - minVal) * 0.15);
    return [Math.max(0, Math.floor(minVal - pad)), Math.min(100, Math.ceil(maxVal + pad))];
  }, [realPoints, yKey, yDomain]);

  if (realPoints.length === 0) {
    return (
      <div className="w-full flex items-center justify-center" style={{ height }}>
        <p className="text-xs text-neutral-400 font-bold uppercase tracking-wider">
          No data uploaded yet
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {title && (
        <div className="flex items-center justify-between mb-3 border-b-2 border-[#0D0D0D] pb-1.5">
          <h4 className="font-black text-sm uppercase tracking-wider text-[#0D0D0D]">{title}</h4>
          {targetThreshold !== undefined && (
            <span className="text-xs font-bold text-neutral-600 bg-neutral-100 px-2 py-0.5 border border-[#0D0D0D]">
              Target: {targetThreshold}{unit}
            </span>
          )}
        </div>
      )}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={displayData} margin={{ top: 10, right: 15, left: -10, bottom: 5 }}>
            <defs>
              <linearGradient id={`areaGrad-${yKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={lineColor} stopOpacity={0.18} />
                <stop offset="95%" stopColor={lineColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#0D0D0D" strokeDasharray="3 3" strokeOpacity={0.2} />
            <XAxis
              dataKey={xKey}
              stroke="#0D0D0D"
              strokeWidth={2}
              tick={{ fill: '#0D0D0D', fontSize: 11, fontWeight: 700 }}
              tickLine={{ stroke: '#0D0D0D', strokeWidth: 2 }}
            />
            <YAxis
              domain={computedDomain}
              stroke="#0D0D0D"
              strokeWidth={2}
              tick={{ fill: '#0D0D0D', fontSize: 11, fontWeight: 700 }}
              tickLine={{ stroke: '#0D0D0D', strokeWidth: 2 }}
            />
            <Tooltip content={<CustomNeoTooltip unit={unit} />} />
            {targetThreshold !== undefined && (
              <ReferenceLine
                y={targetThreshold}
                stroke="#2D9D5F"
                strokeDasharray="4 4"
                strokeWidth={2}
                label={
                  thresholdLabel
                    ? {
                        value: thresholdLabel,
                        fill: '#2D9D5F',
                        fontSize: 10,
                        fontWeight: 'bold',
                        position: 'insideBottomRight',
                      }
                    : undefined
                }
              />
            )}
            {secondThreshold !== undefined && (
              <ReferenceLine
                y={secondThreshold}
                stroke="#D62828"
                strokeDasharray="4 4"
                strokeWidth={2}
                label={
                  secondThresholdLabel
                    ? {
                        value: secondThresholdLabel,
                        fill: '#D62828',
                        fontSize: 10,
                        fontWeight: 'bold',
                        position: 'insideTopRight',
                      }
                    : undefined
                }
              />
            )}
            {!singlePoint && (
              <Area
                type="monotone"
                dataKey={yKey}
                fill={`url(#areaGrad-${yKey})`}
                stroke="none"
                isAnimationActive={true}
              />
            )}
            <Line
              type="linear"
              dataKey={yKey}
              stroke={lineColor}
              strokeWidth={3.5}
              dot={{ r: singlePoint ? 7 : 5, fill: '#FFFFFF', stroke: '#0D0D0D', strokeWidth: 2.5 }}
              activeDot={{ r: 7, fill: lineColor, stroke: '#0D0D0D', strokeWidth: 3 }}
              isAnimationActive={true}
              label={singlePoint ? {
                position: 'top',
                offset: 12,
                fill: lineColor,
                fontSize: 12,
                fontWeight: 'bold',
                formatter: (v: any) => v != null ? `${v}${unit}` : '',
              } : false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {singlePoint && (
        <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
          Only 1 reading so far — the trend line appears once a second one is uploaded.
        </p>
      )}
    </div>
  );
};
