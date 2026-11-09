// Services offered on ecomnexora.com ("Done For You" + "Just In Time" menus).
// Targets and ROI come from each service page on the website.
const SITE = 'https://ecomnexora.com';
const CATALOG_VERSION = 3;

const CATEGORIES = ['Done For You', 'Just In Time'];

const SERVICES = [
  { name: 'Amazon Wholesale FBA', category: 'Done For You', logo: 'amazon', icon: 'box', color: 'red', monthlyTarget: 10000, roi: '15–20%', url: `${SITE}/amazon-wholesale-fba`,
    description: 'Done-for-you Amazon store selling brand-name products bought in bulk and fulfilled by Amazon.' },
  { name: 'Amazon Private Label', category: 'Done For You', logo: 'amazon', icon: 'tag', color: 'red', monthlyTarget: 50000, roi: '20–25%', url: `${SITE}/amazon-private-label`,
    description: 'Your own branded product line on Amazon — research, sourcing, listing and launch handled for you.' },
  { name: 'Shopify Dropshipping', category: 'Done For You', logo: 'shopify', icon: 'store', color: 'green', monthlyTarget: 10000, roi: '15–20%', url: `${SITE}/shopify-dropshipping`,
    description: 'A fully managed Shopify store selling products shipped straight from suppliers, with no inventory to hold.' },
  { name: 'Facebook Marketplace', category: 'Done For You', logo: 'facebook', icon: 'store', color: 'blue', price: '$4,999', url: `${SITE}/facebook-marketplace`,
    description: 'Managed selling on Facebook Marketplace — listings, order placement, inventory and account management.' },
  { name: 'Walmart Automation', category: 'Done For You', logo: 'walmart', icon: 'cart', color: 'blue', monthlyTarget: 10000, roi: '20–25%', url: `${SITE}/walmart-automation`,
    description: 'A managed Walmart Marketplace store, from product research and supply chain to daily operations.' },
  { name: 'Amazon Dropshipping', category: 'Done For You', logo: 'amazon', icon: 'truck', color: 'dark', url: `${SITE}/amazon-dropshipping`,
    description: 'Sell on Amazon without holding stock — products ship directly to customers from vetted suppliers.' },
  { name: 'Virtual Assistants', category: 'Done For You', logo: 'amazon', icon: 'users', color: 'amber', price: 'From $499/month', url: `${SITE}/virtual-assistants`,
    description: 'Dedicated Amazon virtual assistants for product sourcing, PPC campaigns and order & inventory management.' },
  { name: 'Account Reinstatement', category: 'Done For You', logo: 'amazon', icon: 'shield', color: 'dark', url: `${SITE}/account-reinstatement`,
    description: 'Specialists who prepare appeals and plans of action to restore suspended Amazon seller accounts.' },
  { name: 'Ecom Private Label', category: 'Done For You', logo: 'shopify', icon: 'tag', color: 'green', monthlyTarget: 50000, roi: '20–25%', url: `${SITE}/ecom-private-label`,
    description: 'Shopify private label management — your own brand, packaging and products, sold exclusively on your store.' },
  { name: 'TikTok Shop', category: 'Done For You', logo: 'tiktok', icon: 'send', color: 'dark', monthlyTarget: 15000, roi: '15–20%', url: `${SITE}/tiktok-shop-private-label`,
    description: 'TikTok Shop management — product listings, creator reach and in-app sales on TikTok.' },
  { name: 'YouTube Automation', category: 'Done For You', logo: 'youtube', icon: 'play', color: 'red', url: `${SITE}/youtube-automation`,
    description: 'Faceless, brand or creator YouTube channels built, run and monetized end to end.' },
  { name: 'Amazon Wholesale FBA (JIT)', category: 'Just In Time', logo: 'amazon', icon: 'box', color: 'amber', url: `${SITE}/amazon-wholesale-fba-jit`,
    description: 'Just In Time plan for an Amazon Wholesale FBA store.' },
  { name: 'Amazon Private Label (JIT)', category: 'Just In Time', logo: 'amazon', icon: 'tag', color: 'amber', url: `${SITE}/amazon-private-label-jit`,
    description: 'Just In Time plan for an Amazon Private Label store.' },
  { name: 'Shopify Dropshipping (JIT)', category: 'Just In Time', logo: 'shopify', icon: 'store', color: 'amber', url: `${SITE}/shopify-dropshipping-jit`,
    description: 'Just In Time plan for a Shopify Dropshipping store.' },
  { name: 'Shopify Private Label (JIT)', category: 'Just In Time', logo: 'shopify', icon: 'tag', color: 'amber', url: `${SITE}/shopify-private-label-jit`,
    description: 'Just In Time plan for a Shopify Private Label store.' },
];

const blank = { description: '', status: 'Active', monthlyTarget: null, roi: '', price: '', url: '', logo: '' };
const catalog = () => SERVICES.map(s => ({ ...blank, ...s }));

// Services that only existed in the first sample data and aren't on the website.
const RETIRED = ['eBay Automation'];
const OLD_CONTACT = { supportEmail: 'support@ecomnexora.com', supportPhone: '+1 (555) 010-0199' };
const CONTACT = { name: 'Ecom Nexora', website: SITE, supportEmail: 'hello@ecomnexora.com', supportPhone: '+1 (424) 394-0041' };

// Brings an existing database up to the website catalogue without touching users' data:
// matching services keep their id (so users stay assigned), new ones are added,
// retired sample services are removed and their users become unassigned.
function syncCatalog(state, newId) {
  state.meta = state.meta || {};
  const from = state.meta.catalog || 0;
  if (from >= CATALOG_VERSION) return false;
  if (from < 2) fullSync(state, newId);
  // v3: platform logos — only fills services that don't have one, nothing else changes
  if (from < 3) {
    for (const svc of catalog()) {
      const existing = state.services.find(s => s.name.toLowerCase() === svc.name.toLowerCase());
      if (existing && !existing.logo) existing.logo = svc.logo;
    }
  }
  state.meta.catalog = CATALOG_VERSION;
  return true;
}

function fullSync(state, newId) {
  const now = new Date().toISOString();
  for (const svc of catalog()) {
    const existing = state.services.find(s => s.name.toLowerCase() === svc.name.toLowerCase());
    if (existing) {
      const { status } = existing;
      Object.assign(existing, svc, { status });
      delete existing.minInvestment;
    } else {
      state.services.push({ id: newId(), createdAt: now, ...svc });
    }
  }
  const retired = state.services.filter(s => RETIRED.includes(s.name)).map(s => s.id);
  state.services = state.services.filter(s => !retired.includes(s.id));
  for (const u of state.users) if (retired.includes(u.serviceId)) u.serviceId = '';
  for (const s of state.services) if (!s.category) s.category = 'Done For You';

  const co = state.settings.company || {};
  if (!co.supportEmail || co.supportEmail === OLD_CONTACT.supportEmail) co.supportEmail = CONTACT.supportEmail;
  if (!co.supportPhone || co.supportPhone === OLD_CONTACT.supportPhone) co.supportPhone = CONTACT.supportPhone;
  state.settings.company = { ...CONTACT, ...co };
}

// Platform logos in public/img/brands (official marks, from Simple Icons, CC0)
const LOGOS = { amazon: 'Amazon', shopify: 'Shopify', facebook: 'Facebook', walmart: 'Walmart', tiktok: 'TikTok', youtube: 'YouTube' };

module.exports = { SITE, CATEGORIES, CATALOG_VERSION, LOGOS, catalog, syncCatalog, CONTACT };
