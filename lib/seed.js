// Creates data/db.json with sample data. Run `npm run seed` to reset everything.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { catalog, CONTACT, CATALOG_VERSION } = require('./catalog');

const id = () => crypto.randomBytes(6).toString('hex');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// deterministic pseudo-random so the sample data looks the same every reset
let s = 42;
const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const pick = arr => arr[Math.floor(rnd() * arr.length)];

const iso = d => d.toISOString().slice(0, 10);
const daysFrom = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
const shortDate = d => `${MONTHS[d.getMonth()]} ${d.getDate()}`;

function lastMonths(values) {
  const now = new Date();
  return values.map((amount, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (values.length - 1 - i), 1);
    return { label: MONTHS[d.getMonth()], amount: Math.round(amount) };
  });
}
function last30(base, spread) {
  return Array.from({ length: 30 }, (_, i) => ({
    label: shortDate(daysFrom(i - 29)),
    amount: Math.round(base + (rnd() - 0.45) * spread + (i < 10 ? spread * 0.35 : 0)),
  }));
}
function week(base, spread) {
  return DAYS.map(label => ({ label, amount: Math.round(base + (rnd() - 0.5) * spread) }));
}
const sum = arr => arr.reduce((a, x) => a + x.amount, 0);

function seed(file) {
  const services = catalog().map(s => ({ id: id(), ...s, createdAt: new Date().toISOString() }));
  const svc = name => services.find(s => s.name === name).id;

  const created = n => new Date(Date.now() - n * 86400000).toISOString();

  const c1Month = last30(3900, 2600);
  const c1Week = week(3800, 2200);
  const c1Year = lastMonths([0, 0, 0, 9000, 12500, 15200, 21000, 33000, 41000, 52000, 30000, 0].slice(0, 9));
  const c3Year = lastMonths([0, 0, 0, 12000, 14000, 16800, 24000, 38000, 50000, 63000, 45000].slice(0, 9));
  const c6Year = lastMonths([900, 1400, 2100, 2800, 3600, 4300]);
  const c4Year = lastMonths([0, 0, 0, 6500, 9800, 6000, 17000, 29000, 34000, 15853, 28000].slice(0, 9));

  const users = [
    {
      name: 'Client 1', storeName: 'Sample Store', storeLink: 'https://example.com/sample-store', email: 'client1@example.com',
      phone: '+1 (555) 010-0142', country: 'United States', serviceId: svc('Amazon Wholesale FBA'), status: 'Active', joinDate: '2023-03-14',
      salesToday: 3466, unitsToday: 140, balance: 33480, nextPayment: iso(daysFrom(6)), orders: 195, returns: 1, communications: 2, investment: 15000,
      sales: { week: c1Week, month: c1Month, year: c1Year },
      totals: { week: sum(c1Week), month: sum(c1Month), year: sum(c1Year) }, change: { week: 8, month: 26, year: 41 }, createdAt: created(40),
    },
    {
      name: 'Client 2', storeName: '', storeLink: '', email: 'client2@example.com', phone: '', country: 'Canada', serviceId: svc('Shopify Dropshipping'), status: 'Active',
      joinDate: '2024-11-02', salesToday: null, unitsToday: null, balance: 849, nextPayment: iso(daysFrom(-9)), orders: null, returns: null,
      communications: 1, investment: 5000, sales: { week: [], month: [], year: [] }, totals: {}, change: {}, createdAt: created(30),
    },
    {
      name: 'Client 3', storeName: '', storeLink: '', email: 'client3@example.com', phone: '+44 20 7946 0958', country: 'United Kingdom', serviceId: svc('Amazon Private Label'),
      status: 'Active', joinDate: '2024-02-19', salesToday: null, unitsToday: null, balance: 39380, nextPayment: iso(daysFrom(12)), orders: 41, returns: 2,
      communications: 4, investment: 20000, sales: { week: [], month: [], year: c3Year }, totals: { year: sum(c3Year) }, change: { year: 22 }, createdAt: created(20),
    },
    {
      name: 'Client 4', storeName: '', storeLink: '', email: 'client4@example.com', phone: '', country: 'Australia', serviceId: svc('Walmart Automation'), status: 'Active',
      joinDate: '2024-06-08', salesToday: null, unitsToday: null, balance: 16400, nextPayment: iso(daysFrom(18)), orders: 13, returns: 0,
      communications: 1, investment: 12000, sales: { week: [], month: [], year: c4Year }, totals: { year: sum(c4Year) }, change: { year: 12 }, createdAt: created(10),
    },
    {
      name: 'Client 5', storeName: '', storeLink: '', email: 'client5@example.com', phone: '+1 (555) 010-0177', country: 'United States', serviceId: svc('TikTok Shop'),
      status: 'Active', joinDate: '2025-01-27', salesToday: 729, unitsToday: 31, balance: 10340, nextPayment: iso(daysFrom(26)), orders: 30, returns: 1,
      communications: 3, investment: 8000, sales: { week: [], month: [], year: [] }, totals: {}, change: {}, createdAt: created(2),
    },
    {
      name: 'Client 6', storeName: 'Client 6 Channel', storeLink: '', email: 'client6@example.com', phone: '', country: 'United States',
      serviceId: svc('YouTube Automation'), status: 'Active', joinDate: iso(daysFrom(0)), salesToday: 145, unitsToday: null, balance: 7250,
      nextPayment: iso(daysFrom(14)), orders: null, returns: null, communications: 1, investment: 6000,
      sales: { week: [], month: [], year: c6Year }, totals: { year: sum(c6Year) }, change: { year: 18 }, createdAt: created(0),
    },
  ].map(u => ({ id: id(), ...u }));

  const products = [
    ['Stainless Steel Water Bottle 32oz', 24.99], ['Bamboo Cutting Board Set', 29.99], ['Wireless Charging Pad', 22.99],
    ['Yoga Mat Non-Slip 6mm', 29.99], ['LED Desk Lamp, Dimmable', 38.5], ['Silicone Baking Mat (2-pack)', 13.99],
    ['Insulated Lunch Bag', 22.0], ['Resistance Bands Set', 25.99], ['Kitchen Scale, Digital', 19.99], ['Ceramic Pour-Over Coffee Set', 34.0],
  ];
  const orderUsers = [users[0], users[0], users[0], users[2], users[2], users[3], users[4], users[4]];
  const orders = [];
  for (let i = 0; i < 64; i++) {
    const age = Math.floor(i * 0.7);
    const [product, price] = pick(products);
    const units = 1 + Math.floor(rnd() * 5);
    let status = age < 2 ? 'Pending' : age < 6 ? pick(['In transit', 'In transit', 'Pending']) : 'Delivered';
    if (age >= 4 && rnd() < 0.07) status = 'Returned';
    orders.push({
      id: id(), number: `NX-${10482 - i}`, userId: pick(orderUsers).id, product, units, amount: +(price * units).toFixed(2),
      status, date: iso(daysFrom(-age)), createdAt: created(age),
    });
  }

  const payments = [];
  let ref = 2240;
  const methods = ['Bank transfer', 'Bank transfer', 'Payoneer', 'Wise'];
  const dayOfMonth = new Date().getDate();
  for (let m = 8; m >= 0; m--) {
    for (const [u, base] of [[users[0], 6200], [users[2], 5150], [users[3], 3600], [users[4], 2650]]) {
      if (rnd() < 0.15) continue;
      const growth = 0.45 + (8 - m) * 0.07;
      // m = 0 is the current month: keep those payouts between the 1st and today
      const ago = m === 0 ? Math.floor(rnd() * dayOfMonth) : m * 30 - Math.floor(rnd() * 8);
      payments.push({ id: id(), ref: `PAY-${ref++}`, userId: u.id, method: pick(methods), amount: Math.round(base * growth / 10) * 10,
        status: 'Paid', date: iso(daysFrom(-ago)), note: '', createdAt: created(ago) });
    }
  }
  payments.push({ id: id(), ref: `PAY-${ref++}`, userId: users[1].id, method: 'Wise', amount: 849, status: 'Scheduled', date: iso(daysFrom(-9)), note: '', createdAt: created(12) });
  for (const [u, amt, d] of [[users[0], 6200, 6], [users[2], 5400, 12], [users[3], 3800, 18], [users[4], 2800, 26]]) {
    payments.push({ id: id(), ref: `PAY-${ref++}`, userId: u.id, method: 'Bank transfer', amount: amt, status: 'Scheduled', date: iso(daysFrom(d)), note: '', createdAt: created(1) });
  }

  const at = (daysAgo, h, m) => { const d = daysFrom(-daysAgo); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const msg = (u, from, body, when, read = true) => ({ id: id(), userId: u.id, from, body, at: when, read });
  const messages = [
    msg(users[0], 'user', "Hi team, I noticed the payout for last month hasn't shown in my bank yet. Can you confirm when it was sent?", at(0, 9, 12)),
    msg(users[0], 'admin', 'Hi! The payout was sent by bank transfer. Transfers usually take 2–3 business days to arrive.', at(0, 9, 20)),
    msg(users[0], 'user', 'Got it, it just arrived. Thanks! Also, can we discuss adding a second product line next month?', at(0, 10, 4), false),
    msg(users[2], 'user', 'When will my store go live on the new service?', at(0, 9, 41), false),
    msg(users[4], 'user', 'I uploaded the invoice for the last inventory order.', at(1, 16, 5), false),
    msg(users[3], 'admin', "Here's your monthly report — let us know if you have questions.", at(1, 11, 30)),
    msg(users[3], 'user', 'Thanks, the report looks good.', at(1, 14, 2)),
    msg(users[1], 'user', 'Can you check why my payment is showing overdue?', at(3, 13, 15)),
  ];

  const password = process.env.ADMIN_PASSWORD || 'nexora-admin';
  const settings = {
    admin: {
      name: 'Admin User', role: 'Account manager', email: (process.env.ADMIN_EMAIL || 'admin@ecomnexora.com').toLowerCase(),
      phone: '+1 (555) 010-0100', timezone: 'America/New_York', currency: 'USD', passwordHash: bcrypt.hashSync(password, 10),
    },
    company: { ...CONTACT, address: '' },
    notifications: { newUser: true, paymentDue: true, overdue: true, newMessage: false, weeklySummary: true },
  };

  fs.mkdirSync(path.dirname(file), { recursive: true });
  require('./sample').fillSamples({ users, orders }, id);
  const meta = { catalog: CATALOG_VERSION };
  fs.writeFileSync(file, JSON.stringify({ meta, users, services, orders, payments, messages, settings }, null, 2));
}

module.exports = { seed };

if (require.main === module) {
  try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch {}
  const file = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'db.json');
  if (fs.existsSync(file) && !process.argv.includes('--force')) {
    console.log('Database already exists. Use --force to reset it.');
  } else {
    seed(file);
    console.log('Sample data written to', file);
  }
}
