// Tiny JSON-file data store. Whole DB lives in memory and is flushed to disk on every write.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'db.json');
const COLLECTIONS = ['users', 'services', 'orders', 'payments', 'messages'];

let state = null;

function load() {
  if (state) return state;
  if (!fs.existsSync(FILE)) {
    require('./seed').seed(FILE);
  }
  state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  for (const c of COLLECTIONS) state[c] = state[c] || [];
  state.settings = state.settings || {};
  if (require('./catalog').syncCatalog(state, newId)) save();
  applyPendingImport();
  if (assignClientNumbers()) save();
  return state;
}

// data/pending-import.json = { users, orders, payments, messages } is merged once at start-up,
// then renamed so it never runs twice. Users whose name already exists are skipped; orders,
// payments and messages name their user in a `user` field and are linked to that user's id.
// Safe to drop in while the portal is running: nothing is lost if the running copy saves first.
function applyPendingImport() {
  const file = path.join(path.dirname(FILE), 'pending-import.json');
  if (!fs.existsSync(file)) return;
  const { users = [], orders = [], payments = [], messages = [], updates = [] } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const added = new Map(); // name -> id of users created (or updated) by this import
  // updates: [{ name, set: { ...fields, channel: { ...merged into the existing channel } } }] for existing clients
  for (const { name, set = {} } of updates) {
    const u = state.users.find(x => x.name === name);
    if (!u) continue;
    const { channel, ...rest } = set;
    Object.assign(u, rest);
    if (channel) u.channel = { ...(u.channel || {}), ...channel };
    added.set(name, u.id);
  }
  for (const u of users) {
    if (state.users.some(x => x.name === u.name)) continue;
    const id = newId();
    // a millisecond apart so "Recently added" keeps the file's order (last one newest)
    state.users.push({ id, createdAt: new Date(Date.now() + added.size).toISOString(), ...u });
    added.set(u.name, id);
  }
  const link = (rows, collection) => {
    let n = 0;
    for (const { user, ...row } of rows) {
      if (!added.has(user)) continue; // only for users this import created
      state[collection].push({ id: newId(), createdAt: new Date().toISOString(), ...row, userId: added.get(user) });
      n++;
    }
    return n;
  };
  const counts = [link(orders, 'orders'), link(payments, 'payments'), link(messages, 'messages')];
  // optional `orderUpdates: [{ number, set: { status, ... } }]` changes existing orders (matched by order number)
  const { orderUpdates = [] } = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const { number, set = {} } of orderUpdates) {
    const o = state.orders.find(x => x.number === number);
    if (o) Object.assign(o, set, { updatedAt: new Date().toISOString() });
  }
  // optional `userOrder: [names]` sets the order of the Users list; anyone not listed keeps their place at the end
  const { userOrder } = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(userOrder)) {
    const rank = new Map(userOrder.map((n, i) => [n, i]));
    state.users = state.users
      .map((u, i) => ({ u, k: rank.has(u.name) ? rank.get(u.name) : userOrder.length + i }))
      .sort((a, b) => a.k - b.k).map(x => x.u);
  }
  save();
  fs.renameSync(file, file.replace(/\.json$/, `.applied-${Date.now()}.json`));
  console.log(`Imported ${added.size - updates.length} user(s), updated ${updates.length}, ${counts[0]} order(s), ${counts[1]} payment(s), ${counts[2]} message(s) from pending-import.json`);
}

function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, FILE);
}

const newId = () => crypto.randomBytes(6).toString('hex');

function all(c) { return load()[c]; }
function get(c, id) { return all(c).find(x => x.id === id) || null; }
function insert(c, doc) {
  const row = { id: newId(), createdAt: new Date().toISOString(), ...doc };
  all(c).push(row);
  save();
  return row;
}
function update(c, id, patch) {
  const row = get(c, id);
  if (!row) return null;
  Object.assign(row, patch, { updatedAt: new Date().toISOString() });
  save();
  return row;
}
function remove(c, id) {
  const list = all(c);
  const i = list.findIndex(x => x.id === id);
  if (i === -1) return false;
  list.splice(i, 1);
  save();
  return true;
}
function removeWhere(c, fn) {
  const s = load();
  const before = s[c].length;
  s[c] = s[c].filter(x => !fn(x));
  if (s[c].length !== before) save();
}
// Every client gets a permanent number (1001, 1002, …) used in their Client ID, e.g. WA-1002.
// Clients without one are numbered oldest first; numbers are never reused.
function assignClientNumbers() {
  const missing = state.users.filter(u => !u.clientNo);
  if (!missing.length) return false;
  let next = Math.max(1000, ...state.users.map(u => u.clientNo || 0)) + 1;
  missing.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const u of missing) u.clientNo = next++;
  return true;
}
const nextClientNo = () => Math.max(1000, ...load().users.map(u => u.clientNo || 0)) + 1;

function settings() { return load().settings; }
function setSettings(patch) {
  const s = load();
  s.settings = { ...s.settings, ...patch };
  save();
  return s.settings;
}

module.exports = { all, get, insert, update, remove, removeWhere, settings, setSettings, save, newId, nextClientNo };
