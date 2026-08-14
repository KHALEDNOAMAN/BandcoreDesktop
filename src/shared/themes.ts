// theme system: a Theme carries the CSS-variable values for our own chrome
// views (header / player / settings / collection / feed / search / downloads /
// notice) plus the darkreader page scheme used on bandcamp pages.
//
// every vars[] value is injected as a `--<key>` custom property on :root of the
// chrome views with a user-origin stylesheet, so it overrides the views' own
// author-origin defaults without touching each view's script.
//
// 'light' keeps our chrome on the dark palette (bandcamp's pages are left
// native: no darkreader, no cloak — see themeForUrl in main).
export interface Theme {
    key: string;
    label: string;
    vars: Record<string, string>;
    pageBg: string;
    pageText: string;
}

// canonical palette (dark). every view's author CSS references only these vars.
const DARK_VARS: Record<string, string> = {
    'bg': '#181a1b',
    'titlebar': '#121415',
    'input': '#121415',
    'bar': '#1b1e1f',
    'panel': '#161819',
    'card': '#202325',
    'hover-bg': '#24282a',
    'line': '#2a2e30',
    'line-2': '#1e2224',
    'scroll': '#3a3f42',
    'text': '#e8e6e3',
    'text-2': '#cfcac2',
    'muted': '#9a968e',
    'sub': '#848079',
    'accent': '#1da0c3',
    'hover-text': '#ffffff',
};

export const THEMES: Theme[] = [
    { key: 'dark', label: 'Dark', vars: DARK_VARS, pageBg: '#181a1b', pageText: '#e8e6e3' },
    { key: 'light', label: 'Light (Bandcamp native)', vars: DARK_VARS, pageBg: '#ffffff', pageText: '#1a1a1a' },
];

export function themeByKey(key: unknown): Theme {
    const k = String(key ?? '');
    return THEMES.find((t) => t.key === k) || THEMES[0];
}