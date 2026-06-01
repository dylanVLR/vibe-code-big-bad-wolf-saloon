/**
 * @module seo-info
 * @description Dev-only "🔍 SEO" popup. Explains, for the team, how the site is
 * optimized so search engines and social platforms can find, understand, and
 * rank it. Purely informational — it reads nothing and changes nothing. The
 * actual optimizations live in index.html (head + crawlable content), styles.css
 * (.sr-only), robots.txt and sitemap.xml.
 */
'use strict';

const SECTIONS = [
  ['Page metadata', [
    'Keyword-rich <code>&lt;title&gt;</code> and a compelling 160-character meta description.',
    'Canonical URL set, so duplicate/variant URLs don’t split ranking.',
    '<code>robots</code> directive allows indexing with large image previews.',
    '<code>keywords</code> + <code>author</code> tags for completeness.',
  ]],
  ['Indexable content (the big one for a JS game)', [
    'The game UI is drawn by JavaScript, which crawlers see as an empty page.',
    'So a real, accurate <code>&lt;h1&gt;</code> + description + feature list is in the HTML, hidden visually with the screen-reader <code>.sr-only</code> technique (not <code>display:none</code>, which Google ignores).',
    'Google now has genuine text to index for terms like “free online slot game” and “Wild-West slot” — and screen-reader users get a proper description too.',
  ]],
  ['Structured data (rich results)', [
    'Schema.org <code>VideoGame</code> JSON-LD describes the game: name, genre (Casino / Slot / Arcade), platform, single-player, free to play.',
    'Makes the page eligible for richer search listings and helps Google classify it correctly.',
  ]],
  ['Social sharing (link previews)', [
    'Open Graph + Twitter Card tags, so links unfurl with a title, description and image on Facebook, X, iMessage, Discord, Slack and LinkedIn.',
    'A purpose-built 1200×630 share image (assets/og-image.png) — the wolf + logo + tagline.',
  ]],
  ['Crawl directives', [
    '<code>robots.txt</code> allows crawling and points to the sitemap (dev-only /tools and /docs are disallowed).',
    '<code>sitemap.xml</code> lists the canonical URL for fast discovery.',
  ]],
  ['Speed & mobile (real ranking signals)', [
    'Core Web Vitals: only ~15 MB loads before first play; decorative/bonus assets are deferred.',
    'WebP art, lazy media, and a static-idle render path keep it smooth on phones.',
    'Responsive, installable PWA with viewport + theme-color — mobile-friendliness is a ranking factor.',
  ]],
  ['Honest & compliant', [
    'Described accurately as a <b>free, virtual-credit</b> game — fun casino-style play with <b>no real-money wagering</b>.',
    'No misleading claims, hidden keyword stuffing, or fake reviews — just genuine, relevant content.',
  ]],
];

const NEXT_STEPS = [
  'Verify the site in Google Search Console and submit the sitemap.',
  'If you add a custom domain, update the canonical URL, og:url, robots.txt and sitemap.xml to match.',
  'Earn a few inbound links (your channel, socials, game directories) — the strongest off-page ranking factor.',
];

function buildHTML() {
  let h = '<p class="seo-intro">Big Bad Wolf Saloon is a single-page HTML5 game. These on-page optimizations help search engines and social platforms <b>discover, understand and rank</b> it. Everything here is already live.</p>';
  for (const [title, items] of SECTIONS) {
    h += `<div class="seo-sec"><h4>${title}</h4><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul></div>`;
  }
  h += `<div class="seo-sec seo-next"><h4>To rank even higher (team to-do)</h4><ol>${NEXT_STEPS.map(i => `<li>${i}</li>`).join('')}</ol></div>`;
  return h;
}

const modal = document.getElementById('seo-modal');
const btnSeo = document.getElementById('btn-seo');
const btnClose = document.getElementById('btn-close-seo');
const contentEl = document.getElementById('seo-content');

if (modal && contentEl) {
  let built = false;
  const open = () => { if (!built) { contentEl.innerHTML = buildHTML(); built = true; } modal.classList.remove('hidden'); };
  const close = () => modal.classList.add('hidden');
  if (btnSeo) btnSeo.addEventListener('click', open);
  if (btnClose) btnClose.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
}
