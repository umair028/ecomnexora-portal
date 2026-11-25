// Demo mode (DEMO_DATA=true): moves SAMPLE clients forward one day at a time so dates never go stale.
// Only clients that existed when demo mode was first switched on are marked `demo`; clients added later,
// and clients with a connected business account, are never touched. Every page is labelled "Sample data".
// Nothing runs on a timer: the first page view of a day catches up on the days since the last one.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const { MONTHS } = require('./helpers');

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_CATCH_UP = 62; // days
const KEEP_DAYS = 180;   // generated orders and paid payouts older than this are dropped
const on = () => process.env.DEMO_DATA === 'true';

const iso = d => d.toISOString().slice(0, 10);
const noon = s => new Date(s + 'T12:00:00Z');
const plus = (s, n) => { const d = noon(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const age = (from, to) => Math.round((noon(to) - noon(from)) / 86400000);
const hash = text => crypto.createHash('md5').update(text).digest('hex');
// the same day always produces the same rows
function random(text) {
  let s = parseInt(hash(text).slice(0, 8), 16) % 2147483646 + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];
const mean = list => (list.length ? list.reduce((t, p) => t + (Number(p.amount) || 0), 0) / list.length : 0);
const sum = list => list.reduce((t, p) => t + (Number(p.amount) || 0), 0);
const dayLabel = day => `${MONTHS[noon(day).getUTCMonth()]} ${noon(day).getUTCDate()}`;
const monthLabel = day => MONTHS[noon(day).getUTCMonth()];
// a moment during `day`, never later than now
function moment(day, rnd) {
  const start = Date.parse(day + 'T00:00:00Z');
  return new Date(start + rnd() * Math.max(0, Math.min(86399000, Date.now() - start))).toISOString();
}

// "Oct 10" → the latest such date that is not after `day`
function labelDate(label, day) {
  const m = /^([A-Z][a-z]{2}) (\d{1,2})$/.exec(label || '');
  if (!m || !MONTHS.includes(m[1])) return null;
  const at = y => `${y}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const y = noon(day).getUTCFullYear();
  return at(y) <= day ? at(y) : at(y - 1);
}

function moveCharts(u, day, rnd, given) {
  const s = u.sales || {};
  const last = s.month?.length && labelDate(s.month.at(-1).label, day);
  if (!last || last >= day) return;
  const avg = mean(s.month);
  const amount = given ? Math.round(given.amount) : Math.round(avg * (0.8 + rnd() * 0.42));
  s.month = [...s.month, { label: dayLabel(day), amount }].slice(-30);
  const wd = WEEKDAYS[noon(day).getUTCDay()];
  s.week = (s.week || []).map(p => (p.label === wd ? { ...p, amount } : p));
  if (s.year?.length && s.year.every(p => MONTHS.includes(p.label))) {
    if (s.year.at(-1).label !== monthLabel(day)) s.year = [...s.year, { label: monthLabel(day), amount: 0 }].slice(-12);
    const end = s.year.at(-1);
    // the saved month may already be a full estimate, so never add days on top of it
    const soFar = sum(s.month.filter(p => p.label.startsWith(end.label + ' ')));
    s.year = [...s.year.slice(0, -1), { ...end, amount: Math.max(end.amount, soFar) }];
  }
  u.sales = s;
  u.totals = { ...(u.totals || {}), ...Object.fromEntries(['week', 'month', 'year'].filter(r => s[r]?.length).map(r => [r, sum(s[r])])) };
  const perUnit = u.unitsToday > 0 && u.salesToday > 0 ? u.salesToday / u.unitsToday : 28;
  if (u.salesToday !== null && u.salesToday !== undefined) u.salesToday = amount;
  if (u.unitsToday !== null && u.unitsToday !== undefined) u.unitsToday = given ? given.units : Math.round(amount / perUnit);
}

function moveChannel(u, day, rnd) {
  const c = u.channel;
  const last = c?.daily?.length && labelDate(c.daily.at(-1).label, day);
  if (!last || last >= day) return;
  const before = sum(c.daily);
  const daily = [...c.daily, { label: dayLabel(day), amount: Math.round(mean(c.daily) * (0.82 + rnd() * 0.4)) }].slice(-28);
  const ratio = before ? sum(daily) / before : 1;
  const scale = k => (Number.isFinite(c[k]) ? { [k]: Math.round(c[k] * ratio) } : {});
  u.channel = {
    ...c, daily, ...scale('views'), ...scale('watchHours'),
    ...(Number.isFinite(c.totalSubscribers) ? { totalSubscribers: c.totalSubscribers + Math.round((c.subscribers || 0) / 28) } : {}),
    uploads: (c.uploads || []).map(v => (/^\d{4}-\d{2}-\d{2}$/.test(v.date || '') ? { ...v, date: plus(v.date, 1) } : v)),
  };
}

// A demo store with its own product list: its charts are exactly the sum of its orders.
const price = p => Number(p.price) || 0;
function pickProduct(list, rnd) { // cheaper products sell more often
  const weights = list.map(p => 1 / Math.sqrt(Math.max(1, price(p))));
  let r = rnd() * weights.reduce((a, b) => a + b, 0);
  return list.find((p, i) => (r -= weights[i]) <= 0) || list[0];
}
function storeOrders(u, day, rnd) {
  const list = (u.products || []).filter(p => price(p) > 0);
  const n = Math.max(1, (u.dailyOrders || 3) - 1 + Math.floor(rnd() * 3));
  return Array.from({ length: list.length ? n : 0 }, () => {
    const p = pickProduct(list, rnd);
    const units = price(p) < 20 && rnd() < 0.2 ? 2 : 1;
    return { product: p.title, units, amount: +(price(p) * units).toFixed(2) };
  });
}

function moveDay(day, ctx) {
  const rnd = random('demo ' + day);
  const { users, byId, products } = ctx;
  let number = Math.max(10000, ...db.all('orders').map(o => parseInt(String(o.number).replace(/\D/g, ''), 10) || 0));
  for (const u of users) {
    if (u.products?.length) {
      const last = u.sales?.month?.length && labelDate(u.sales.month.at(-1).label, day);
      if (u.status !== 'Active' || !last || last >= day) continue;
      const own = random(`store ${u.id} ${day}`);
      const made = storeOrders(u, day, own);
      made.forEach((o, i) => db.all('orders').push({ id: hash(`store ${u.id} ${day} ${i}`).slice(0, 12), number: `NX-${++number}`, userId: u.id, ...o, status: 'Pending', date: day, createdAt: moment(day, own), demo: true }));
      moveCharts(u, day, own, { amount: sum(made), units: made.reduce((t, o) => t + o.units, 0) });
      const recent = db.all('orders').filter(o => o.userId === u.id && age(o.date, day) < 30);
      Object.assign(u, { orders: recent.length, returns: recent.filter(o => o.status === 'Returned').length });
      continue;
    }
    moveCharts(u, day, rnd);
    moveChannel(u, day, rnd);
  }

  for (const o of db.all('orders')) {
    if (!byId.has(o.userId)) continue;
    const days = age(o.date, day);
    let status = o.status;
    if (status === 'Pending' && days >= 2) status = 'In transit';
    else if (status === 'In transit' && days >= 6) status = rnd() < 0.06 ? 'Returned' : 'Delivered';
    if (status !== o.status) Object.assign(o, { status, updatedAt: moment(day, rnd) });
  }

  const sellers = users.filter(u => u.status === 'Active' && !u.products?.length && products.has(u.id));
  const count = sellers.length ? 6 + Math.floor(rnd() * 6) : 0;
  for (let i = 0; i < count; i++) {
    const u = pick(sellers, rnd);
    const [product, price] = pick(products.get(u.id), rnd);
    const units = price >= 300 ? 1 : 1 + Math.floor(rnd() * 4);
    db.all('orders').push({
      id: hash(`order ${day} ${i}`).slice(0, 12), number: `NX-${++number}`, userId: u.id, product, units, amount: +(price * units).toFixed(2),
      status: 'Pending', date: day, createdAt: moment(day, rnd), demo: true,
    });
  }

  let ref = Math.max(2000, ...db.all('payments').map(p => parseInt(String(p.ref).replace(/\D/g, ''), 10) || 0));
  for (const p of db.all('payments').slice()) {
    const u = byId.get(p.userId);
    if (!u || u.status !== 'Active' || p.status !== 'Scheduled' || p.date > day) continue;
    Object.assign(p, { status: 'Paid', updatedAt: moment(day, rnd) });
    const date = plus(p.date, 30);
    db.all('payments').push({
      id: hash(`payment ${p.id}`).slice(0, 12), createdAt: moment(day, rnd), ref: `PAY-${++ref}`, userId: u.id, method: p.method, status: 'Scheduled',
      amount: Math.max(10, Math.round(p.amount * (0.93 + rnd() * 0.16) / 10) * 10), date, note: p.note || '', demo: true,
    });
    u.nextPayment = date;
  }
}

function prune(day) {
  const cutoff = plus(day, -KEEP_DAYS);
  for (const c of ['orders', 'payments']) {
    const list = db.all(c);
    for (let i = list.length - 1; i >= 0; i--) if (list[i].demo && list[i].status !== 'Scheduled' && list[i].date < cutoff) list.splice(i, 1);
  }
}

// Catches up to today; returns the number of days moved.
function advance(today = iso(new Date())) {
  if (!on()) return 0;
  let state = db.settings().demo;
  if (state?.lastDay >= today) return 0;
  if (!state) {
    const copy = path.join(path.dirname(db.FILE), 'db.before-demo.json');
    if (!fs.existsSync(copy)) fs.copyFileSync(db.FILE, copy, fs.constants.COPYFILE_EXCL);
    for (const u of db.all('users')) u.demo = true;
    const dates = db.all('orders').map(o => o.date).filter(d => d && d <= today).sort();
    state = { lastDay: dates.at(-1) || plus(today, -1) };
  }
  const users = db.all('users').filter(u => u.demo && !(u.accounts || []).length);
  const byId = new Map(users.map(u => [u.id, u]));
  const products = new Map();
  for (const o of db.all('orders')) {
    if (!byId.has(o.userId) || !o.product || !(o.units > 0) || !(o.amount > 0)) continue;
    if (!products.has(o.userId)) products.set(o.userId, []);
    const list = products.get(o.userId);
    if (!list.some(p => p[0] === o.product)) list.push([o.product, o.amount / o.units]);
  }
  const first = plus(today, -MAX_CATCH_UP);
  let day = state.lastDay < first ? first : state.lastDay, moved = 0;
  while (day < today) { day = plus(day, 1); moveDay(day, { users, byId, products }); moved++; }
  prune(today);
  db.setSettings({ demo: { ...state, lastDay: today } });
  return moved;
}

let failedAt = '';
function middleware(req, res, next) {
  if (on()) {
    const today = iso(new Date());
    if (failedAt !== today) { // after an error, try again tomorrow instead of on every page
      try { advance(today); } catch (e) { failedAt = today; console.error('Demo data could not be moved forward:', e); }
    }
    const attach = res.attachment.bind(res);
    res.attachment = name => attach(name ? 'sample-data-' + name : name); // exports say so too
    res.locals.demoLabel = db.all('users').every(u => u.demo) ? 'Sample data' : 'Includes sample data';
  } else res.locals.demoLabel = '';
  next();
}

module.exports = { advance, middleware };
