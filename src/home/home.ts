import { ipcRenderer } from 'electron';

// home page: a spotify-style start page. "jump back in" renders shortcut tiles,
// wishlist/feed/discover render shelves - each section with its own card
// design. local data (home:data) renders instantly; network rails (home:rails)
// are disk-cached in main so startup is instant. big lists render capped (60
// cards) and append client-side as you scroll near a shelf's end.

ipcRenderer.send('home:log', 'booted');

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const recentGrid = $('recent');
const wishRow = $('wish');
const feedRow = $('feed');
const discoverRow = $('discover');

function escapeHtml(s: string): string {
    return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

// lucide icons (inline so they inherit currentColor)
const ICON_QUEUE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';

// time-of-day greeting, like the big start-page headers
const hr = new Date().getHours();
$('hello').innerHTML =
    (hr < 5 ? 'Up late' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') +
    '<small>Bandcore</small>';

interface HomeCard {
    title: string;
    artist: string;
    art: string;
    url: string;
    tralbumId?: string;
    tralbumType?: 'a' | 't';
    bandId?: string;
    trackId?: string;
    via?: string;
    year?: number;
    /** epoch seconds when the story happened (feed only) */
    date?: number;
}

/** compact relative time for feed accents ("2h", "3d"). */
function relTime(epochSec?: number): string {
    if (!epochSec || epochSec <= 0) return '';
    const mins = Math.max(1, Math.round((Date.now() / 1000 - epochSec) / 60));
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

// shared play / enqueue buttons (only when the item carries resolver handles;
// discover rows without them just navigate on click)
function wireActions(wrap: HTMLElement, c: HomeCard): void {
    const playable = !!(c.tralbumId && c.bandId);
    if (!playable) return;
    const play = document.createElement('button');
    play.className = 'play';
    play.title = 'play';
    play.textContent = '▶';
    play.addEventListener('click', async (e) => {
        e.stopPropagation();
        await ipcRenderer.invoke('collection:play', { tralbumId: c.tralbumId, tralbumType: c.tralbumType, bandId: c.bandId, trackId: c.trackId || undefined });
    });
    wrap.appendChild(play);

    const enq = document.createElement('button');
    enq.className = 'enq';
    enq.title = 'add to queue';
    enq.innerHTML = ICON_QUEUE;
    enq.addEventListener('click', async (e) => {
        e.stopPropagation();
        const prev = enq.innerHTML;
        const res = await ipcRenderer.invoke('collection:enqueue', { tralbumId: c.tralbumId, tralbumType: c.tralbumType, bandId: c.bandId });
        enq.textContent = res && res.ok ? '✓' : '×';
        setTimeout(() => { enq.innerHTML = prev; }, 900);
    });
    wrap.appendChild(enq);
}

function baseCard(c: HomeCard): HTMLElement {
    const el = document.createElement('div');
    el.title = c.title;
    el.addEventListener('click', () => {
        if (!c.url) return;
        // cover blurs + lottie spins while main fetches the release
        startCardLoading(el);
        ipcRenderer.send('album:open', { url: c.url, artUrl: c.art, title: c.title });
    });
    // right-click context menu (ported from the collection view)
    el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openCardMenu(e.clientX, e.clientY, el, c);
    });
    return el;
}

// --- context menu (ported from the collection view) --------------------------
// a hand-built DOM menu with a header (cover + title/artist); while it is open
// the rest of the section dims and the source card is spotlit.
type MenuItem = { label: string; onClick?: () => void };
let cardMenuEl: HTMLElement | null = null;
let spotEl: HTMLElement | null = null;

function closeCardMenu(): void {
    if (cardMenuEl) {
        const m = cardMenuEl;
        cardMenuEl = null;
        m.classList.remove('show');
        setTimeout(() => m.remove(), 140);
    }
    if (spotEl) {
        spotEl.classList.remove('spot');
        const rail = document.querySelector('.rail.dim');
        if (rail) rail.classList.remove('dim');
        spotEl = null;
    }
}

// fullscreen cover art overlay ("View cover art")
let fsArtOpen = false;
function showArtFullscreen(src: string): void {
    if (!src) return;
    fsArtOpen = true;
    const back = document.createElement('div');
    back.className = 'fsback';
    back.innerHTML = `<img class="fsimg" src="${src}">`;
    const close = () => {
        back.classList.remove('show');
        setTimeout(() => { back.remove(); fsArtOpen = false; }, 180);
        document.removeEventListener('keydown', esc, true);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && fsArtOpen) { e.stopPropagation(); close(); } };
    back.addEventListener('click', close);
    document.addEventListener('keydown', esc, true);
    document.body.appendChild(back);
    requestAnimationFrame(() => requestAnimationFrame(() => back.classList.add('show')));
}

