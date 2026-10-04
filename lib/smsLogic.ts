export function checkBannedWords(message: string): boolean {
  const bannedWords = ['dropout', 'risk', 'fail', 'punish'];
  const lowerMsg = message.toLowerCase();
  return bannedWords.some((word) => lowerMsg.includes(word));
}

export function isRateLimited(contactLog: any[]): boolean {
  if (!contactLog || contactLog.length === 0) return false;
  const recentSms = contactLog
    .filter((log: any) => log.channel === 'SMS')
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  if (recentSms) {
    const hoursSince = (Date.now() - new Date(recentSms.date).getTime()) / (1000 * 60 * 60);
    if (hoursSince < 24) return true;
  }
  return false;
}

export function isDemoMode(apiKey?: string, deviceId?: string): boolean {
  return !apiKey || !deviceId;
}
