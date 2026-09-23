/**
 * JCW visual extension v1. Presentation only; no Firebase initialization,
 * auth/session changes, network requests, trades, inventory, or payment writes.
 * Import this into the EXISTING site renderer. Keep the existing handlers.
 */
const assetRoot = new URL('./assets/', import.meta.url);
const frameURL = new URL('../card-frame.webp', import.meta.url).href;
const logoURL = new URL('../jcw-logo.webp', import.meta.url).href;
const asset = name => new URL(name, assetRoot).href;
const rarityLabels = new Set(['Common', 'Uncommon', 'Rare', 'Very Rare']);
const finishes = new Set(['Standard', 'Holo Foil', 'Prismatic Foil', 'Gold Foil']);

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
}

function image(src, className) {
  const parsed = new URL(src, document.baseURI);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Use a web image URL or a relative asset path.');
  const img = element('img', className);
  img.src = parsed.href; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
  return img;
}

function surface(styleText, label) {
  const host = element('span');
  host.style.cssText = 'display:block;width:100%;pointer-events:none;';
  host.setAttribute('role', 'img'); host.setAttribute('aria-label', label);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = element('style', '', styleText);
  shadow.append(style);
  return { host, shadow };
}

const cardCSS = `
 :host{display:block;container-type:inline-size;color:#fff;font-family:Arial,Helvetica,sans-serif}
 *{box-sizing:border-box} .card{position:relative;aspect-ratio:1054/1492;overflow:hidden;border-radius:2.5%;isolation:isolate;background:#080808;box-shadow:0 10px 28px #0009}
 img{position:absolute;object-fit:cover}.frame{inset:0;width:100%;height:100%}
 .photo{left:6.7%;top:19.3%;width:86.2%;height:42.1%;background:#080808}
 .name{position:absolute;left:19%;top:62.9%;width:70%;height:6.3%;display:grid;place-items:center;background:#030303;text-align:center;font:bold 7cqw/1 Impact,'Arial Narrow',sans-serif;text-transform:uppercase;padding:0 2%;overflow:hidden}
 .name{white-space:nowrap}.name.long{font-size:5.4cqw}.name.xlong{font-size:4.3cqw}.lore{position:absolute;left:10%;right:9%;top:72.4%;height:12%;background:#030303;display:flex;flex-direction:column;justify-content:center;text-align:center;padding:1% 3%;overflow:hidden}
 .lore small{color:#fa7cd1;font:3cqw/1.2 monospace;letter-spacing:.1em}.lore p{font:5.4cqw/1.15 Impact,'Arial Narrow',sans-serif;margin:3% 0 0;color:#f3e5f4}.lore.fact p{font:4cqw/1.2 Arial,sans-serif}
 .edition{position:absolute;left:7.8%;right:7.9%;top:88.7%;bottom:3.8%;padding:0 6%;background:#030303;display:flex;align-items:center;justify-content:space-between;gap:5%;font:3.5cqw/1.3 monospace;color:#eee}.edition b{color:#c1ff48;text-align:right}
 .holo{position:absolute;inset:18.4% 5.3% 2.7%;pointer-events:none;opacity:.23;mix-blend-mode:screen;background:repeating-linear-gradient(125deg,transparent 0%,#53ddff 9%,#ff5fdf 15%,#fdff79 22%,transparent 36%);background-size:350% 350%;animation:shine 6s ease-in-out infinite alternate}
 .gold .holo{background-image:repeating-linear-gradient(125deg,transparent 0%,#ffc45d 12%,transparent 25%,#fff8b8 32%,transparent 45%);opacity:.3}.standard .holo{display:none}.foil{box-shadow:0 0 0 1px #ec69ea66,0 0 26px #d64de52a}.gold{box-shadow:0 0 0 1px #ffe16c99,0 0 28px #ffc02f3b}
 @keyframes shine{from{background-position:0% 20%}to{background-position:100% 80%}}
 @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

/** Values must come from the site's authoritative existing card record.
 * serial/cap are OPTIONAL: leave them out for a count-based inventory.
 * Never derive identity, rarity, ownership, or edition caps from artwork.
 */
export function createCardFace(card) {
  if (!card || !card.name || !card.image) throw new Error('A card name and image are required.');
  if (!rarityLabels.has(card.rarity) || !finishes.has(card.finish)) throw new Error('Map the existing rarity and finish explicitly.');
  if (card.serial != null && (!Number.isInteger(card.serial) || card.serial < 1)) throw new Error('Invalid serial.');
  if (card.cap != null && (!Number.isInteger(card.cap) || card.cap < 1 || (card.serial != null && card.serial > card.cap))) throw new Error('Invalid edition cap.');
  const { host, shadow } = surface(cardCSS, `${card.name}, ${card.rarity}, ${card.finish}`);
  const face = element('span', `card ${card.finish === 'Standard' ? 'standard' : card.finish === 'Gold Foil' ? 'foil gold' : 'foil'}`);
  face.style.display = 'block';
  const photo = image(card.image, 'photo');
  photo.style.objectPosition = card.position || '50% 50%';
  photo.style.objectFit = card.contain ? 'contain' : 'cover';
  const lore = element('span', `lore${card.fact ? ' fact' : ''}`);
  lore.append(element('small', '', card.fact ? 'LUNACY FILES' : 'COLLECTOR PHRASE'), element('p', '', card.fact || card.phrase || ''));
  const edition = element('span', 'edition');
  edition.append(element('span', '', card.editionLabel || card.rarity), element('b', '', card.serial != null ? `#${card.serial}${card.cap ? ' / ' + card.cap : ''}` : card.finish));
  face.append(image(frameURL, 'frame'), photo, element('span', `name${card.name.length > 23 ? ' xlong' : card.name.length > 15 ? ' long' : ''}`, card.name), lore, edition, element('span', 'holo'));
  shadow.append(face);
  return host;
}