function openCardMenu(x: number, y: number, source: HTMLElement, c: HomeCard): void {
    closeCardMenu();
    spotEl = source;
    source.classList.add('spot');
    (source.closest('.rail') as HTMLElement | null)?.classList.add('dim');
    const playable = !!(c.tralbumId && c.bandId);
    const items: MenuItem[] = [
        { label: 'Open album', onClick: () => { if (c.url) ipcRenderer.send('album:open', { url: c.url, artUrl: c.art, title: c.title }); } },
    ];
    if (playable) {
        items.push({ label: 'Add album to queue', onClick: () => { void ipcRenderer.invoke('collection:enqueue', { tralbumId: c.tralbumId, tralbumType: c.tralbumType, bandId: c.bandId }); } });
    }
    if (c.art) items.push({ label: 'View cover art', onClick: () => showArtFullscreen(c.art) });
    const artist = (c.artist || '').trim();
    if (artist) items.push({ label: 'Search ' + artist, onClick: () => ipcRenderer.send('search:run', { text: artist, mode: 'all' }) });
    const m = document.createElement('div');
    m.className = 'cmenu';
    m.innerHTML =
        `<div class="cmhead">${c.art ? `<img class="cmart" src="${c.art}">` : ''}` +
        `<div class="cmmeta"><div class="cmtitle">${escapeHtml(c.title || 'Untitled')}</div>` +
        `<div class="cmsub">${escapeHtml(c.artist || '')}</div></div></div>`;
    for (const it of items) {
        const b = document.createElement('button');
        b.className = 'cmi';
        b.textContent = it.label;
        b.addEventListener('click', () => { closeCardMenu(); if (it.onClick) it.onClick(); });
        m.appendChild(b);
    }
    document.body.appendChild(m);
    m.style.left = Math.max(6, Math.min(x, window.innerWidth - 240)) + 'px';
    m.style.top = Math.max(6, Math.min(y, window.innerHeight - m.offsetHeight - 8)) + 'px';
    cardMenuEl = m;
    requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add('show')));
}
// global closers, like the collection's
document.addEventListener('click', () => closeCardMenu());
document.addEventListener('wheel', () => closeCardMenu(), { passive: true });
document.addEventListener('contextmenu', (e) => {
    if (cardMenuEl && !cardMenuEl.contains(e.target as Node)) closeCardMenu();
});

// --- click-to-open loading effect (ported from the collection view) ---------
// the clicked card's cover blurs and darkens (with a centered lottie) while
// main fetches the release; album:loading-done clears it on success/failure.
let loadingCard: HTMLElement | null = null;
let cardSpinAnim: any = null;

