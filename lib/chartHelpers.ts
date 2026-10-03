import { weekNum } from './weeks';

/**
 * Pads weekly data so the X-axis always shows labels from "Week 1" to "Week N",
 * where N = max(4, highest numbered week in the data).
 * Real data points keep their values; missing weeks get `null`.
 */
export function padWeeklyData<T extends Record<string, unknown>>(
  data: T[],
  xKey: string,
  yKey: string,
  totalWeeks?: number,
): Record<string, unknown>[] {
  const sorted = [...data].sort((a, b) => weekNum(String(a[xKey] ?? '')) - weekNum(String(b[xKey] ?? '')));
  const total = totalWeeks ?? 4;
  const labels = Array.from({ length: total }, (_, i) => `Week ${i + 1}`);
  return labels.map(label => {
    const existing = sorted.find(d => String(d[xKey]) === label);
    return existing ?? { [xKey]: label, [yKey]: null };
  });
}
