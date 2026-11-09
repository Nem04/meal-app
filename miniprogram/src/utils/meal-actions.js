import { request } from './index.js';

export function closeMeal(mealId) {
  return request(`/meals/${mealId}/close`, 'PATCH', {});
}

export function deleteMealItem(mealId, itemId) {
  return request(`/meals/${mealId}/items/${itemId}`, 'DELETE');
}

export function deleteMeal(mealId) {
  return request(`/meals/${mealId}`, 'DELETE');
}

export function getMealDetail(mealId) {
  return request(`/meals/${mealId}`);
}
