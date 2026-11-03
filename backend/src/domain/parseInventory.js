import { canonicalName, normalizeUnit } from './canonical.js';

// 中文量词 → 数值。
const QUANTIFIERS = {
  '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '半': 0.5,
};

// 单位集合（归一化前的原始单位词也在此识别）。
const UNIT_WORDS = [
  '斤', '两', '克', '千克', '公斤', '毫克', '吨',
  '个', '只', '根', '把', '颗', '粒', '片', '朵', '瓣', '枚', '条',
  '瓶', '袋', '盒', '包', '罐', '桶', '箱', '卷',
  '毫升', '升', '勺', '小勺', '大勺', '大匙', '小匙',
];

export function parseInventoryText(text) {
  if (typeof text !== 'string') return { items: [], failed: [] };
  // 分隔：逗号、顿号、分号、换行、中文逗号。
  const chunks = text
    .split(/[,，、;；。.\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const items = [];
  const failed = [];

  for (const chunk of chunks) {
    const parsed = parseOne(chunk);
    if (parsed) items.push(parsed);
    else failed.push(chunk);
  }
  return { items, failed };
}

// 解析单条「名称+数量+单位」。返回 null 表示失败。
export function parseOne(chunk) {
  // 情况1：数字显式出现，如「鸡蛋10个」「芹菜2斤」。
  const numMatch = chunk.match(/^(.*?[^\d.])(\d+(?:\.\d+)?)\s*([^\d]*)$/);
  if (numMatch) {
    const name = numMatch[1].trim();
    const qty = Number(numMatch[2]);
    const unit = normalizeUnit((numMatch[3] || '').trim());
    return { name: canonicalName(name), raw_name: name, quantity: qty, unit };
  }

  // 情况2：中文量词 + 单位，如「酱油一瓶」「盐半勺」。
  const cnMatch = chunk.match(/^(.*?)([一二两三四五六七八九十半])([^\d]*)$/);
  if (cnMatch) {
    const name = cnMatch[1].trim();
    const qty = QUANTIFIERS[cnMatch[2]];
    const unitPart = cnMatch[3].trim();
    // 单位部分需以已知单位词结尾，否则整体视为失败。
    const unit = findEndingUnit(unitPart);
    if (qty !== undefined && unit !== null) {
      return { name: canonicalName(name), raw_name: name, quantity: qty, unit };
    }
  }

  return null;
}

function findEndingUnit(s) {
  if (s === '') return null;
  const cand = UNIT_WORDS.filter((u) => s.endsWith(u));
  if (cand.length === 0) return null;
  cand.sort((a, b) => b.length - a.length);
  return normalizeUnit(cand[0]);
}
