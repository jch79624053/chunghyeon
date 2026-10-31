export const number = value => value === null || value === undefined || value === '' || typeof value === 'boolean' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
export const baseUnit = unit => unit === 'kg' ? 'g' : unit === 'L' ? 'ml' : unit;
export const base = (quantity, unit) => Number(quantity) * (unit === 'kg' || unit === 'L' ? 1000 : 1);
export function priceUnit(material) {
  const price = number(material?.purchase_price), quantity = number(material?.purchase_quantity);
  return price !== null && price >= 0 && quantity > 0 ? price / base(quantity, material.unit) : null;
}
export function safeLink(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
export function costs(materials, recipes, items, secrets, secretItems) {
  const materialCost = (id, amount) => { const unitPrice = priceUnit(materials.find(m => m.id === id)); return unitPrice === null || !(number(amount) > 0) ? null : unitPrice * Number(amount); };
  const secretCost = id => {
    const recipe = secrets.find(s => s.id === id), rows = secretItems.filter(i => i.secret_recipe_id === id);
    if (!(number(recipe?.yield_quantity) > 0) || !rows.length) return null;
    let total = 0;
    for (const row of rows) { const value = materialCost(row.material_id, row.amount); if (value === null) return null; total += value; }
    return total;
  };
  const recipeCost = id => {
    const rows = items.filter(i => i.recipe_id === id); if (!rows.length) return null;
    let total = 0;
    for (const row of rows) {
      let value;
      if (row.material_id != null) value = materialCost(row.material_id, row.amount);
      else { const secret = secrets.find(s => s.id === row.secret_recipe_id), batch = secretCost(row.secret_recipe_id); value = batch !== null && secret && number(row.amount) > 0 ? batch / Number(secret.yield_quantity) * Number(row.amount) : null; }
      if (value === null || !Number.isFinite(value)) return null;
      total += value;
    }
    return total;
  };
  return {materialCost, secretCost, recipeCost};
}
export function analysis(cost, sale, target = 30, fee = 0, other = 0) {
  cost = number(cost); sale = number(sale); target = number(target); fee = number(fee); other = number(other);
  if (cost === null || cost < 0 || !(sale > 0) || !(target > 0 && target <= 100) || !(fee >= 0 && fee < 100) || !(other >= 0)) return null;
  const contribution = sale * (1 - fee / 100) - cost - other;
  return {ratio: cost / sale * 100, materialProfit: sale - cost, contribution, margin: contribution / sale * 100, recommended: Math.ceil((cost / (target / 100)) / 100) * 100, breakEven: Math.ceil(((cost + other) / (1 - fee / 100)) / 100) * 100};
}
export function priceChange(records, materialId) {
  const rows = records.filter(r => r.material_id === materialId && number(r.price) !== null && number(r.price) >= 0 && Number.isFinite(Date.parse(r.recorded_at))).sort((a,b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
  const latest = rows.at(-1), previous = rows.at(-2);
  return {rows, latest, previous, percent: previous && Number(previous.price) > 0 ? (Number(latest.price) - Number(previous.price)) / Number(previous.price) * 100 : null};
}
export function provider(value) {
  try { const host = new URL(safeLink(value)).hostname.toLowerCase();
    if (host === 'coupang.com' || host.endsWith('.coupang.com')) return '쿠팡';
    if (host === 'naver.com' || host.endsWith('.naver.com') || host === 'naver.me') return '네이버';
    if (host === 'gramwon.com' || host.endsWith('.gramwon.com')) return '그램원';
    return '기타';
  } catch { return '링크 없음'; }
}
