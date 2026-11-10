import { request } from './index.js';

export async function parseIngredientLines(text) {
  const result = await request('/inventory/parse', 'POST', { text });
  const failed = result.failed || [];
  if (failed.length) {
    throw new Error(`这些食材无法识别：${failed.join('、')}`);
  }
  return (result.items || []).map((item) => ({
    raw_name: item.raw_name || item.name,
    quantity: item.quantity,
    unit: item.unit,
  }));
}
