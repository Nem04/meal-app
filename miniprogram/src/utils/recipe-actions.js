export const RECIPE_CATEGORIES = Object.freeze([
  '荤',
  '素',
  '汤',
  '主食',
  '凉菜',
  '饮品',
  '其他',
]);

const MORE_CATEGORIES = '更多分类';
const MAX_ACTION_SHEET_ITEMS = 6;

function chooseFromActionSheet(itemList) {
  return new Promise((resolve) => {
    uni.showActionSheet({
      itemList,
      success(result) {
        resolve(result.tapIndex);
      },
      fail() {
        resolve(-1);
      },
    });
  });
}

export function pickRecipeCategory() {
  return pickFromPages(RECIPE_CATEGORIES);
}

async function pickFromPages(categories) {
  if (categories.length <= MAX_ACTION_SHEET_ITEMS) {
    const index = await chooseFromActionSheet([...categories]);
    return categories[index] || null;
  }

  const primary = [...categories.slice(0, MAX_ACTION_SHEET_ITEMS - 1), MORE_CATEGORIES];
  const index = await chooseFromActionSheet(primary);
  if (index < 0) return null;
  if (index < primary.length - 1) return primary[index];

  const remaining = categories.slice(MAX_ACTION_SHEET_ITEMS - 1);
  const remainingIndex = await chooseFromActionSheet([...remaining]);
  return remaining[remainingIndex] || null;
}

export function recipeListQuery(category, search) {
  const params = [];
  if (category && category !== '全部') {
    params.push(`category=${encodeURIComponent(category)}`);
  }
  const keyword = String(search || '').trim();
  if (keyword) params.push(`q=${encodeURIComponent(keyword)}`);
  return params.length ? `?${params.join('&')}` : '';
}

export function recipeVersionPayload(specs = [], steps = '') {
  return {
    specs: (specs || []).map((spec) => ({
      raw_name: spec.raw_name || spec.name,
      quantity: spec.quantity,
      unit: spec.unit || '',
    })),
    steps: steps == null ? '' : String(steps),
  };
}
