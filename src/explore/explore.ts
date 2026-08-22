import { ipcRenderer } from 'electron';

// explore view: the full list behind a home page section (wishlist / feed /
// discover). main gathers every item for the section (paging where needed)
// and reports progress; cards render in chunks so huge lists stay smooth.

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
        (c.year ? `<div class="w">${c.year}</div>` : '');
    card.appendChild(meta);
    card.addEventListener('click', () => { if (c.url) ipcRenderer.send('album:open', { url: c.url, artUrl: c.art, title: c.title }); });
    return card;
}

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
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ipcRenderer.send('explore:close'); });
