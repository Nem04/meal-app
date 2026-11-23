export function mealsForDate(days = [], date) {
  return (days || [])
    .filter((meal) => meal.meal_date === date)
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
}
