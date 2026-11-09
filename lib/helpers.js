const db = require('./db');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const isNum = v => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v));

function money(v, { dash = '—', cents = false } = {}) {
  if (!isNum(v)) return dash;
  return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
}
function compact(v) {
  if (!isNum(v)) return '—';
  const n = Number(v);
  if (Math.abs(n) >= 1e6) return '$' + +(n / 1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + +(n / 1e3).toFixed(2) + 'K';
  return '$' + n.toLocaleString('en-US');
}
const num = (v, dash = '—') => (isNum(v) ? Number(v).toLocaleString('en-US') : dash);
// 48200 -> "48.2K", 1100000 -> "1.1M" (views, subscribers)
function short(v, dash = '—') {
  if (!isNum(v)) return dash;
  const n = Number(v), a = Math.abs(n);
  if (a >= 1e6) return +(n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return +(n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString('en-US');
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s.length === 10 ? s + 'T12:00:00' : s);
  return Number.isNaN(d.getTime()) ? null : d;
}
function shortDate(s) {
  const d = parseDate(s);
  return d ? `${MONTHS[d.getMonth()]} ${d.getDate()}` : (s || '—');
}
function longDate(s) {
  const d = parseDate(s);
  return d ? `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : '—';
}
function timeAgo(isoStr) {
  const d = parseDate(isoStr);
  if (!d) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diff === 1) return 'Yesterday';
  return shortDate(isoStr);
}
const timeOf = isoStr => { const d = parseDate(isoStr); return d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''; };
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const daysUntil = s => { const d = parseDate(s); if (!d) return null; const t = parseDate(todayIso()); return Math.round((d - t) / 86400000); };

function initials(name = '') {
  const m = name.match(/^client\s*(\d+)/i);
  if (m) return 'C' + m[1];
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

const serviceName = id => db.get('services', id)?.name || 'Service not set';
const serviceLogo = id => db.get('services', id)?.logo || '';

// Client ID = service code + permanent client number, e.g. "WA-1002". "CL" when no service is set.
const SERVICE_CODES = {
  'Amazon Wholesale FBA': 'AW', 'Amazon Private Label': 'AP', 'Amazon Dropshipping': 'AD', 'Walmart Automation': 'WA',
  'Shopify Dropshipping': 'SD', 'TikTok Shop': 'TS', 'Facebook Marketplace': 'FM', 'Virtual Assistants': 'VA',
  'Account Reinstatement': 'AR', 'Ecom Private Label': 'EP', 'YouTube Automation': 'YA',
  'Amazon Wholesale FBA (JIT)': 'AWJ', 'Amazon Private Label (JIT)': 'APJ', 'Shopify Dropshipping (JIT)': 'SDJ', 'Shopify Private Label (JIT)': 'SPJ',
};
function serviceCode(serviceId) {
  const name = db.get('services', serviceId)?.name;
  if (!name) return 'CL';
  if (SERVICE_CODES[name]) return SERVICE_CODES[name];
  // services added later: initials of the first two words, plus J for Just In Time plans
  const words = name.replace(/\(.*?\)/g, '').trim().split(/\s+/);
  return (words.slice(0, 2).map(w => w[0]).join('') + (/\(JIT\)/i.test(name) ? 'J' : '')).toUpperCase();
}
const clientId = u => (u && u.clientNo ? `${serviceCode(u.serviceId)}-${u.clientNo}` : '');

// Privacy labels for the client detail page: never the person's, store's or channel's name.
const clientLabel = u => (clientId(u) ? `Client ${clientId(u)}` : 'Client');
const SERVICE_CATEGORIES = [
  [/youtube/i, 'Content Automation'],
  [/amazon|walmart/i, 'Marketplace Automation'],
  [/shopify|ecom private label/i, 'Store Management'],
  [/tiktok|facebook/i, 'Social Commerce'],
  [/virtual assistant/i, 'Virtual Assistance'],
  [/reinstatement/i, 'Account Recovery'],
];
// List/table display for a client anywhere in the portal: ID first, never a name or store.
const ANON_SUB = 'Managed account';
const clientRef = u => (u ? clientId(u) || 'Client' : 'Deleted client');
const categoryInitials = serviceId => serviceCategory(serviceId).split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
// Generic (non-platform) icon + tile colour for each service category.
const CATEGORY_ICONS = {
  'Marketplace Automation': ['cart', 'red'], 'Content Automation': ['video', 'blue'], 'Store Management': ['store', 'amber'],
  'Social Commerce': ['share', 'violet'], 'Virtual Assistance': ['headset', 'green'], 'Account Recovery': ['shield', 'green'],
  'Managed Service': ['box', 'dark'], Unassigned: ['userDashed', 'dark'],
};
const categoryIcon = category => CATEGORY_ICONS[category] || CATEGORY_ICONS['Managed Service'];
const clientOption = u => `${clientRef(u)} · ${serviceCategory(u.serviceId)}`;

function serviceCategory(serviceId) {
  const name = db.get('services', serviceId)?.name;
  if (!name) return 'Unassigned';
  const hit = SERVICE_CATEGORIES.find(([re]) => re.test(name));
  return hit ? hit[1] : 'Managed Service';
}

// A payment that's still scheduled but past its date counts as overdue.
function paymentStatus(p) {
  if (p.status === 'Scheduled' && daysUntil(p.date) < 0) return 'Overdue';
  return p.status;
}

const PILL = {
  Active: 'g', Paid: 'g', Delivered: 'g', Online: 'g',
  Pending: 'a', Paused: 'n', Inactive: 'n', Draft: 'n',
  'In transit': 'b', Scheduled: 'b', Beta: 'b',
  Returned: 'r', Overdue: 'r', Cancelled: 'r',
};
const pill = status => PILL[status] || 'n';

// Sums every user's sales series of one range by label, keeping label order.
function aggregateSeries(range) {
  const map = new Map();
  let contributors = 0;
  for (const u of db.all('users')) {
    const series = u.sales?.[range] || [];
    if (!series.length) continue;
    contributors++;
    for (const { label, amount } of series) map.set(label, (map.get(label) || 0) + (Number(amount) || 0));
  }
  const points = [...map].map(([label, amount]) => ({ label, amount }));
  // users may have entered different spans, so put known labels in calendar order
  const key = labelOrder(points.map(p => p.label));
  if (key) points.sort((a, b) => key(a.label) - key(b.label));
  return { points, contributors };
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Returns a sort key for month names ("Jan"), weekdays ("Mon") or day labels ("Sep 14"), else null.
function labelOrder(labels) {
  const m = l => MONTHS.indexOf(String(l).slice(0, 3));
  const now = new Date();
  if (labels.every(l => /^[A-Za-z]{3}$/.test(l) && m(l) !== -1)) {
    return l => (m(l) - now.getMonth() + 11) % 12; // oldest month first, current month last
  }
  if (labels.every(l => DAYS.includes(String(l).slice(0, 3)) && String(l).length <= 9)) {
    return l => DAYS.indexOf(String(l).slice(0, 3));
  }
  if (labels.every(l => /^[A-Za-z]{3} \d{1,2}$/.test(l) && m(l) !== -1)) {
    // "Sep 14": order by date within the last year
    return l => {
      const [mon, day] = [m(l), Number(String(l).split(' ')[1])];
      const d = new Date(now.getFullYear(), mon, day);
      if (d > now) d.setFullYear(d.getFullYear() - 1);
      return d.getTime();
    };
  }
  return null;
}

const sumBy = (arr, key) => arr.reduce((a, x) => a + (Number(x[key]) || 0), 0);

// "Mon, 1200" lines -> [{label, amount}]
function parseSeries(text = '') {
  return String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
    const i = line.lastIndexOf(',');
    if (i === -1) return null;
    const label = line.slice(0, i).trim();
    const amount = Number(line.slice(i + 1).replace(/[$\s,]/g, ''));
    return label && Number.isFinite(amount) ? { label: label.slice(0, 20), amount } : null;
  }).filter(Boolean);
}
const seriesToText = (arr = []) => arr.map(p => `${p.label}, ${p.amount}`).join('\n');

const optNum = v => (isNum(v) ? Number(v) : null);
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

function csv(rows) {
  const esc = v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map(r => r.map(esc).join(',')).join('\r\n');
}

module.exports = {
  money, compact, num, short, shortDate, longDate, timeAgo, timeOf, todayIso, daysUntil, initials, serviceName, serviceLogo, serviceCode, clientId, clientLabel, serviceCategory, ANON_SUB, clientRef, categoryInitials, clientOption, categoryIcon,
  paymentStatus, pill, aggregateSeries, sumBy, parseSeries, seriesToText, optNum, str, csv, isNum, MONTHS,
};