/** Replace ONLY the artwork slot, never the trade button/card container.
 * The slot and surrounding handlers, data IDs and eligibility stay intact.
 */
export function enhanceCard(artSlot, card) {
  if (!(artSlot instanceof Element)) throw new Error('Pass the existing artwork slot.');
  const face = createCardFace(card);
  artSlot.replaceChildren(face);
  return face;
}

export function createCardBack() {
  const { host, shadow } = surface(`:host{display:block}*{box-sizing:border-box}.back{position:relative;display:block;aspect-ratio:1054/1492;overflow:hidden;border-radius:2.5%;background:#080808}.art{width:100%;height:100%;object-fit:cover}.logo{position:absolute;left:15%;width:70%;top:30%;filter:drop-shadow(0 4px 8px #000)}`, 'JCW Lunacy card back');
  const back = element('span', 'back');
  back.append(image(asset('card-back.webp'), 'art'), image(logoURL, 'logo'));
  shadow.append(back);
  return host;
}

export function createPackArtwork({ name, tone = 'lime' }) {
  if (!name) throw new Error('Use the existing pack product name.');
  if (!['lime','pink','gold'].includes(tone)) throw new Error('Unknown pack tone.');
  const { host, shadow } = surface(`:host{display:block;container-type:inline-size}.pack{position:relative;display:block;aspect-ratio:2/3;background:#050507}.wrapper{width:100%;height:100%;object-fit:contain}.pink .wrapper{filter:hue-rotate(290deg)}.gold .wrapper{filter:sepia(.85) saturate(1.4)}.label{position:absolute;inset:26% 15% 25%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#eeffc5;text-shadow:0 3px 7px #000}.label img{width:100%;margin-bottom:12%}.label strong{font:italic 11cqw/1 Impact,'Arial Narrow',sans-serif;text-transform:uppercase}`, name);
  const pack = element('span', `pack ${tone}`), label = element('span', 'label');
  label.append(image(logoURL, ''), element('strong', '', name));
  pack.append(image(asset('booster.webp'), 'wrapper'), label); shadow.append(pack);
  return host;
}

/** Call AFTER the existing pack service confirms its real contents.
 * Does not open a pack or grant anything. Returns an early-cleanup function.
 * Target should be a positioned artwork slot; no global styles are changed.
 */
export function playFoilBurst(target, { gold = false } = {}) {
  if (!(target instanceof Element)) throw new Error('Pass the reveal artwork slot.');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const { host, shadow } = surface(`:host{position:absolute;inset:0;z-index:5;overflow:hidden;pointer-events:none}.burst{position:absolute;width:140%;aspect-ratio:1;left:-20%;top:12%;mix-blend-mode:screen;background-image:url('${asset('foil-burst.webp')}');background-size:800% 100%;animation:burst .95s steps(7,end) 1 forwards;${gold ? 'filter:sepia(.9) saturate(2);' : ''}}@keyframes burst{0%{background-position:0 0;opacity:0}8%{opacity:.85}88%{opacity:.85}100%{background-position:100% 0;opacity:0}}`, '');
  host.removeAttribute('role'); host.setAttribute('aria-hidden','true');
  shadow.append(element('span','burst')); target.append(host);
  const timer = window.setTimeout(() => host.remove(), 1050);
  return () => { window.clearTimeout(timer); host.remove(); };
}
