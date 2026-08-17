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
    {
        key: 'nord', label: 'Nord',
        vars: {
            'bg': '#2e3440', 'titlebar': '#272c38', 'input': '#333a49', 'bar': '#2e3440',
            'panel': '#272c38', 'card': '#3b4252', 'hover-bg': '#434c5e',
            'line': '#4c566a', 'line-2': '#333a49', 'scroll': '#5e6880',
            'text': '#eceff4', 'text-2': '#d8dee9', 'muted': '#9aa5b8', 'sub': '#7b8496',
            'accent': '#88c0d0', 'hover-text': '#eceff4',
        },
    },
    {
        key: 'gruvbox', label: 'Gruvbox',
        vars: {
            'bg': '#282828', 'titlebar': '#1d2021', 'input': '#1d2021', 'bar': '#282828',
            'panel': '#1d2021', 'card': '#32302f', 'hover-bg': '#3c3836',
            'line': '#504945', 'line-2': '#32302f', 'scroll': '#665c54',
            'text': '#ebdbb2', 'text-2': '#d5c4a1', 'muted': '#a89984', 'sub': '#928374',
            'accent': '#d79921', 'hover-text': '#ebdbb2',
        },
    },
    {
        key: 'tokyonight', label: 'Tokyo Night',
        vars: {
            'bg': '#1a1b26', 'titlebar': '#16161e', 'input': '#1a1b26', 'bar': '#1a1b26',
            'panel': '#16161e', 'card': '#24283b', 'hover-bg': '#292e42',
            'line': '#3b4261', 'line-2': '#232740', 'scroll': '#4c5470',
            'text': '#c0caf5', 'text-2': '#a9b1d6', 'muted': '#787c99', 'sub': '#565f89',
            'accent': '#7aa2f7', 'hover-text': '#c0caf5',
        },
    },
    {
        key: 'onedark', label: 'One Dark',
        vars: {
            'bg': '#282c34', 'titlebar': '#21252b', 'input': '#21252b', 'bar': '#2c313a',
            'panel': '#21252b', 'card': '#2f343d', 'hover-bg': '#353b45',
            'line': '#3e4451', 'line-2': '#2c313a', 'scroll': '#4b5263',
            'text': '#abb2bf', 'text-2': '#9da5b4', 'muted': '#828997', 'sub': '#5c6370',
            'accent': '#61afef', 'hover-text': '#abb2bf',
        },
    },
    {
        key: 'solarized', label: 'Solarized Dark',
        vars: {
            'bg': '#002b36', 'titlebar': '#001e26', 'input': '#073642', 'bar': '#073642',
            'panel': '#002b36', 'card': '#073642', 'hover-bg': '#0d4552',
            'line': '#586e75', 'line-2': '#073642', 'scroll': '#657b83',
            'text': '#eee8d5', 'text-2': '#d3cbb8', 'muted': '#839496', 'sub': '#657b83',
            'accent': '#268bd2', 'hover-text': '#eee8d5',
        },
    },
    {
        key: 'rosepine', label: 'Rosé Pine',
        vars: {
            'bg': '#191724', 'titlebar': '#13111e', 'input': '#191724', 'bar': '#1f1d2e',
            'panel': '#13111e', 'card': '#26233a', 'hover-bg': '#2a273f',
            'line': '#393552', 'line-2': '#211f2e', 'scroll': '#403d52',
            'text': '#e0def4', 'text-2': '#c4c1e4', 'muted': '#908caa', 'sub': '#6e6a86',
            'accent': '#ebbcba', 'hover-text': '#e0def4',
        },
    },
];

export function themeByKey(key: unknown): Theme {
    const k = String(key ?? '');
    return THEMES.find((t) => t.key === k) || THEMES[0];
}
