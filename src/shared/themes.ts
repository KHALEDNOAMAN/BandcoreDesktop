// theme system: a Theme carries the CSS-variable values for our own chrome
// views (header / player / settings / collection / feed / search / downloads /
// notice). bandcamp pages are always left native.
//
// every vars[] value is injected as a `--<key>` custom property on :root of the
// chrome views with a user-origin stylesheet, so it overrides the views' own
// author-origin defaults without touching each view's script.
export interface Theme {
    key: string;
    label: string;
    vars: Record<string, string>;
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
    { key: 'dark', label: 'Dark', vars: DARK_VARS },
    {
        key: 'light', label: 'Light',
        vars: {
            'bg': '#f4f3f0', 'titlebar': '#e7e5e0', 'input': '#ffffff', 'bar': '#ffffff',
            'panel': '#fcfcfa', 'card': '#ffffff', 'hover-bg': '#e9e7e2',
            'line': '#d8d5cd', 'line-2': '#e4e2dc', 'scroll': '#c4c0b6',
            'text': '#1c1b19', 'text-2': '#3d3b36', 'muted': '#6f6a60', 'sub': '#8a857b',
            'accent': '#0e7fa3', 'hover-text': '#000000',
        },
    },
    {
        key: 'amoled', label: 'AMOLED',
        vars: {
            'bg': '#000000', 'titlebar': '#000000', 'input': '#0c0c0c', 'bar': '#000000',
            'panel': '#000000', 'card': '#121212', 'hover-bg': '#1a1a1a',
            'line': '#222222', 'line-2': '#161616', 'scroll': '#262626',
            'text': '#e8e6e3', 'text-2': '#c9c9c9', 'muted': '#8f8f8f', 'sub': '#757575',
            'accent': '#1da0c3', 'hover-text': '#ffffff',
        },
    },
    {
        key: 'forest', label: 'Forest',
        vars: {
            'bg': '#0d1512', 'titlebar': '#0a100c', 'input': '#0d1612', 'bar': '#111b16',
            'panel': '#0b120e', 'card': '#15211a', 'hover-bg': '#1b2a22',
            'line': '#24382d', 'line-2': '#1a2b22', 'scroll': '#2c4437',
            'text': '#d6e5d9', 'text-2': '#b7c9bd', 'muted': '#90a795', 'sub': '#6f8677',
            'accent': '#4ec978', 'hover-text': '#ffffff',
        },
    },
    {
        key: 'catppuccin', label: 'Catppuccin (Mocha)',
        vars: {
            'bg': '#1e1e2e', 'titlebar': '#181825', 'input': '#26263a', 'bar': '#2a2a3e',
            'panel': '#1f1f30', 'card': '#313244', 'hover-bg': '#313244',
            'line': '#45475a', 'line-2': '#2f2f44', 'scroll': '#565b76',
            'text': '#cdd6f4', 'text-2': '#bac2de', 'muted': '#a6adc8', 'sub': '#7f849c',
            'accent': '#89b4fa', 'hover-text': '#ffffff',
        },
    },
    {
        key: 'dracula', label: 'Dracula',
        vars: {
            'bg': '#282a36', 'titlebar': '#21222c', 'input': '#333547', 'bar': '#2d2f3d',
            'panel': '#232530', 'card': '#343746', 'hover-bg': '#3a3d52',
            'line': '#44475a', 'line-2': '#2f3242', 'scroll': '#4c5065',
            'text': '#f8f8f2', 'text-2': '#d8d8d0', 'muted': '#9aa0b8', 'sub': '#6272a4',
            'accent': '#bd93f9', 'hover-text': '#ffffff',
        },
    },
];

export function themeByKey(key: unknown): Theme {
    const k = String(key ?? '');
    return THEMES.find((t) => t.key === k) || THEMES[0];
}
