// Shopify Admin REST API (store's Admin API access token): orders → sales charts and order numbers.
// Docs: https://shopify.dev/docs/api/admin-rest/latest/resources/order
const VERSION = '2024-10';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function shopDomain(url) {
  try { const h = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url).hostname.toLowerCase(); return /\.myshopify\.com$/.test(h) ? h : ''; } catch { return ''; }
}

async function call(base, token, path) {
  // next-page links from Shopify are absolute; only follow them on the store's own origin (keeps the token safe)
  const url = /^https?:\/\//i.test(path) ? path : base + path;
  if (new URL(url).origin !== new URL(base).origin) throw new Error('Shopify returned a link to another site — sync stopped.');
  const r = await fetch(url, { headers: { 'X-Shopify-Access-Token': token, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (r.status === 401 || r.status === 403) throw new Error('Shopify rejected the access token (check it has read_orders access).');
  if (!r.ok) throw new Error(`Shopify API: ${r.status}`);
  return { body: await r.json(), link: r.headers.get('link') || '' };
}

async function sync(account) {
  const shop = shopDomain(account.url);
  if (!shop) return { status: 'error', message: 'Use the store\'s .myshopify.com address (e.g. yourstore.myshopify.com).' };
  if (!account.token) return { status: 'needs_setup', message: 'Paste the store\'s Admin API access token to fetch orders automatically.' };
  const base = process.env.SHOPIFY_API_BASE || `https://${shop}`;

  const { body: shopBody } = await call(base, account.token, `/admin/api/${VERSION}/shop.json`);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const since = new Date(today.getFullYear(), today.getMonth() - 11, 1);

  // all orders since the start of the 12-month window (cursor pagination, capped at 20 pages)
  let path = `/admin/api/${VERSION}/orders.json?status=any&limit=250&created_at_min=${since.toISOString()}&fields=id,created_at,cancelled_at,total_price,line_items,refunds`;
  const orders = [];
  for (let page = 0; path && page < 20; page++) {
    const { body, link } = await call(base, account.token, path);
    orders.push(...(body.orders || []));
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    path = next ? next[1] : null;
  }
  const live = orders.filter(o => !o.cancelled_at);
  const dayKey = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; // local calendar day
  const byDay = new Map();
  for (const o of live) { const k = dayKey(new Date(o.created_at)); byDay.set(k, (byDay.get(k) || 0) + Number(o.total_price || 0)); }

  const month = [], week = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const amount = Math.round(byDay.get(dayKey(d)) || 0);
    month.push({ label: `${MONTHS[d.getMonth()]} ${d.getDate()}`, amount });
    if (i < 7) week.push({ label: DAYS[(d.getDay() + 6) % 7], amount });
  }
  const year = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const amount = live.filter(o => { const c = new Date(o.created_at); return c.getFullYear() === m.getFullYear() && c.getMonth() === m.getMonth(); })
      .reduce((s, o) => s + Number(o.total_price || 0), 0);
    year.push({ label: MONTHS[m.getMonth()], amount: Math.round(amount) });
  }
  // trim leading empty months (store not trading yet)
  while (year.length > 1 && year[0].amount === 0) year.shift();

  const sum = a => a.reduce((s, p) => s + p.amount, 0);
  const start30 = new Date(today); start30.setDate(start30.getDate() - 29);
  const start60 = new Date(today); start60.setDate(start60.getDate() - 59);
  const last30 = live.filter(o => new Date(o.created_at) >= start30);
  const prev30 = live.filter(o => { const c = new Date(o.created_at); return c >= start60 && c < start30; });
  const prevTotal = prev30.reduce((s, o) => s + Number(o.total_price || 0), 0);
  const todays = live.filter(o => new Date(o.created_at) >= today);
  const units = list => list.reduce((s, o) => s + (o.line_items || []).reduce((t, li) => t + Number(li.quantity || 0), 0), 0);

  return {
    status: 'synced',
    message: `${last30.length.toLocaleString('en-US')} orders in the last 30 days` + (shopBody.shop?.currency && shopBody.shop.currency !== 'USD' ? ` · amounts are in ${shopBody.shop.currency}` : ''),
    meta: { title: shopBody.shop?.name || '', currency: shopBody.shop?.currency || '' },
    patch: {
      salesToday: Math.round(todays.reduce((s, o) => s + Number(o.total_price || 0), 0) * 100) / 100,
      unitsToday: units(todays),
      orders: last30.length,
      returns: last30.filter(o => (o.refunds || []).length).length,
      sales: { week, month, year },
      totals: { week: sum(week), month: sum(month), year: sum(year) },
      change: { week: null, month: prevTotal ? Math.round(((sum(month) - prevTotal) / prevTotal) * 100) : null, year: null },
    },
    preview: { title: shopBody.shop?.name, currency: shopBody.shop?.currency, orders30: last30.length, sales30: sum(month) },
  };
}

module.exports = { sync, shopDomain };
