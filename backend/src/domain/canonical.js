// 食材名称与单位规范化：收敛别名，不跨体系换算。
const NAME_ALIASES = new Map([
  ['小葱', '葱'], ['香葱', '葱'], ['青葱', '葱'], ['大葱', '葱'],
  ['土鸡蛋', '鸡蛋'], ['鸡子', '鸡蛋'],
  ['生抽酱油', '生抽'], ['老抽酱油', '老抽'],
  ['盐焗用海盐', '盐'], ['食盐', '盐'], ['细盐', '盐'],
  ['白糖', '糖'], ['白砂糖', '糖'], ['绵白糖', '糖'],
]);

const UNIT_ALIASES = new Map([
  ['只', '个'], ['顆', '个'], ['粒', '个'],
  ['市斤', '斤'], ['kg', '千克'], ['KG', '千克'], ['公斤', '千克'],
  ['ml', '毫升'], ['ML', '毫升'], ['cc', '毫升'],
  ['小匙', '小勺'], ['茶匙', '小勺'], ['大匙', '大勺'], ['汤匙', '大勺'],
]);

export function canonicalName(raw) {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  return NAME_ALIASES.get(s) || NAME_ALIASES.get(s.replace(/\s+/g, '')) || s;
}

export function normalizeUnit(raw) {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  if (s === '') return '';
  return UNIT_ALIASES.get(s) || s;
}

// 返回合并唯一键的前半部分，便于同键 GROUP。
export function mergeKey(name, unit) {
  return `${canonicalName(name)}|${normalizeUnit(unit)}`;
}
