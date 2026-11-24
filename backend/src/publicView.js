export function publicMealSummary(meal) {
  if (!meal) return meal;
  return { ...meal, created_by: '' };
}

export function publicLog(log) {
  if (!log) return log;
  const { sentence, ...visible } = log;
  return visible;
}

export function publicPrep(prep) {
  if (!prep) return prep;
  return {
    ...prep,
    dishes: (prep.dishes || []).map((dish) => ({ ...dish, submitter: '' })),
  };
}

export function publicMealDetail(meal) {
  if (!meal) return meal;
  return {
    ...meal,
    created_by: '',
    items: (meal.items || []).map((item) => ({ ...item, submitter: '' })),
    submissions: [],
    prep: publicPrep(meal.prep),
    log: publicLog(meal.log),
  };
}

export function publicInventoryItem(item) {
  const { updated_by, ...visible } = item;
  return visible;
}

export function publicCalendarDay(day) {
  const { sentence, ...visible } = day;
  return { ...visible, photo_count: 0 };
}
