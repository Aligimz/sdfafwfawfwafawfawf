// تحويل صفوف المنتجات لشكل جاهز للواجهة
const { db } = require('./db');

const imgStmt = () => db.prepare('SELECT id, path FROM product_images WHERE product_id=? ORDER BY sort, id');

function parseJSON(s, fallback) {
  try { const v = JSON.parse(s); return v ?? fallback; } catch { return fallback; }
}

function serialize(p, withImages = true) {
  if (!p) return null;
  const out = {
    ...p,
    specs: parseJSON(p.specs, []),
    options: parseJSON(p.options, []),
    featured: !!p.featured,
    active: !!p.active,
  };
  if (withImages) out.images = imgStmt().all(p.id).map((i) => ({ id: i.id, url: '/uploads/' + i.path }));
  return out;
}

function serializeMany(rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const imgs = db.prepare(`SELECT id, product_id, path FROM product_images WHERE product_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort, id`).all(...ids);
  const by = {};
  for (const i of imgs) (by[i.product_id] ||= []).push({ id: i.id, url: '/uploads/' + i.path });
  return rows.map((r) => ({ ...serialize(r, false), images: by[r.id] || [] }));
}

// يحسب سعر المنتج مع الخيارات المختارة، ويتأكد إن الخيارات صحيحة
function priceWithOptions(product, chosen) {
  const opts = parseJSON(product.options, []);
  let price = product.price;
  const labels = [];
  for (const o of opts) {
    const pick = chosen && chosen[o.name];
    const v = o.values.find((x) => x.label === pick) || o.values[0];
    if (!v) continue;
    price += Number(v.delta) || 0;
    labels.push(`${o.name}: ${v.label}`);
  }
  return { price, optionsText: labels.join('، ') };
}

module.exports = { serialize, serializeMany, priceWithOptions, parseJSON };
