export const normalizeWeek = (raw: unknown): string => {
  const s = String(raw ?? '').trim();
  const m = s.match(/\d+/);
  return m ? `Week ${parseInt(m[0], 10)}` : s;
};

export const weekNum = (w: string): number => {
  const m = (w || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
};
