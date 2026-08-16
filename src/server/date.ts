export function getISTParts(date: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
  
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0;

  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hour,
    minute: parseInt(get('minute'), 10),
    second: parseInt(get('second'), 10)
  };
}

export function getDailyQueueKey(subreddit: string, date: Date = new Date()): string {
  const safeSub = (subreddit || 'unknown').toLowerCase();
  return `subreddit:${safeSub}:queue:deals:${getDateString(date)}`;
}

export function getDateString(date: Date = new Date()): string {
  const p = getISTParts(date);
  const mm = String(p.month).padStart(2, '0');
  const dd = String(p.day).padStart(2, '0');
  return `${p.year}-${mm}-${dd}`;
}

export function getTodayBounds(): { start: Date, end: Date } {
  const now = new Date();
  const p = getISTParts(now);
  const start = new Date(Date.UTC(p.year, p.month - 1, p.day, -5, -30, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function formatFriendlyDate(date: Date = new Date()): string {
  const p = getISTParts(date);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const month = months[p.month - 1];
  return `${month} ${p.day}, ${p.year}`;
}

export function formatFriendlyTime(date: Date = new Date()): string {
  const p = getISTParts(date);
  let hours = p.hour;
  const minutes = String(p.minute).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${ampm} IST`;
}
