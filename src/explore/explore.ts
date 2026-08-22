import { ipcRenderer } from 'electron';

// explore view: the full list behind a home page section (wishlist / feed /
// discover). main gathers every item for the section (paging where needed)
// and streams progress; cards render in chunks so huge lists stay smooth.
// cards share the home page's interactions: click-to-open blur + lottie,
// right-click context menu with spotlight, fullscreen cover art.

ipcRenderer.send('explore:log', 'booted');

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const grid = $('grid');

const TITLES: Record<string, string> = {
    wishlist: 'Wishlist',
    feed: 'Latest from your feed',
    discover: 'Discover',
};

function escapeHtml(s: string): string {
    return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

// lucide icons (inline so they inherit currentColor)
const MENU_ICON = 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const readIcon = (name: string): string => {
    try {
        const fs = require('fs');
        const path = require('path');
        return fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'icons', name), 'utf8')
            .replace(/width="24"/, 'width="15"')
            .replace(/height="24"/, 'height="15"')
            .replace(/stroke="#ffffff"/, 'stroke="currentColor"');
    } catch (e) { return ''; }
};
const ICON_OPEN = readIcon('open_album.svg');
const ICON_ART = readIcon('cover_art_fs.svg');
const ICON_QUEUE = '<svg viewBox="0 0 24 24" fill="none" ' + MENU_ICON + '><path d="M5 12h14"/><path d="M12 5v14"/></svg>';
const ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" ' + MENU_ICON + '><circle cx="10" cy="8" r="5"/><path d="M2 21a8 8 0 0 1 10.434-7.62"/><circle cx="18" cy="18" r="3"/><path d="m22 22-1.9-1.9"/></svg>';

interface Card {
    title: string;
    artist: string;
    art: string;
    url: string;
    year?: number;
    tralbumId?: string;
    tralbumType?: 'a' | 't';
    bandId?: string;
    trackId?: string;
}

function createCard(c: Card): HTMLElement {
    const card = document.createElement('div');
    card.className = 'card';
    card.title = c.title;
    const wrap = document.createElement('div');
    wrap.className = 'artwrap';
    wrap.innerHTML = `<img class="art" loading="lazy"${c.art ? ` src="${c.art}"` : ''}>`;
    if (c.tralbumId && c.bandId) {
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
    card.appendChild(wrap);
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML =
        `<div class="t">${escapeHtml(c.title || 'Untitled')}</div>` +
        `<div class="a">${escapeHtml(c.artist || '')}</div>` +
        (c.year ? `<div class="w">${c.year}</div>` : '');
    card.appendChild(meta);
    card.addEventListener('click', () => {
        if (!c.url) return;
        // cover blurs + lottie spins while main fetches the release
        startCardLoading(card);
        ipcRenderer.send('album:open', { url: c.url, artUrl: c.art, title: c.title });
    });
    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openCardMenu(e.clientX, e.clientY, card, c);
    });
    return card;
}

// --- click-to-open loading effect (same as home/collection) ------------------
let loadingCard: HTMLElement | null = null;
let cardSpinAnim: any = null;

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

// --- context menu + spotlight + fullscreen cover art -------------------------
type MenuItem = { icon?: string; label: string; onClick?: () => void };
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
        grid.classList.remove('dim');
        spotEl = null;
    }
}

