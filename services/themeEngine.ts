export interface ThemeConfig {
  id: string;
  firmName: string;
  primaryColor: string;
  primaryHover: string;
  accentColor: string;
  backgroundColor: string;
  cardBackground: string;
  sidebarBackground: string;
  textPrimary: string;
  textSecondary: string;
  borderColor: string;
  fontFamily: string;
  headingFont: string;
  logoUrl?: string;
  faviconUrl?: string;
  cssVariables: string;
  applied: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  colors: {
    primary: string;
    accent: string;
    background: string;
    card: string;
    sidebar: string;
    text: string;
    textSecondary: string;
    border: string;
  };
}

const STORAGE_KEY = 'casebuddy_theme_config';
const STYLE_ID = 'casebuddy-theme';

const isLocalStorageAvailable = (): boolean => {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '');
  let expanded = h;
  if (h.length === 3) {
    expanded = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (expanded.length !== 6) return null;
  const r = parseInt(expanded.substring(0, 2), 16);
  const g = parseInt(expanded.substring(2, 4), 16);
  const b = parseInt(expanded.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('');
}

function lighten(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const f = 1 - percent / 100;
  return rgbToHex(
    rgb.r + (255 - rgb.r) * (1 - f),
    rgb.g + (255 - rgb.g) * (1 - f),
    rgb.b + (255 - rgb.b) * (1 - f),
  );
}

function darken(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const f = 1 - percent / 100;
  return rgbToHex(rgb.r * f, rgb.g * f, rgb.b * f);
}

function toRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function generateId(): string {
  return 'theme_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export function computeDerivedColors(primary: string): {
  primaryHover: string;
  cardBackground: string;
  borderColor: string;
} {
  const rgb = hexToRgb(primary);
  const fallback = { primaryHover: primary, cardBackground: '#111827', borderColor: toRgba(primary, 0.2) };
  if (!rgb) return fallback;
  return {
    primaryHover: lighten(primary, 10),
    cardBackground: darken(primary, 30),
    borderColor: toRgba(primary, 0.2),
  };
}

export function getThemeConfig(): ThemeConfig | null {
  if (!isLocalStorageAvailable()) return null;
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    const config = JSON.parse(data) as ThemeConfig;
    if (!config || !config.id || !config.primaryColor) return null;
    config.applied = true;
    return config;
  } catch (e) {
    return null;
  }
}

export function injectThemeCSS(config: ThemeConfig): void {
  if (typeof document === 'undefined') return;

  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }

  const css = generateCSSFromConfig(config);
  styleEl.textContent = css;

  document.title = config.firmName || 'CaseBuddy';

  if (config.logoUrl) {
    document.documentElement.style.setProperty('--cb-logo', `url(${config.logoUrl})`);
  } else {
    document.documentElement.style.removeProperty('--cb-logo');
  }

  if (config.faviconUrl) {
    let faviconLink = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    if (!faviconLink) {
      faviconLink = document.createElement('link');
      faviconLink.rel = 'icon';
      document.head.appendChild(faviconLink);
    }
    faviconLink.href = config.faviconUrl;
  }

  config.cssVariables = css;
  config.applied = true;
}

export function saveThemeConfig(config: ThemeConfig): void {
  if (!isLocalStorageAvailable()) return;
  const now = Date.now();
  if (!config.createdAt) config.createdAt = now;
  config.updatedAt = now;
  const derived = computeDerivedColors(config.primaryColor);
  config.primaryHover = derived.primaryHover;
  config.cardBackground = config.cardBackground || derived.cardBackground;
  config.borderColor = config.borderColor || derived.borderColor;
  config.cssVariables = generateCSSFromConfig(config);
  config.applied = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    injectThemeCSS(config);
  } catch (e) {
    // storage full or unavailable
  }
}

export function deleteThemeConfig(): void {
  if (!isLocalStorageAvailable()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // ignore
  }
  if (typeof document !== 'undefined') {
    const styleEl = document.getElementById(STYLE_ID);
    if (styleEl) styleEl.remove();
    document.documentElement.style.removeProperty('--cb-logo');
    document.title = 'CaseBuddy';
  }
}

export function generateCSSFromConfig(config: ThemeConfig): string {
  return [
    ':root {',
    `  --cb-primary: ${config.primaryColor};`,
    `  --cb-primary-hover: ${config.primaryHover};`,
    `  --cb-accent: ${config.accentColor};`,
    `  --cb-bg: ${config.backgroundColor};`,
    `  --cb-card: ${config.cardBackground};`,
    `  --cb-sidebar: ${config.sidebarBackground};`,
    `  --cb-text: ${config.textPrimary};`,
    `  --cb-text-secondary: ${config.textSecondary};`,
    `  --cb-border: ${config.borderColor};`,
    `  --cb-font: ${config.fontFamily};`,
    `  --cb-heading-font: ${config.headingFont};`,
    config.logoUrl ? `  --cb-logo: url(${config.logoUrl});` : '',
    '}',
  ]
    .filter(Boolean)
    .join('\n');
}

