const router = require('express').Router();
const db = require('../lib/db');

const TOPICS = [
  { key: 'start', icon: 'book', color: 'red', title: 'Getting started', text: 'Sign in, find your way around and add your first users.' },
  { key: 'users', icon: 'users', color: 'green', title: 'Managing users', text: 'Profiles, services, statuses and sales data.' },
  { key: 'payments', icon: 'card', color: 'blue', title: 'Payments & payouts', text: 'Scheduling, recording and tracking payments.' },
  { key: 'reports', icon: 'chart', color: 'amber', title: 'Reports & exports', text: 'Charts, CSV exports and printing reports.' },
];

const FAQ = [
  ['start', 'How do I add a new user to the portal?', 'Click <b>Add user</b> in the top right of any page. Only the name is required — you can leave everything else blank and fill it in later with <b>Edit</b> on the user\'s profile.'],
  ['start', 'How do I search for a user?', 'Type in the search bar at the top of any page. Matching users appear instantly; press Enter to see every match on the Users page. You can search by name, store, email or service.'],
  ['start', 'How do I sign out?', 'Click <b>Log out</b> at the bottom of the sidebar. Sessions also end automatically after 8 hours, or 30 days if you ticked “Keep me signed in”.'],
  ['users', 'How is the combined balance calculated?', 'It is the sum of the <b>Current balance</b> field across every user. Update a user\'s balance from their profile with <b>Edit</b>.'],
  ['users', 'Can I change a user\'s service after they\'ve started?', 'Yes. Open the user, click <b>Edit</b>, choose a new service and save. Service totals on the Services page update immediately.'],
  ['users', 'How do I enter 12-month sales for the trend chart?', 'In the user form, under <b>Product sales chart → Last 12 months</b>, write one month per line as <code>label, amount</code> — for example <code>Jan, 18500</code>. The dashboard trend adds up every user who has 12-month sales entered.'],
  ['users', 'What happens when I delete a user?', 'The user and their messages are removed. Their orders and payments are kept for your records and show as “Deleted user”.'],
  ['payments', 'What happens when a payment becomes overdue?', 'A scheduled payment whose date has passed is shown as <b>Overdue</b> in red on the Payments page. Use <b>Mark paid</b> once it has been sent.'],
  ['payments', 'How do I record a payout?', 'On the Payments page click <b>Record payment</b>, pick the user, amount, method and date. Choose “Scheduled” to plan a future payment — it also updates the user\'s next payment date.'],
  ['reports', 'Can I export reports for a single user?', 'Exports on the Reports page cover all users. To work with a single user, export the CSV and filter it in Excel or Google Sheets, or use <b>Print</b> on the user\'s profile.'],
  ['reports', 'How do I save a report as PDF?', 'Click <b>Print / PDF</b> on the Reports page and choose “Save as PDF” in the print dialog. The sidebar and buttons are hidden automatically.'],
];

router.get('/help', (req, res) => {
  const company = db.settings().company || {};
  res.render('pages/help', { title: 'Help', active: 'help', topics: TOPICS, faq: FAQ, company });
});

module.exports = router;
