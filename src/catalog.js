// Demo catalog for "Marwar Crafts", a small handicrafts & textiles shop in Jodhpur.
// Prices are in USD because most buyers are tourists / diaspora paying via PayPal.
export const CATALOG = [
  { id: 'bs-dabu', name: 'Dabu hand-block print double bedsheet', category: 'bedsheets', price: 34, emoji: '🛏️', stock: 12, tags: ['bedsheet', 'cotton', 'block print', 'indigo', 'dabu'], description: 'Mud-resist indigo block print, 100% cotton, 2 pillow covers.' },
  { id: 'bs-sanganeri', name: 'Sanganeri floral cotton bedsheet', category: 'bedsheets', price: 29, emoji: '🌸', stock: 20, tags: ['bedsheet', 'cotton', 'floral', 'sanganeri'], description: 'Classic Sanganeri floral print, queen size, soft 180TC cotton.' },
  { id: 'qt-razai', name: 'Jaipuri cotton razai quilt', category: 'bedsheets', price: 48, emoji: '🧺', stock: 6, tags: ['quilt', 'razai', 'blanket', 'bedding'], description: 'Featherlight hand-filled cotton quilt, reversible print.' },
  { id: 'rg-salawas', name: 'Salawas hand-woven dhurrie rug', category: 'home decor', price: 65, emoji: '🧶', stock: 4, tags: ['rug', 'dhurrie', 'carpet', 'salawas', 'handwoven'], description: '4x6 ft flat-weave rug from Salawas village, near Jodhpur.' },
  { id: 'cc-mirror', name: 'Mirror-work cushion cover', category: 'home decor', price: 12, emoji: '🪡', stock: 50, tags: ['cushion', 'pillow', 'mirror', 'embroidery'], description: '16x16 in, hand-embroidered with tiny mirrors.' },
  { id: 'lp-camel', name: 'Painted camel-leather lamp', category: 'home decor', price: 40, emoji: '🪔', stock: 8, tags: ['lamp', 'light', 'leather', 'camel'], description: 'Hand-painted translucent leather shade, warm glow.' },
  { id: 'pp-kathputli', name: 'Kathputli puppet pair', category: 'gifts', price: 18, emoji: '🎎', stock: 25, tags: ['puppet', 'kathputli', 'gift', 'toy'], description: 'Traditional Rajasthani string puppets, king & queen.' },
  { id: 'dp-bandhej', name: 'Bandhej silk dupatta', category: 'textiles', price: 26, emoji: '🧣', stock: 15, tags: ['dupatta', 'scarf', 'stole', 'bandhej', 'tie-dye', 'silk'], description: 'Tie-dye art silk dupatta in Marwari colours.' },
  { id: 'sf-jodhpuri', name: 'Jodhpuri safa (turban)', category: 'textiles', price: 15, emoji: '👳', stock: 30, tags: ['safa', 'turban', 'pagri', 'wedding'], description: 'Leheriya cotton safa, 9 m, ideal for weddings.' },
  { id: 'fw-mojari', name: 'Leather Jodhpuri mojari', category: 'footwear', price: 22, emoji: '👞', stock: 18, tags: ['mojari', 'jutti', 'shoes', 'footwear', 'leather'], description: 'Hand-stitched leather mojari, sizes 6-11.' },
];

export function getProduct(id) {
  return CATALOG.find((p) => p.id === id) || null;
}

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'send', 'please', 'order', 'orders', 'bulk', 'you', 'have', 'want', 'need', 'some', 'any', 'this', 'that', 'can', 'get', 'show', 'invoice', 'custom', 'to', 'me', 'all', 'items', 'item', 'product', 'products']);

/** Simple keyword search over name, category and tags. Empty query returns everything. */
export function searchCatalog(query = '', { maxPrice } = {}) {
  const words = String(query).toLowerCase().split(/[^a-z0-9-]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map((w) => w.replace(/(es|s)$/, ''));
  let results = CATALOG.filter((p) => {
    if (!words.length) return true;
    const hay = `${p.id} ${p.name} ${p.category} ${p.tags.join(' ')}`.toLowerCase();
    // match at the start of a word, so "the" doesn't hit "leather"
    return words.some((w) => new RegExp(`(^|[^a-z])${w.replace(/[^a-z0-9-]/g, '')}`).test(hay));
  });
  if (maxPrice) results = results.filter((p) => p.price <= maxPrice);
  return results;
}

/** Resolve a product from an id or loose name ("bedsheet", "dabu", "puppets"). */
export function resolveProduct(ref) {
  if (!ref) return null;
  const r = String(ref).toLowerCase().trim();
  const exact = CATALOG.find((p) => p.id === r);
  if (exact) return exact;
  if (!r.split(/[^a-z0-9-]+/).some((w) => w.length > 2 && !STOPWORDS.has(w))) return null; // nothing to match on
  const hits = searchCatalog(r);
  return hits.length ? hits[0] : null;
}
