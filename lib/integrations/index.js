// Business-account connections: work out the platform from a link and pull data from its API.
// Each platform module exports sync(account) → { status, message, meta, patch } where `patch`
// is merged into the client (sales, channel stats, …). Platforms without an API connection yet
// keep the link and report what is needed.
const youtube = require('./youtube');
const shopify = require('./shopify');

const PLATFORMS = {
  youtube: { name: 'YouTube', logo: 'youtube', hosts: /(^|\.)youtube\.com$|^youtu\.be$/i,
    help: 'Public channel stats and uploads come from the YouTube Data API. Daily views, watch time and revenue need the channel owner to sign in (YouTube Analytics) — enter those manually for now.' },
  shopify: { name: 'Shopify', logo: 'shopify', hosts: /\.myshopify\.com$/i, token: true,
    help: 'Use the store\'s .myshopify.com address and an Admin API access token (Shopify admin → Settings → Apps → Develop apps → create app with read_orders → install → copy the token).' },
  amazon: { name: 'Amazon', logo: 'amazon', hosts: /(^|\.)amazon\.(com|ca|co\.uk|de|fr|it|es|ae|sa|in|com\.au|com\.mx|co\.jp)$/i,
    needs: 'Amazon Selling Partner API access: a registered developer app approved by Amazon, then the seller authorizes it.' },
  walmart: { name: 'Walmart', logo: 'walmart', hosts: /(^|\.)walmart\.com$/i,
    needs: 'Walmart Marketplace API keys (client ID and secret) from the seller\'s Developer Portal.' },
  tiktok: { name: 'TikTok Shop', logo: 'tiktok', hosts: /(^|\.)tiktok\.com$|(^|\.)tiktokshop\.com$/i,
    needs: 'A TikTok Shop Partner app, approved by TikTok and authorized by the seller.' },
  facebook: { name: 'Facebook Marketplace', logo: 'facebook', hosts: /(^|\.)facebook\.com$|^fb\.com$/i,
    needs: 'Facebook Marketplace has no seller data API, so numbers are entered manually.' },
};

function hostOf(url) {
  try { return new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url).hostname.replace(/^www\./i, ''); } catch { return ''; }
}
function detect(url) {
  const host = hostOf(url);
  return Object.keys(PLATFORMS).find(k => PLATFORMS[k].hosts.test(host)) || '';
}

async function sync(account) {
  const platform = account.platform || detect(account.url);
  const P = PLATFORMS[platform];
  if (!P) return { status: 'unknown', message: 'Platform not recognised from this link. Choose it from the list.' };
  try {
    if (platform === 'youtube') return await youtube.sync(account);
    if (platform === 'shopify') return await shopify.sync(account);
    return { status: 'needs_setup', message: P.needs };
  } catch (e) {
    return { status: 'error', message: e.message || 'Could not reach the API.' };
  }
}

// Combine several accounts' patches into one client update (later accounts win on the same field).
function applyPatches(user, results) {
  for (const r of results) {
    if (!r.patch) continue;
    const { channel, ...rest } = r.patch;
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) user[k] = v;
    if (channel) user.channel = { ...(user.channel || {}), ...channel };
  }
  return user;
}

const publicInfo = () => Object.fromEntries(Object.entries(PLATFORMS).map(([k, p]) => [k, {
  name: p.name, logo: p.logo, hosts: p.hosts.source, token: !!p.token, auto: !p.needs, note: p.needs || p.help,
}]));

module.exports = { PLATFORMS, detect, sync, applyPatches, publicInfo };