let fsArtOpen = false;
function showArtFullscreen(src: string): void {
    if (!src) return;
    fsArtOpen = true;
    const hires = src.replace(/_\d+\.jpg$/, '_0.jpg');
    const back = document.createElement('div');
    back.className = 'fsback';
    back.innerHTML = `<img class="fsimg" src="${hires}">`;
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

function openCardMenu(x: number, y: number, source: HTMLElement, c: Card): void {
    closeCardMenu();
    spotEl = source;
    source.classList.add('spot');
    grid.classList.add('dim');
    const playable = !!(c.tralbumId && c.bandId);
    const items: MenuItem[] = [
        { icon: ICON_OPEN, label: 'Open album', onClick: () => { if (c.url) ipcRenderer.send('album:open', { url: c.url, artUrl: c.art, title: c.title }); } },
    ];
    if (playable) {
        items.push({ icon: ICON_QUEUE, label: 'Add album to queue', onClick: () => { void ipcRenderer.invoke('collection:enqueue', { tralbumId: c.tralbumId, tralbumType: c.tralbumType, bandId: c.bandId }); } });
    }
    if (c.art) items.push({ icon: ICON_ART, label: 'View cover art', onClick: () => showArtFullscreen(c.art) });
    const artist = (c.artist || '').trim();
    if (artist) items.push({ icon: ICON_SEARCH, label: 'Search ' + artist, onClick: () => ipcRenderer.send('search:run', { text: artist, mode: 'all' }) });
    const m = document.createElement('div');
    m.className = 'cmenu';
    m.innerHTML =
        `<div class="cmhead">${c.art ? `<img class="cmart" src="${c.art}">` : ''}` +
        `<div class="cmmeta"><div class="cmtitle">${escapeHtml(c.title || 'Untitled')}</div>` +
        `<div class="cmsub">${escapeHtml(c.artist || '')}</div></div></div>`;
    for (const it of items) {
        const b = document.createElement('button');
        b.className = 'cmi';
        if (it.icon) {
            b.innerHTML = it.icon;
            b.appendChild(document.createTextNode(it.label));
        } else {
            b.textContent = it.label;
        }
        b.addEventListener('click', (ev) => {
            ev.stopPropagation();
            closeCardMenu();
            if (it.onClick) it.onClick();
        });
        m.appendChild(b);
    }
    document.body.appendChild(m);
    m.style.left = Math.max(6, Math.min(x, window.innerWidth - 240)) + 'px';
    m.style.top = Math.max(6, Math.min(y, window.innerHeight - m.offsetHeight - 8)) + 'px';
    cardMenuEl = m;
    requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add('show')));
}
document.addEventListener('click', () => closeCardMenu());
document.addEventListener('wheel', () => closeCardMenu(), { passive: true });
document.addEventListener('contextmenu', (e) => {
    if (cardMenuEl && !cardMenuEl.contains(e.target as Node)) closeCardMenu();
});

// render in chunks so a few thousand nodes don't block one long task
async function renderAll(items: Card[]): Promise<void> {
    grid.innerHTML = '';
    const CHUNK = 100;
    for (let i = 0; i < items.length; i += CHUNK) {
        const frag = document.createDocumentFragment();
        for (const it of items.slice(i, i + CHUNK)) frag.appendChild(createCard(it));
        grid.appendChild(frag);
        await new Promise((r) => setTimeout(r, 0));
    }
}

async function load(mode: string): Promise<void> {
    $('xtitle').textContent = TITLES[mode] || 'Explore';
    $('xsub').textContent = '';
    grid.innerHTML = '<div class="state">loading…</div>';
    const res: any = await ipcRenderer.invoke('explore:list', mode).catch(() => null);
    if (!res || !res.ok) {
        grid.innerHTML = `<div class="state">${(res && res.error) || 'could not load.'} are you logged in on bandcamp?</div>`;
        return;
    }
    const items: Card[] = res.items || [];
    $('xsub').textContent = items.length ? `${items.length} albums` : '';
    if (!items.length) {
        grid.innerHTML = '<div class="state">nothing here yet.</div>';
        return;
    }
    await renderAll(items);
}

let mode = '';
ipcRenderer.on('explore:shown', (_e, m: unknown) => {
    mode = String(m || '');
    void load(mode);
});
ipcRenderer.on('explore:progress', (_e, n: unknown) => {
    $('xsub').textContent = `loading ${Number(n) || 0}…`;
    // keep the grid state line alive while nothing is rendered yet
    if (!grid.querySelector('.card')) {
        const st = grid.querySelector('.state');
        if (st) st.textContent = `loading ${Number(n) || 0} albums…`;
    }
});

$('back').addEventListener('click', () => ipcRenderer.send('explore:close'));
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (cardMenuEl || fsArtOpen) return; // menus/art handle their own Esc
    ipcRenderer.send('explore:close');
});