export function getThemePresets(): ThemePreset[] {
  return [
    {
      id: 'casebuddy-gold',
      name: 'CaseBuddy Gold',
      description: 'Gold primary on dark slate — the default CaseBuddy experience.',
      colors: {
        primary: '#D4AF37',
        accent: '#F59E0B',
        background: '#020617',
        card: '#0F172A',
        sidebar: '#020617',
        text: '#F8FAFC',
        textSecondary: '#94A3B8',
        border: '#334155',
      },
    },
    {
      id: 'midnight-blue',
      name: 'Midnight Blue',
      description: 'Deep blue primary on a dark navy canvas.',
      colors: {
        primary: '#3B82F6',
        accent: '#60A5FA',
        background: '#0B1120',
        card: '#111C34',
        sidebar: '#070D1A',
        text: '#E2E8F0',
        textSecondary: '#7C8AA0',
        border: '#1E3A5F',
      },
    },
    {
      id: 'crimson-justice',
      name: 'Crimson Justice',
      description: 'Bold red primary on an almost-black backdrop.',
      colors: {
        primary: '#DC2626',
        accent: '#F87171',
        background: '#0A0A0A',
        card: '#141414',
        sidebar: '#050505',
        text: '#F5F5F5',
        textSecondary: '#A1A1AA',
        border: '#3B1515',
      },
    },
    {
      id: 'forest-precedent',
      name: 'Forest Precedent',
      description: 'Rich green primary on a deep green-black background.',
      colors: {
        primary: '#22C55E',
        accent: '#4ADE80',
        background: '#051206',
        card: '#0B1F0D',
        sidebar: '#030C04',
        text: '#ECFDF5',
        textSecondary: '#6B7280',
        border: '#13401E',
      },
    },
    {
      id: 'silver-steel',
      name: 'Silver & Steel',
      description: 'Cool gray primary on a near-black foundation.',
      colors: {
        primary: '#9CA3AF',
        accent: '#D1D5DB',
        background: '#030712',
        card: '#0F172A',
        sidebar: '#020617',
        text: '#F3F4F6',
        textSecondary: '#6B7280',
        border: '#1F2937',
      },
    },
    {
      id: 'classic-ivory',
      name: 'Classic Ivory',
      description: 'Warm tan primary on an off-white background — a light theme.',
      colors: {
        primary: '#A68A56',
        accent: '#C4A46C',
        background: '#FAF9F6',
        card: '#FFFFFF',
        sidebar: '#F5F0E8',
        text: '#1C1917',
        textSecondary: '#57534E',
        border: '#D6D3D1',
      },
    },
  ];
}

export function applyPreset(presetId: string): ThemeConfig {
  const presets = getThemePresets();
  const preset = presets.find(p => p.id === presetId);
  if (!preset) {
    const fallback = presets[0];
    const derived = computeDerivedColors(fallback.colors.primary);
    const config: ThemeConfig = {
      id: generateId(),
      firmName: 'CaseBuddy',
      primaryColor: fallback.colors.primary,
      primaryHover: derived.primaryHover,
      accentColor: fallback.colors.accent,
      backgroundColor: fallback.colors.background,
      cardBackground: fallback.colors.card,
      sidebarBackground: fallback.colors.sidebar,
      textPrimary: fallback.colors.text,
      textSecondary: fallback.colors.textSecondary,
      borderColor: fallback.colors.border,
      fontFamily: 'Inter, sans-serif',
      headingFont: 'Inter, sans-serif',
      cssVariables: '',
      applied: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    saveThemeConfig(config);
    return config;
  }
  const derived = computeDerivedColors(preset.colors.primary);
  const config: ThemeConfig = {
    id: generateId(),
    firmName: 'CaseBuddy',
    primaryColor: preset.colors.primary,
    primaryHover: derived.primaryHover,
    accentColor: preset.colors.accent,
    backgroundColor: preset.colors.background,
    cardBackground: preset.colors.card,
    sidebarBackground: preset.colors.sidebar,
    textPrimary: preset.colors.text,
    textSecondary: preset.colors.textSecondary,
    borderColor: preset.colors.border,
    fontFamily: 'Inter, sans-serif',
    headingFont: 'Inter, sans-serif',
    cssVariables: '',
    applied: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  saveThemeConfig(config);
  return config;
}

export function resetToDefault(): void {
  deleteThemeConfig();
}
