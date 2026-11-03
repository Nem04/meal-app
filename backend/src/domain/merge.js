import { canonicalName, normalizeUnit } from './canonical.js';

// 输入：食材规格数组，每项 { raw_name, canonical_name, quantity, unit }。
// 输出：同 (canonical_name, unit) 聚合后的数组，含跨单位提示。
export function mergeIngredients(items) {
  const groups = new Map();
  for (const item of items || []) {
    const cname = canonicalName(item.canonical_name || item.raw_name || '');
    const unit = normalizeUnit(item.unit || '');
    const qty = Number(item.quantity) || 0;
    const key = `${cname}|${unit}`;
    if (!groups.has(key)) {
      groups.set(key, { canonical_name: cname, unit, total_quantity: 0, raw_names: new Set() });
    }
    const g = groups.get(key);
    g.total_quantity += qty;
    g.raw_names.add(item.raw_name || cname);
  }

  const merged = [...groups.values()].map((g) => ({
    canonical_name: g.canonical_name,
    unit: g.unit,
    total_quantity: roundQty(g.total_quantity),
    raw_names: [...g.raw_names],
  }));

  // 跨单位提示：同一 canonical 出现多个 unit 时打标。
  const byName = new Map();
  for (const m of merged) {
    const key = m.canonical_name;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(m);
  }
  for (const [, arr] of byName) {
    if (arr.length > 1) {
      const mn = arr.map((x) => `${x.total_quantity}${x.unit}`).join(' + ');
      for (const m of arr) {
        m.cross_unit_note = `同名不同单位：${mn}（V1不自动换算，请手动确认）`;
      }
    }
  }
  return merged;
}

function roundQty(n) {
  return Math.round(n * 100) / 100;
}
