import { ipcRenderer } from 'electron';

// anti-flash + hide bandcamp's own audio bars (our player is the only transport).
// in DARK mode we cloak the body until darkreader paints (avoids a white flash);
// in LIGHT mode we must NOT do that (darkreader never runs, so the body would stay
// hidden and the whole page shows blank grey). theme is read synchronously so the
// right cloak applies at document-start.
let bcTheme = 'dark';
try { bcTheme = (ipcRenderer.sendSync('app:theme-for', location.href) as string) || 'dark'; } catch (e) { /* default dark */ }
const antiFlashStyle = document.createElement('style');
antiFlashStyle.textContent = (bcTheme === 'light'
    ? ''
    : `html { background-color: #181a1b !important; }
       html:not([data-darkreader-scheme="dark"]) body { opacity: 0 !important; }`)
    // keep the release-page .inline_player fully visible (people like it): it is
    // kept alive by mirroring OUR player's state into it (see page:now-playing).
    + `\n#collection-player, .floating-player { display: none !important; }`;
const antiFlashRoot = document.head || document.documentElement;
if (antiFlashRoot) antiFlashRoot.appendChild(antiFlashStyle);
else document.addEventListener('DOMContentLoaded', () => (document.head || document.documentElement).appendChild(antiFlashStyle));

// failsafe: if darkreader never paints (script error, throttled subresources),
// the cloak used to leave the page an empty grey forever. lift it after a few
// seconds — worst case is a brief unthemed flash instead of a hang.
if (bcTheme !== 'light') {
    setTimeout(() => {
        try {
            if (!document.documentElement.getAttribute('data-darkreader-scheme')) {
                antiFlashStyle.textContent = antiFlashStyle.textContent.replace('opacity: 0 !important', 'opacity: 1');
            }
        } catch (e) { /* keep cloak */ }
    }, 6000);
}

// mirror discover grid (/api/discover/1/discover_web) into window.__bcrpc.discover so extractor resolves genre page play to full album w/out track -> album lookup. injected as main world script at document start (csp stripped) before page grabs fetch. passive read of resp clone
const CAPTURE_SRC = `
(function () {
    if (window.__bcrpcCapture) return;
    window.__bcrpcCapture = true;
    window.__bcrpc = window.__bcrpc || { tralbum: {}, trackAlbum: {}, discover: {} };
    if (!window.__bcrpc.discover) window.__bcrpc.discover = {};
    var STORE = window.__bcrpc.discover;

    function toId(v) { if (v == null) return ''; var m = String(v).match(/\\d+/); return m ? m[0] : ''; }
    function artFromId(id) { id = toId(id); return id ? 'https://f4.bcbits.com/img/a' + id + '_10.jpg' : ''; }
    function streamOf(file) {
        if (!file) return '';
        if (typeof file === 'string') return file;
        if (typeof file === 'object') { return file['mp3-128'] || file['mp3-v0'] || file['mp3-320'] || ''; }
        return '';
    }
    function trackFromStream(u) {
        try {
            var url = new URL(u, location.href);
            var q = toId(url.searchParams.get('track_id') || url.searchParams.get('id'));
            if (q) return q;
            var segs = url.pathname.split('/').filter(Boolean);
            for (var i = segs.length - 1; i >= 0; i--) { if (/^\\d{4,}$/.test(segs[i])) return segs[i]; }
        } catch (e) {}
        return '';
    }
    function ingest(json) {
        try {
            var results = (json && (json.results || (json.discovery && json.discovery.results))) || [];
            for (var i = 0; i < results.length; i++) {
                var it = results[i];
                if (!it || typeof it !== 'object') continue;
                var ft = it.featured_track || {};
                var streamUrl = streamOf(ft.stream_url || ft.streamUrl || ft.file);
                var trackId = toId(it.track_id) || toId(ft.track_id) || trackFromStream(streamUrl);
                if (!trackId) continue;
                STORE[trackId] = {
                    trackId: trackId,
                    bandId: toId(it.band_id) || toId(it.bandId) || toId(it.selling_band_id) || toId(ft.band_id),
                    tralbumId: toId(it.tralbum_id) || toId(it.tralbumId) || toId(it.item_id) || toId(it.id),
                    type: (function (x) { x = String(x || ''); return (x === 't' || x === 'track') ? 't' : 'a'; })(it.tralbum_type || it.tralbumType || it.item_type),
                    title: String(it.title || ft.title || '').trim(),
                    artist: String(it.artist || it.album_artist || it.band_name || ft.band_name || '').trim(),
                    album: String(it.album_title || it.albumTitle || it.release_title || '').trim(),
                    art: artFromId(it.art_id || it.item_art_id || ft.art_id),
                    url: String(it.item_url || it.tralbum_url || it.url || '').trim(),
                    streamUrl: streamUrl
                };
            }
        } catch (e) {}
    }
    function isDiscover(u) { return String(u || '').indexOf('/api/discover/1/discover_web') !== -1; }

    var of = window.fetch;
    if (of) {
        window.fetch = function () {
            var args = arguments, url = '';
            try { var r = args[0]; url = (r && typeof r === 'object' && 'url' in r) ? r.url : String(r || ''); } catch (e) {}
            return of.apply(window, args).then(function (res) {
                try { if (isDiscover(url) || isDiscover(res && res.url)) res.clone().json().then(ingest).catch(function () {}); } catch (e) {}
                return res;
            });
        };
    }
    var os = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
        try {
            this.addEventListener('load', function () {
                try { if (isDiscover(this.responseURL)) ingest(JSON.parse(this.responseText || '{}')); } catch (e) {}
            });
        } catch (e) {}
        return os.apply(this, arguments);
    };
})();
`;

