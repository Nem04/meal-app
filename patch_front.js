const fs = require('fs');
const p = 'D:/NemoFile/meal-app/frontend/public/app.js';
let s = fs.readFileSync(p, 'utf8');

const oldBlock = "  const closedHtml = closed.length\n" +
  "    ? closed.slice(0, 8).map((m) => `\n" +
  "      <div class=\"row\"><div class=\"emoji\">🍲</div><div class=\"body\"><div class=\"title\">${esc(m.title)}</div><div class=\"meta\">${esc(m.meal_date)} · ${m.item_count} 道菜</div></div></div>`).join('')\n" +
  "    : `<div class=\"empty\">还没有吃过记录</div>`;";

const newBlock = "  const closedHtml = closed.length\n" +
  "    ? closed.slice(0, 8).map((m) => `\n" +
  "      <div class=\"row\"><div class=\"emoji\">🍲</div><div class=\"body\"><div class=\"title\">${esc(m.title)}</div><div class=\"meta\">${esc(m.meal_date)} · ${m.item_count} 道菜</div></div><button class=\"mini-btn plain\" onclick=\"confirmDeleteMeal('${m.id}','${esc(m.title)}')\">删除</button></div>`).join('')\n" +
  "    : `<div class=\"empty\">还没有吃过记录</div>`;";

if (s.includes(oldBlock)) {
  s = s.replace(oldBlock, newBlock);
  console.log('closed list replaced');
} else {
  console.log('CLOSED BLOCK NOT FOUND');
}

const anchor = "window.doCloseMeal = async function(id) {\n  await api(`/meals/${id}/close`, 'PATCH', {});\n  toast('这顿饭结束了 ✅');\n  closeSheet();\n  render('today');\n};\n";
if (s.includes(anchor) && !s.includes('confirmDeleteMeal')) {
  const funcs = anchor +
    "\n" +
    "window.confirmDeleteMeal = function(id, title) {\n" +
    "  openSheet(`\n" +
    "    <h3>删除这顿饭<button class=\"close-x\" onclick=\"closeSheet()\">×</button></h3>\n" +
    "    <p class=\"muted\">确定删除「" + title + "」吗？</p>\n" +
    "    <p class=\"muted\" style=\"margin-bottom:12px\">删除后，这顿饭、点菜记录、备菜条目和日志会一起删掉，无法恢复。</p>\n" +
    "    <button class=\"primary-btn\" style=\"background:var(--danger)\" onclick=\"doDeleteMeal('" + id + "')\">删除</button>\n" +
    "    <button class=\"secondary-btn\" onclick=\"closeSheet()\">取消</button>\n" +
    "  `);\n" +
    "};\n" +
    "\n" +
    "window.doDeleteMeal = async function(id) {\n" +
    "  await api(`/meals/${id}`, 'DELETE', {});\n" +
    "  toast('已删除这顿饭 🗑');\n" +
    "  closeSheet();\n" +
    "  render('today');\n" +
    "};\n";
  s = s.replace(anchor, funcs);
  console.log('delete functions added');
} else {
  console.log('anchor missing or already added');
}

fs.writeFileSync(p, s, 'utf8');
console.log('done');