// a .lottie file is a zip: EOCD -> central directory -> local headers, with
// deflate entries (zlib) and stored ones passed through. manifest.json names
// the animation, which lives at animations/<id>.json.
function dotLottieToJson(buf: Buffer): any | null {
    try {
        const findSig = (from: number, to: number, sig: number): number => {
            for (let i = from; i >= to; i--) {
                if (buf.readUInt32LE(i) === sig) return i;
            }
            return -1;
        };
        const eocd = findSig(buf.length - 22, Math.max(0, buf.length - 65557), 0x06054b50);
        if (eocd < 0) return null;
        const count = buf.readUInt16LE(eocd + 10);
        const cdOff = buf.readUInt32LE(eocd + 16);
        const entries: { name: string; method: number; csize: number; lho: number }[] = [];
        let p = cdOff;
        for (let i = 0; i < count; i++) {
            if (buf.readUInt32LE(p) !== 0x02014b50) return null;
            const method = buf.readUInt16LE(p + 10);
            const csize = buf.readUInt32LE(p + 20);
            const lho = buf.readUInt32LE(p + 42);
            const nlen = buf.readUInt16LE(p + 28);
            const elen = buf.readUInt16LE(p + 30);
            const clen = buf.readUInt16LE(p + 32);
            entries.push({ name: buf.toString('utf8', p + 46, p + 46 + nlen), method, csize, lho });
            p += 46 + nlen + elen + clen;
        }
        const readFile = (name: string): Buffer | null => {
            const f = entries.find((x) => x.name === name);
            if (!f) return null;
            if (buf.readUInt32LE(f.lho) !== 0x04034b50) return null;
            const nlen = buf.readUInt16LE(f.lho + 26);
            const elen = buf.readUInt16LE(f.lho + 28);
            const data = buf.subarray(f.lho + 30 + nlen + elen, f.lho + 30 + nlen + elen + f.csize);
            if (f.method === 0) return data;
            if (f.method === 8) return require('zlib').inflateRawSync(data);
            return null;
        };
        const manifest = readFile('manifest.json');
        if (!manifest) return null;
        const m = JSON.parse(manifest.toString('utf8'));
        const id = m && m.animations && m.animations[0] && m.animations[0].id;
        if (!id) return null;
        const anim = readFile('animations/' + id + '.json');
        return anim ? JSON.parse(anim.toString('utf8')) : null;
    } catch (e) { return null; }
}
function startCardLoading(card: HTMLElement): void {
    clearCardLoading();
    loadingCard = card;
    card.classList.add('loading');
    const sp = document.createElement('div');
    sp.className = 'card-spin';
    // center on the ART, not the card (the card also holds the title/artist
    // text, which would pull the spinner below the cover's middle)
    const host = card.querySelector('.artwrap') || card;
    host.appendChild(sp);
    try {
        const fs = require('fs');
        const path = require('path');
        const dir = path.join(__dirname, '..', '..', 'assets', 'lottie');
        let animData: any = null;
        const lottiePath = path.join(dir, 'loading.lottie');
        const legacyPath = path.join(dir, 'loading.json');
        if (fs.existsSync(lottiePath)) animData = dotLottieToJson(fs.readFileSync(lottiePath));
        if (!animData && fs.existsSync(legacyPath)) animData = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
        cardSpinAnim = require('../../assets/lottie/lottie.min.js').loadAnimation({
            container: sp, renderer: 'svg', loop: true, autoplay: true,
            animationData: animData,
        });
    } catch (e) { cardSpinAnim = null; }
}
function clearCardLoading(): void {
    if (cardSpinAnim) { try { cardSpinAnim.destroy(); } catch (e) { /* already gone */ } cardSpinAnim = null; }
    if (!loadingCard) return;
    loadingCard.classList.remove('loading');
    const sp = loadingCard.querySelector('.card-spin');
    if (sp) sp.remove();
    loadingCard = null;
}
ipcRenderer.on('album:loading-done', () => clearCardLoading());

// "jump back in" wide shortcut tile - the artwork itself blurred as backdrop
function createTile(c: HomeCard): HTMLElement {
    const tile = baseCard(c);
    tile.className = 'tile';
    tile.innerHTML =
        (c.art ? `<img class="bgart" alt="" src="${c.art}">` : '') +
        `<img class="art" loading="lazy"${c.art ? ` src="${c.art}"` : ''}>` +
        `<div class="tt">` +
            `<div class="t">${escapeHtml(c.title || 'Untitled')}</div>` +
            `<div class="a">${escapeHtml(c.artist || '')}</div>` +
        `</div>`;
    wireActions(tile, c);
    return tile;
}