function injectMainWorld(code: string): boolean {
    try {
        const root = document.head || document.documentElement;
        if (!root) return false;
        const s = document.createElement('script');
        s.textContent = code;
        root.appendChild(s);
        s.remove();
        return true;
    } catch (e) {
        return false;
    }
}

// inject moment html exists ahead of page own scripts
if (!injectMainWorld(CAPTURE_SRC)) {
    const obs = new MutationObserver(() => { if (injectMainWorld(CAPTURE_SRC)) obs.disconnect(); });
    obs.observe(document, { childList: true, subtree: true });
}

// tell main about real user gestures; acts only on audio trap following one so muted page player auto advance can't hijack queue. mousedown fires 1st
const sendGesture = () => { try { ipcRenderer.send('player:user-gesture'); } catch (e) {} };
document.addEventListener('mousedown', sendGesture, true);
document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'MediaPlayPause') sendGesture();
}, true);

// media hotkeys (soundcloud-style) from bandcamp pages: space play/pause,
// ←/→ scrub 5s (hold to keep scrubbing), shift+←/→ prev/next, shift+↑/↓ volume.
// mapped here (not in main) so typing in the page's inputs is never hijacked.
// NOTE: keep in sync with player.ts / collection.ts / header.html — this preload
// is sandboxed so the mapping can't live in a shared module.
const isTypingEl = (el: any): boolean => {
    if (!el || !el.tagName) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
};
const mediaHotkeyOf = (e: KeyboardEvent): string => {
    // bandcamp's header search lives in a web component: at the document
    // boundary the event RETARGETS to the shadow host, so e.target alone never
    // says INPUT and space fell through to play/pause while typing a query.
    // resolve the real element via composedPath + the shadow-piercing active
    // element, and bail if any of them is a typing surface.
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    const deep = (path.length ? path[0] : e.target) as HTMLElement | null;
    let ae: any = document.activeElement;
    while (ae && ae.shadowRoot && ae.shadowRoot.activeElement) ae = ae.shadowRoot.activeElement;
    if (isTypingEl(deep) || isTypingEl(ae) || isTypingEl(e.target)) return '';
    const tag = deep ? deep.tagName : '';
    const space = e.key === ' ' || e.code === 'Space';
    if (space && (tag === 'BUTTON' || (ae && ae.tagName === 'BUTTON'))) return '';
    if (space) return 'toggle';
    if (e.key === 'ArrowLeft') return e.shiftKey ? 'prev' : 'seek-back';
    if (e.key === 'ArrowRight') return e.shiftKey ? 'next' : 'seek-fwd';
    if (e.key === 'ArrowUp' && e.shiftKey) return 'vol-up';
    if (e.key === 'ArrowDown' && e.shiftKey) return 'vol-down';
    // bare digit = jump to that tenth of the track (soundcloud style: 5 -> 50%)
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key >= '0' && e.key <= '9') return 'seek-pct-' + e.key;
    return '';
};
document.addEventListener('keydown', (e) => {
    const cmd = mediaHotkeyOf(e);
    if (!cmd) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat && (cmd === 'toggle' || cmd === 'prev' || cmd === 'next')) return;
    try { ipcRenderer.send('player:hotkey', cmd); } catch (err) { /* bridge gone */ }
}, true);

