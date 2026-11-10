const BUCKETS = [
  { endHour: 5, text: '夜深了，早点休息～' },
  { endHour: 11, text: '早上好' },
  { endHour: 14, text: '中午好' },
  { endHour: 18, text: '下午好' },
  { endHour: 24, text: '傍晚好' },
];

export function getGreeting(date = new Date()) {
  const hour = date.getHours();
  return BUCKETS.find(({ endHour }) => hour < endHour).text;
}