// standard shelf card (wishlist): cover on top, meta below
function createShelfCard(c: HomeCard): HTMLElement {
    const card = baseCard(c);
    card.className = 'card';
    const wrap = document.createElement('div');
    wrap.className = 'artwrap';
    wrap.innerHTML = `<img class="art" loading="lazy"${c.art ? ` src="${c.art}"` : ''}>`;
    wireActions(wrap, c);
    card.appendChild(wrap);
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML =
        `<div class="t">${escapeHtml(c.title || 'Untitled')}</div>` +
        `<div class="a">${escapeHtml(c.artist || '')}</div>` +
        (c.year ? `<div class="w">${c.year}</div>` : '');
    card.appendChild(meta);
    return card;
}

// feed variant: artist-forward with a relative-time accent
function createFeedCard(c: HomeCard): HTMLElement {
    const card = baseCard(c);
    card.className = 'card';
    const wrap = document.createElement('div');
    wrap.className = 'artwrap';
    wrap.innerHTML = `<img class="art" loading="lazy"${c.art ? ` src="${c.art}"` : ''}>`;
    wireActions(wrap, c);
    card.appendChild(wrap);
    const when = relTime(c.date);
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML =
        `<div class="who">${escapeHtml(c.title || 'Untitled')}${when ? `<span class="when" title="${when} ago">${when}</span>` : ''}</div>` +
        `<div class="what">${escapeHtml(c.artist || '')}</div>` +
        (c.via ? `<div class="via">collected by ${escapeHtml(c.via)}</div>` : '');
    card.appendChild(meta);
    return card;
}

// discover variant: editorial feature card, title overlaid on artwork gradient
function createFeatureCard(c: HomeCard): HTMLElement {
    const card = baseCard(c);
    card.className = 'card';
    const wrap = document.createElement('div');
    wrap.className = 'artwrap';
    wrap.innerHTML =
        `<img class="art" loading="lazy"${c.art ? ` src="${c.art}"` : ''}>` +
        `<div class="ovl">` +
            `<div class="t">${escapeHtml(c.title || 'Untitled')}</div>` +
            `<div class="a"><b>${escapeHtml(c.artist || '')}</b>${c.year ? ' · ' + c.year : ''}</div>` +
        `</div>`;
    wireActions(wrap, c);
    card.appendChild(wrap);
    return card;
}

// --- shelf rendering --------------------------------------------------------
// big lists stay smooth: render at most RENDER_CAP nodes per shelf, keep the
// rest here, append more as the user scrolls toward the end.
type Builder = (c: HomeCard) => HTMLElement;
const RENDER_CAP = 60;
const pending = new Map<HTMLElement, HomeCard[]>();

function stagger(row: HTMLElement): void {
    Array.from(row.children).slice(0, 12).forEach((el, i) => {
        (el as HTMLElement).style.animationDelay = `${i * 22}ms`;
    });
}

function updateEdges(rail: HTMLElement | null): void {
    if (!rail) return;
    const row = rail.querySelector('.row') as HTMLElement | null;
    const l = rail.querySelector('.edge.l') as HTMLElement | null;
    const r = rail.querySelector('.edge.r') as HTMLElement | null;
    const fl = rail.querySelector('.fade.l');
    const fr = rail.querySelector('.fade.r');
    if (!row || !l || !r) return;
    const max = row.scrollWidth - row.clientWidth;
    // smart state: hints only point where there really is more content
    const canL = row.scrollLeft > 4;
    const canR = max > 4 && row.scrollLeft < max - 4;
    l.classList.toggle('dim', !canL);
    r.classList.toggle('dim', !canR);
    fl?.classList.toggle('on', canL);
    fr?.classList.toggle('on', canR);
}

