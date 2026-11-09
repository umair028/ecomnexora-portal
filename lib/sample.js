// Fills in demo numbers and chart data for the sample clients so every profile looks complete.
// Only empty fields are filled — anything already entered is left alone.
const crypto = require('crypto');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Per-client demo profile. `daily` = typical daily sales in USD.
const PROFILES = {
  'Client 1': { daily: 3900, growth: 0.8, store: 'Sample Store' },
  'Client 2': { daily: 380, growth: 0.6, store: 'Northwind Goods', link: 'https://example.com/northwind-goods', phone: '+1 (604) 555-0121',
    salesToday: 412, unitsToday: 18, orders: 64, returns: 2, change: { week: 5, month: 12, year: 31 } },
  'Client 3': { daily: 1700, growth: 0.7, store: 'Lumen Home Co.', link: 'https://example.com/lumen-home', salesToday: 1935, unitsToday: 52,
    change: { week: 9, month: 18 } },
  'Client 4': { daily: 950, growth: 0.5, store: 'Outback Supply', link: 'https://example.com/outback-supply', phone: '+61 2 5550 1234',
    salesToday: 1048, unitsToday: 37, change: { week: -4, month: 7 } },
  'Client 5': { daily: 520, growth: 0.9, store: 'Trendy Finds', link: 'https://example.com/trendy-finds', change: { week: 14, month: 22, year: 48 } },
  'Client 6': { daily: 140, growth: 1, store: 'Client 6 Channel', link: 'https://youtube.com/@client6', phone: '+1 (555) 010-0166',
    unitsToday: 2, orders: 9, returns: 0, change: { week: 6, month: 15 } },
};

function makeRandom(seedText) {
  let s = parseInt(crypto.createHash('md5').update(seedText).digest('hex').slice(0, 8), 16) % 2147483646 + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const shortDate = d => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
const sum = arr => arr.reduce((a, p) => a + (Number(p.amount) || 0), 0);
const empty = v => v === null || v === undefined || v === '';

function weekSeries(daily, rnd) {
  return DAYS.map((label, i) => ({ label, amount: Math.round(daily * (i >= 5 ? 1.15 : 1) * (0.75 + rnd() * 0.5)) }));
}
function monthSeries(daily, rnd) {
  const today = new Date();
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - 29 + i);
    const wave = 1 + 0.18 * Math.sin(i / 3.2);
    return { label: shortDate(d), amount: Math.round(daily * wave * (0.72 + rnd() * 0.56)) };
  });
}
function yearSeries(daily, growth, rnd) {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const ramp = 1 - growth * (11 - i) / 14; // earlier months lower for growing stores
    return { label: MONTHS[d.getMonth()], amount: Math.round(daily * 30 * Math.max(0.12, ramp) * (0.85 + rnd() * 0.3)) };
  });
}
// Extend a month-label series to the full last 12 months (missing months count as 0).
function padYear(series) {
  if (!series.length || series.length >= 12 || !series.every(p => MONTHS.includes(p.label))) return series;
  const now = new Date();
  const labels = Array.from({ length: 12 }, (_, i) => MONTHS[new Date(now.getFullYear(), now.getMonth() - 11 + i, 1).getMonth()]);
  return labels.map(label => series.find(p => p.label === label) || { label, amount: 0 });
}

function fillUser(u) {
  const p = PROFILES[u.name];
  const daily = p?.daily || Math.max(100, Math.round((Number(u.balance) || 3000) / 25));
  const rnd = makeRandom(u.name + (u.email || ''));
  u.sales = u.sales || {};
  u.totals = u.totals || {};
  u.change = u.change || {};
  if (!u.sales.week?.length) u.sales.week = weekSeries(daily, rnd);
  if (!u.sales.month?.length) u.sales.month = monthSeries(daily, rnd);
  u.sales.year = u.sales.year?.length ? padYear(u.sales.year) : yearSeries(daily, p?.growth ?? 0.6, rnd);
  // demo year that's smaller than 2x its own last 30 days doesn't add up — regenerate it
  if (p && sum(u.sales.year) < sum(u.sales.month) * 2) {
    u.sales.year = yearSeries(daily, p.growth, rnd);
    u.totals.year = null;
  }
  for (const r of ['week', 'month', 'year']) {
    if (empty(u.totals[r])) u.totals[r] = sum(u.sales[r]);
    if (empty(u.change[r])) u.change[r] = p?.change?.[r] ?? Math.round(4 + rnd() * 24);
  }
  if (p) {
    if (!u.storeName) u.storeName = p.store;
    if (!u.storeLink && p.link) u.storeLink = p.link;
    if (!u.phone && p.phone) u.phone = p.phone;
  }
  if (empty(u.salesToday)) u.salesToday = p?.salesToday ?? Math.round(daily * (0.8 + rnd() * 0.4));
  if (empty(u.unitsToday)) u.unitsToday = p?.unitsToday ?? Math.max(1, Math.round(u.salesToday / 28));
  if (empty(u.orders)) u.orders = p?.orders ?? Math.round(daily / 25 * 30);
  if (empty(u.returns)) u.returns = p?.returns ?? Math.round((u.orders || 0) * 0.02);
  if (empty(u.communications)) u.communications = 1;
}

const PRODUCTS = {
  'Client 2': [['Ceramic Pour-Over Coffee Set', 34], ['Bamboo Cutting Board Set', 29.99], ['Linen Kitchen Towels (4-pack)', 18.5], ['Glass Storage Jars', 24.99]],
  // a YouTube channel's "orders" are brand deals and memberships
  'Client 6': [['Brand sponsorship – 60s integration', 450], ['Channel membership (annual)', 59.99], ['Affiliate sale – camera kit', 38], ['Brand sponsorship – dedicated video', 900]],
};

// Adds a few orders for sample clients that have none, so their profile isn't empty.
function fillOrders(state, newId) {
  const today = new Date();
  for (const [name, products] of Object.entries(PRODUCTS)) {
    const u = state.users.find(x => x.name === name);
    if (!u || state.orders.some(o => o.userId === u.id)) continue;
    const rnd = makeRandom('orders' + name);
    let max = state.orders.reduce((m, o) => Math.max(m, parseInt(String(o.number).replace(/\D/g, ''), 10) || 0), 10000);
    // oldest first, so newer orders get higher numbers
    for (let i = 7; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i * 3);
      const [product, price] = products[i % products.length];
      const units = price >= 300 ? 1 : 1 + Math.floor(rnd() * 3);
      state.orders.push({
        id: newId(), number: `NX-${++max}`, userId: u.id, product, units, amount: +(price * units).toFixed(2),
        status: i === 0 ? 'Pending' : i < 3 ? 'In transit' : i === 5 ? 'Returned' : 'Delivered',
        date: d.toISOString().slice(0, 10), createdAt: d.toISOString(),
      });
    }
  }
}

function fillSamples(state, newId) {
  for (const u of state.users) if (PROFILES[u.name]) fillUser(u);
  fillOrders(state, newId);
  // a channel with 6 months of revenue can't have joined today
  const c6 = state.users.find(u => u.name === 'Client 6');
  if (c6 && c6.joinDate === new Date().toISOString().slice(0, 10)) {
    const d = new Date(); d.setMonth(d.getMonth() - 5, 3);
    c6.joinDate = d.toISOString().slice(0, 10);
  }
}

module.exports = { fillSamples };