// fan playlist page play buttons — header AND rows — are intercepted entirely.
// bandcamp's player preloads track 1 without a stream request, so the audio
// trap never saw header/first-row clicks (they looked dead) and its metadata
// fallback painted the page <title> into the player. every playlist button
// carries tracklistkey="playlist:<id>"; row buttons also carry trackindex.
// we suppress the native player (no double audio) and let main queue the
// page's data-blob directly at the clicked index.
document.addEventListener('click', (e) => {
    if (e.button !== 0) return;
    if (!/\/playlist\//.test(location.pathname)) return;
    const t = e.target as HTMLElement;
    const btn = t && t.closest ? t.closest('.play-pause-button[tracklistkey^="playlist"]') as HTMLElement | null : null;
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation(); // capture phase: bandcamp's own handlers never run
    const idx = parseInt(btn.getAttribute('trackindex') || '0', 10) || 0;
    ipcRenderer.send('app:playlist-play', idx);
}, true);

// mirror OUR playback onto the release page's inline player (play state,
// progress bar, elapsed/total time) so it works like the native one. only when
// the playing track belongs to THIS page (url match) — other releases' players
// are left alone. clicking its progress bar seeks our player.
const fmtClock = (x: number): string => Math.floor(x / 60) + ':' + String(Math.floor(x % 60)).padStart(2, '0');
ipcRenderer.on('page:now-playing', (_e, np: any) => {
    try {
        if (!np) return;
        const ip = document.querySelector('.inline_player') as HTMLElement | null;
        if (!ip) return;
        const norm = (u: string) => String(u || '').split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase();
        const page = norm(location.href);
        const track = norm(np.url);
        // album page match: the playing track's url is the release page url; track
        // pages of the same release also count (shared /album/ or /track/ root)
        const match = track && (track === page || track.startsWith(page + '/') || page.startsWith(track));
        if (!match) return;
        const btn = ip.querySelector('.playbutton');
        if (btn) btn.classList.toggle('playing', np.isPlaying === true);
        const dur = Number(np.duration) || 0;
        const frac = dur > 0 ? Math.min(1, Math.max(0, Number(np.position || 0) / dur)) : 0;
        const fill = ip.querySelector('.progbar_fill') as HTMLElement | null;
        if (fill) fill.style.width = (frac * 100).toFixed(2) + '%';
        const thumb = ip.querySelector('.thumb') as HTMLElement | null;
        const bar = ip.querySelector('.progbar_empty, .progbar') as HTMLElement | null;
        if (thumb && bar && bar.clientWidth > 0) {
            thumb.style.left = Math.max(0, Math.round(frac * (bar.clientWidth - thumb.clientWidth))) + 'px';
        }
        const el = ip.querySelector('.time_elapsed');
        if (el) el.textContent = fmtClock(Number(np.position) || 0);
        const tot = ip.querySelector('.time_total');
        if (tot && dur) tot.textContent = fmtClock(dur);
    } catch (e) { /* page layout changed; mirroring is best-effort */ }
});
// clicking the inline player's progress bar seeks OUR player to that fraction
document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const bar = t && t.closest ? (t.closest('.inline_player .progbar') as HTMLElement | null) : null;
    if (!bar) return;
    const r = bar.getBoundingClientRect();
    if (r.width <= 0) return;
    const frac = Math.min(1, Math.max(0, ((e as MouseEvent).clientX - r.left) / r.width));
    ipcRenderer.send('player:seek-frac', frac);
}, true);