// re-render a shelf from scratch; items beyond the cap wait in `pending`
function fillRow(row: HTMLElement, subId: string, items: HomeCard[], note: string, build: Builder): void {
    $(subId).textContent = note;
    const rail = row.closest('.rail') as HTMLElement | null;
    if (!items.length) {
        row.innerHTML = `<div class="state">${note || 'nothing here yet.'}</div>`;
        pending.delete(row);
        updateEdges(rail);
        return;
    }
    const frag = document.createDocumentFragment();
    for (const it of items.slice(0, RENDER_CAP)) frag.appendChild(build(it));
    row.innerHTML = '';
    row.appendChild(frag);
    pending.set(row, items.slice(RENDER_CAP));
    stagger(row);
    updateEdges(rail);
}

// append the next client-side chunk when a shelf nears its end; returns true
// when buffered cards were added
function appendPending(row: HTMLElement): boolean {
    const left = pending.get(row);
    if (!left || !left.length) return false;
    const chunk = left.splice(0, RENDER_CAP);
    if (!left.length) pending.delete(row);
    const frag = document.createDocumentFragment();
    for (const it of chunk) frag.appendChild(createShelfCard(it));
    row.appendChild(frag);
    updateEdges(row.closest('.rail') as HTMLElement | null);
    return true;
}

// --- shelf navigation -------------------------------------------------------
// floating edge chevrons step by ~85% of the visible width. native smooth
// scrollBy is a no-op in this Electron, so animate manually.
function stepRow(row: HTMLElement, dir: number): void {
    const from = row.scrollLeft;
    const max = Math.max(0, row.scrollWidth - row.clientWidth);
    const to = Math.max(0, Math.min(max, from + dir * Math.round(row.clientWidth * 0.85)));
    if (to === from) return;
    const t0 = performance.now();
    const dur = 350;
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now: number) => {
        const k = Math.min(1, (now - t0) / dur);
        row.scrollLeft = from + (to - from) * ease(k);
        if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}
function wireRailNav(row: HTMLElement, prevId: string, nextId: string): void {
    $(prevId).addEventListener('click', () => stepRow(row, -1));
    $(nextId).addEventListener('click', () => stepRow(row, 1));
}
wireRailNav(wishRow, 'wish-prev', 'wish-next');
wireRailNav(feedRow, 'feed-prev', 'feed-next');
wireRailNav(discoverRow, 'discover-prev', 'discover-next');

// "Explore All" opens the full-section view for that shelf
for (const [id, mode] of [['wish-all', 'wishlist'], ['feed-all', 'feed'], ['discover-all', 'discover']] as const) {
    $(id).addEventListener('click', () => ipcRenderer.send('app:explore', mode));
}

// --- scroll-to-end loading ---------------------------------------------------
// wishlist pages through bandcamp (network continuation) once its client-side
// buffer is drained; the other shelves just append their buffer.
let wishMoreBusy = false;
async function onShelfScroll(row: HTMLElement): Promise<void> {
    if (row.scrollLeft + row.clientWidth < row.scrollWidth - 400) return;
    if (appendPending(row)) return;
    if (row !== wishRow || wishMoreBusy) return;
    wishMoreBusy = true;
    try {
        const res: any = await ipcRenderer.invoke('home:wishlist-more').catch(() => null);
        if (res && res.items && res.items.length) {
            const frag = document.createDocumentFragment();
            for (const it of res.items) frag.appendChild(createShelfCard(it));
            wishRow.appendChild(frag);
            updateEdges(wishRow.closest('.rail') as HTMLElement | null);
        }
    } finally {
        wishMoreBusy = false;
    }
}
for (const row of [wishRow, feedRow, discoverRow]) {
    row.addEventListener('scroll', () => {
        updateEdges(row.closest('.rail') as HTMLElement | null);
        void onShelfScroll(row);
    });
}
// overflow state changes with the window: re-evaluate the smart hints
window.addEventListener('resize', () => {
    for (const row of [wishRow, feedRow, discoverRow]) updateEdges(row.closest('.rail') as HTMLElement | null);
});

