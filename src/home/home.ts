import { ipcRenderer } from 'electron';

// home page: a spotify-style start page (greeting, stats, and four horizontal
// rails: recently collected, wishlist, your feed, and bandcamp discover). local
// rails come from home:data instantly; the network rails (home:rails) are
// cached in main. each rail plays/navigates like the feed view.

ipcRenderer.send('home:log', 'booted');

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const statsEl = $('stats');
const recentRow = $('recent');
const wishRow = $('wish');
const feedRow = $('feed');
const discoverRow = $('discover');

function escapeHtml(s: string): string {
    return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

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
}

function createCard(c: HomeCard): HTMLElement {
    const card = document.createElement('div');
    card.className = 'card';
    card.title = c.title;

    const wrap = document.createElement('div');
    wrap.className = 'artwrap';
    wrap.innerHTML = `<img class="art" loading="lazy"${c.art ? ` src="${c.art}"` : ''}>`;

    // play / queue only when the item carries resolver handles (feed + owned
    // items); discover rows without them just navigate on click.
    const playable = !!(c.tralbumId && c.bandId);
    if (playable) {
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
        enq.textContent = '+';
        enq.addEventListener('click', async (e) => {
            e.stopPropagation();
            const prev = enq.textContent;
            const res = await ipcRenderer.invoke('collection:enqueue', { tralbumId: c.tralbumId, tralbumType: c.tralbumType, bandId: c.bandId });
            enq.textContent = res && res.ok ? '✓' : '×';
            setTimeout(() => { enq.textContent = prev; }, 900);
        });
        wrap.appendChild(enq);
    }
    card.appendChild(wrap);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML =
        `<div class="t">${escapeHtml(c.title || 'Untitled')}</div>` +
        `<div class="a">${escapeHtml(c.artist || '')}</div>` +
        (c.year ? `<div class="w">${c.year}</div>` : '') +
        (c.via ? `<div class="w">collected by ${escapeHtml(c.via)}</div>` : '');
    card.appendChild(meta);

    card.addEventListener('click', () => { if (c.url) ipcRenderer.send('album:open', { url: c.url, artUrl: c.art, title: c.title }); });
    return card;
}

function fillRow(row: HTMLElement, sub: HTMLElement, items: HomeCard[], note: string): void {
    sub.textContent = note;
    const rail = row.closest('.rail') as HTMLElement | null;
    const navs = rail ? rail.querySelectorAll('.navbtn') : [];
    if (!items.length) {
        row.innerHTML = `<div class="state">${note || 'nothing here yet.'}</div>`;
        navs.forEach((b) => { (b as HTMLElement).style.display = 'none'; });
        return;
    }
    navs.forEach((b) => { (b as HTMLElement).style.display = ''; });
    const frag = document.createDocumentFragment();
    for (const it of items) frag.appendChild(createCard(it));
    row.innerHTML = '';
    row.appendChild(frag);
}

// circular rail nav: each click steps the rail by 5 cards (132px card + 14px gap)
// native smooth scrollBy is a no-op in this Electron, so animate it manually
const RAIL_STEP = 5 * (132 + 14);
function stepRow(row: HTMLElement, dist: number): void {
    const from = row.scrollLeft;
    const max = Math.max(0, row.scrollWidth - row.clientWidth);
    const to = Math.max(0, Math.min(max, from + dist));
    if (to === from) return;
    const t0 = performance.now();
    const dur = 280;
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now: number) => {
        const k = Math.min(1, (now - t0) / dur);
        row.scrollLeft = from + (to - from) * ease(k);
        if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}
function wireRailNav(row: HTMLElement, prevId: string, nextId: string): void {
    $(prevId).addEventListener('click', () => stepRow(row, -RAIL_STEP));
    $(nextId).addEventListener('click', () => stepRow(row, RAIL_STEP));
}
wireRailNav(recentRow, 'recent-prev', 'recent-next');
wireRailNav(wishRow, 'wish-prev', 'wish-next');
wireRailNav(feedRow, 'feed-prev', 'feed-next');
wireRailNav(discoverRow, 'discover-prev', 'discover-next');

// the wishlist rail pages on scroll: near the end, ask main for the next page
// (continuation token lives there) and append the cards.
let wishMoreBusy = false;
wishRow.addEventListener('scroll', async () => {
    if (wishMoreBusy) return;
    if (wishRow.scrollLeft + wishRow.clientWidth < wishRow.scrollWidth - 400) return;
    wishMoreBusy = true;
    try {
        const res: any = await ipcRenderer.invoke('home:wishlist-more').catch(() => null);
        if (res && res.items && res.items.length) {
            const frag = document.createDocumentFragment();
            for (const it of res.items) frag.appendChild(createCard(it));
            wishRow.appendChild(frag);
        }
    } finally {
        wishMoreBusy = false;
    }
});

async function loadHome(): Promise<void> {
    // part 1: local-only data (stats + recently collected) - renders instantly
    const res: any = await ipcRenderer.invoke('home:data').catch(() => null);
    if (!res) { fillRow(recentRow, $('recent-sub'), [], 'could not load.'); return; }
    const st = res.stats || {};
    statsEl.innerHTML = [
        `<span class="stat"><b>${st.owned || 0}</b> collected</span>`,
        `<span class="stat"><b>${st.wishlist || 0}</b> wishlist</span>`,
        `<span class="stat"><b>${st.local || 0}</b> local files</span>`,
        `<span class="stat"><b>${st.playlists || 0}</b> playlists</span>`,
    ].join('');
    const recentItems = res.recent || [];
    // the recently-collected rail only appears when there's something in it
    $('rail-recent').style.display = recentItems.length ? '' : 'none';
    fillRow(recentRow, $('recent-sub'), recentItems, '');
    const wishItems = res.wish || [];
    // same for the wishlist rail
    $('rail-wish').style.display = wishItems.length ? '' : 'none';
    fillRow(wishRow, $('wish-sub'), wishItems, '');

    // part 2: network rails (feed + discover) - each fills in as it arrives
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
            fillRow(recentRow, $('recent-sub'), rails.recent, '');
        }
        if (rails.wish) {
            $('rail-wish').style.display = rails.wish.length ? '' : 'none';
            fillRow(wishRow, $('wish-sub'), rails.wish, '');
        }
        fillRow(feedRow, $('feed-sub'), rails.feed || [], rails.feedError || (rails.feed && rails.feed.length ? '' : 'follow some artists to see their releases.'));
        fillRow(discoverRow, $('discover-sub'), rails.discover || [], rails.discoverError || (rails.discover && rails.discover.length ? '' : 'discover is empty right now.'));
    } else {
        fillRow(feedRow, $('feed-sub'), [], 'could not load the feed.');
        fillRow(discoverRow, $('discover-sub'), [], 'could not load discover.');
    }
}

$('close').addEventListener('click', () => ipcRenderer.send('home:close'));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ipcRenderer.send('home:close'); });

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