// download button on release pages, placed next to the wishlist button under the
// cover art: owned releases jump to their bandcamp download page (all your
// formats, tracked in the downloads panel); unowned ones download the mp3-128
// streams (tagged, with cover) via the app.
function injectReleaseDownload(): void {
    try {
        if (!/\/(album|track)\//.test(location.pathname)) return;
        if (document.getElementById('bcrpc-dlbtn')) return;
        const blobEl = document.querySelector('[data-tralbum]');
        if (!blobEl) return;
        let info: any = null;
        try { info = JSON.parse(blobEl.getAttribute('data-tralbum') || ''); } catch { return; }
        const tralbumId = String(info?.id || '');
        const type = (info?.item_type === 'track' || info?.item_type === 't') ? 't' : 'a';
        if (!tralbumId) return;
        ipcRenderer.invoke('release:download-info', { tralbumId, tralbumType: type }).then((res: any) => {
            if (document.getElementById('bcrpc-dlbtn')) return;
            const owned = !!(res && res.owned && res.downloadUrl);
            const label = owned ? 'Download (you own this)' : 'Download';
            const svg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 19h16" stroke-linecap="round"/></svg>';

            // same shell as bandcamp's own wishlist button (li.wishlist >
            // span.action.compound-button), inserted into the same UL so it picks
            // up the row's styling for free.
            const li = document.createElement('li');
            li.id = 'bcrpc-dl-item';
            li.className = 'wishlist';
            li.title = owned ? 'Open your download page (all formats)' : "Download this release's streams with tags & cover art";
            // fixed width so state label changes (Download / Starting / Downloading /
            // errors) never shift the other buttons in the justified row
            li.style.cssText = 'margin:0;padding:0;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;width:150px;overflow:hidden;';
            const sp = document.createElement('span');
            sp.id = 'bcrpc-dlbtn';
            sp.className = 'action compound-button';
            sp.style.cssText = 'display:inline-flex;align-items:center;gap:6px;cursor:pointer;';
            sp.innerHTML = svg + '<span class="collect-msg"><span><a>' + label + '</a></span></span>';
            const lblA = sp.querySelector('a') as HTMLElement | null;
            if (lblA) lblA.style.cssText = 'display:inline-block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            li.appendChild(sp);
            sp.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (owned) { location.href = res.downloadUrl; return; }
                const lbl = sp.querySelector('a') as HTMLElement | null;
                if (lbl) lbl.textContent = 'Starting';
                try {
                    const r = await ipcRenderer.invoke('download:release', { url: location.href.split(/[?#]/)[0] });
                    if (lbl) lbl.textContent = r && r.ok ? 'Downloading' : (r && r.error) ? r.error : 'Failed';
                } catch { if (lbl) lbl.textContent = 'Failed'; }
            });

            // modern pages: appends into the share-collect-controls UL right after
            // the wishlist li (id #collect-item), and justifies the button row
            // (share/embed + wishlist + download). legacy fallbacks: the plain
            // #wishlist element, then the area under the inline player.
            const collect = document.getElementById('collect-item');
            if (collect && collect.parentElement) {
                collect.parentElement.insertBefore(li, collect.nextSibling);
                // match the wishlist button's height exactly so the row sits on one Y
                const mh = (collect as HTMLElement).offsetHeight;
                if (mh) { li.style.height = mh + 'px'; sp.style.height = '100%'; }
                const ul = collect.parentElement as HTMLElement;
                ul.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';
                // zero-width bookkeeping siblings would otherwise count as flex
                // items and skew the justification
                for (const ch of Array.from(ul.children)) {
                    if (ch === collect || ch === li) continue;
                    if (ch.tagName === 'A' || (ch as HTMLElement).id === 'wishlist-alert') {
                        (ch as HTMLElement).style.cssText = 'flex:0 0 0;';
                    }
                }
            } else {
                const wl = document.getElementById('wishlist');
                if (wl) {
                    const host = (wl.closest && (wl.closest('.wishlist_wrap, .wishlist-wrap, #wishlist-wrap'))) || wl;
                    if (host.parentElement) {
                        const row = document.createElement('div');
                        row.style.cssText = 'display:flex;align-items:center;gap:8px;';
                        host.parentElement.insertBefore(row, host);
                        host.parentElement.removeChild(host);
                        row.appendChild(host);
                        row.appendChild(li);
                    }
                } else {
                    const anchor = (document.querySelector('.inline_player') || document.querySelector('#name-section') || document.querySelector('h2.trackTitle')) as HTMLElement | null;
                    if (anchor && anchor.parentElement) anchor.parentElement.insertBefore(li, anchor.nextSibling);
                }
            }
        }).catch(() => { /* no button */ });
    } catch (e) { /* page shape changed; button is best-effort */ }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectReleaseDownload);
else injectReleaseDownload();

// fan playlist pages get an import button (floating pill, page-shape agnostic):
// main fetches the page's data blob and mirrors it into the app's playlists.
// re-importing the same playlist updates it instead of duplicating.
function injectPlaylistImport(): void {
    try {
        // real playlist paths are /<username>/playlist/<slug>
        if (!/\/playlist\/[^/]+/.test(location.pathname)) return;
        if (document.getElementById('bcrpc-plimport')) return;
        const btn = document.createElement('button');
        btn.id = 'bcrpc-plimport';
        btn.type = 'button';
        const idle = '♫ Add to app playlists';
        btn.textContent = idle;
        btn.title = "Import this playlist into the collection view's playlists";
        btn.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483000;padding:9px 16px;font-size:13px;cursor:pointer;border:1px solid #1da0c3;border-radius:999px;background:#181a1b;color:#1da0c3;font-family:inherit;box-shadow:0 4px 16px rgba(0,0,0,.35);';
        btn.addEventListener('click', async () => {
            btn.textContent = '♫ importing…';
            try {
                const r: any = await ipcRenderer.invoke('playlists:import', location.href.split(/[?#]/)[0]);
                btn.textContent = r && r.ok
                    ? `♫ ${r.updated ? 'updated' : 'imported'} ✓ (${r.count} tracks)`
                    : '♫ ' + ((r && r.error) || 'failed');
            } catch { btn.textContent = '♫ failed'; }
            setTimeout(() => { btn.textContent = idle; }, 2600);
        });
        document.body.appendChild(btn);
    } catch { /* best effort */ }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectPlaylistImport);
else injectPlaylistImport();

// mouse back/forward -> main (debounced) so don't double w/ os app command
window.addEventListener('mouseup', (e) => {
    if (e.button === 3) ipcRenderer.send('app:back');
    if (e.button === 4) ipcRenderer.send('app:forward');
});

// middle click a link -> open in a new tab. handling it here (rather than relying
// on chromium's window-open disposition, which was inconsistent) reliably catches
// every anchor. preventDefault stops the native new-window from also firing.
document.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    const t = e.target as HTMLElement;
    const a = t && t.closest ? (t.closest('a[href]') as HTMLAnchorElement | null) : null;
    if (!a || !a.href) return;
    e.preventDefault();
    e.stopPropagation();
    ipcRenderer.send('app:open-tab', a.href);
}, true);

// shift+click an album/track link -> add that release to the queue instead of
// navigating. works anywhere on bandcamp (collection page, release pages, feeds).
document.addEventListener('click', (e) => {
    if (!e.shiftKey || e.button !== 0) return;
    const t = e.target as HTMLElement;
    const a = t && t.closest ? (t.closest('a[href]') as HTMLAnchorElement | null) : null;
    if (!a || !a.href || !/\/(album|track)\//.test(a.href)) return;
    e.preventDefault();
    e.stopPropagation();
    ipcRenderer.send('app:enqueue-url', a.href);
}, true);