async function loadHome(): Promise<void> {
    // part 1: local-only data - renders instantly
    const res: any = await ipcRenderer.invoke('home:data').catch(() => null);
    if (!res) { fillRow(recentGrid, 'recent-sub', [], 'could not load.', createTile); return; }
    const recentItems = (res.recent || []).slice(0, 8); // tiles show a handful
    $('rail-recent').style.display = recentItems.length ? '' : 'none';
    fillRow(recentGrid, 'recent-sub', recentItems, '', createTile);
    const wishItems = res.wish || [];
    $('rail-wish').style.display = wishItems.length ? '' : 'none';
    fillRow(wishRow, 'wish-sub', wishItems, '', createShelfCard);

    // part 2: cached/network rails - each fills in as it arrives
    const rails: any = await ipcRenderer.invoke('home:rails').catch(() => null);
    ipcRenderer.send('home:log', 'rails ok=' + !!(rails && rails.feed) +
        ' feed=' + (rails && rails.feed ? rails.feed.length : 0) +
        ' discover=' + (rails && rails.discover ? rails.discover.length : 0) +
        (rails && (rails.feedError || rails.discoverError) ? ' err=' + (rails.feedError || rails.discoverError) : ''));
    if (rails) {
        // network rails land here when the store didn't have them yet (first
        // page each); the store-backed ones were already filled in part 1.
        if (rails.recent) {
            $('rail-recent').style.display = rails.recent.length ? '' : 'none';
            fillRow(recentGrid, 'recent-sub', rails.recent.slice(0, 8), '', createTile);
        }
        if (rails.wish) {
            $('rail-wish').style.display = rails.wish.length ? '' : 'none';
            fillRow(wishRow, 'wish-sub', rails.wish, '', createShelfCard);
        }
        fillRow(feedRow, 'feed-sub', rails.feed || [], rails.feedError || (rails.feed && rails.feed.length ? '' : 'follow some artists to see their releases.'), createFeedCard);
        fillRow(discoverRow, 'discover-sub', rails.discover || [], rails.discoverError || (rails.discover && rails.discover.length ? '' : 'discover is empty right now.'), createFeatureCard);
    } else {
        fillRow(feedRow, 'feed-sub', [], 'could not load the feed.', createFeedCard);
        fillRow(discoverRow, 'discover-sub', [], 'could not load discover.', createFeatureCard);
    }
}

$('close').addEventListener('click', () => ipcRenderer.send('home:close'));
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (cardMenuEl) { closeCardMenu(); return; }  // Esc closes the menu first
    if (fsArtOpen) return;                         // fullscreen art handles its own Esc
    ipcRenderer.send('home:close');
});

ipcRenderer.on('home:shown', () => loadHome());
ipcRenderer.on('home:load', () => loadHome());

// global tooltips setting: strip/restore title attributes live
let tooltipsOn = true;
const applyTooltips = (): void => {
    document.querySelectorAll('[title]').forEach((el) => {
        if (tooltipsOn) {
            const t = el.getAttribute('data-tip');
            if (t != null && !el.hasAttribute('title')) el.setAttribute('title', t);
        } else {
            el.setAttribute('data-tip', el.getAttribute('title') || '');
            el.removeAttribute('title');
        }
    });
};
ipcRenderer.on('chrome:tooltips', (_e, on: unknown) => { tooltipsOn = on === true; applyTooltips(); });
ipcRenderer.invoke('settings:get').then((s: any) => { tooltipsOn = (s && s.tooltips) !== false; applyTooltips(); }).catch(() => {});
new MutationObserver((muts) => {
    const hit = muts.some((m) =>
        (m.type === 'attributes' && m.attributeName === 'title') ||
        (m.type === 'childList' && Array.from(m.addedNodes).some((n) => n.nodeType === 1 && !!(n as Element).querySelectorAll && (n as Element).querySelectorAll('[title]').length))
    );
    if (hit) applyTooltips();
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
