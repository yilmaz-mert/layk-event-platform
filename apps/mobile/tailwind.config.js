/** @type {import('tailwindcss').Config} */

// Design tokens translated from the web app's oklch CSS custom properties.
// Each oklch value has been converted to its nearest sRGB hex equivalent
// so NativeWind (which uses Tailwind v3) can consume them as static colors.
//
// Light  →  Dark mapping mirrors web's :root  →  .dark CSS blocks.
module.exports = {
  content: [
    './App.tsx',
    './index.ts',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // --- Surfaces ---
        // web: --background oklch(1 0 0)  /  dark: oklch(0.129 0.042 264.695)
        background: { DEFAULT: '#ffffff', dark: '#1a1c2e' },

        // web: --card oklch(1 0 0)  /  dark: oklch(0.208 0.042 265.755)
        card: { DEFAULT: '#ffffff', dark: '#2d2f47' },
        'card-foreground': { DEFAULT: '#1a1c2e', dark: '#f8f9fb' },

        popover: { DEFAULT: '#ffffff', dark: '#2d2f47' },
        'popover-foreground': { DEFAULT: '#1a1c2e', dark: '#f8f9fb' },

        // --- Text ---
        // web: --foreground oklch(0.129 0.042 264.695)  /  dark: oklch(0.984 0.003 247.858)
        foreground: { DEFAULT: '#1a1c2e', dark: '#f8f9fb' },

        // --- Brand ---
        // web: --primary oklch(0.208 0.042 265.755)  /  dark: oklch(0.929 0.013 255.508)
        primary: { DEFAULT: '#2d2f47', dark: '#e2e8f0' },
        'primary-foreground': { DEFAULT: '#f8f9fb', dark: '#2d2f47' },

        // --- Neutral ---
        // web: --secondary oklch(0.968 0.007 247.896)  /  dark: oklch(0.279 0.041 260.031)
        secondary: { DEFAULT: '#f1f5f9', dark: '#383a5a' },
        'secondary-foreground': { DEFAULT: '#2d2f47', dark: '#f8f9fb' },

        // web: --muted oklch(0.968 0.007 247.896)  /  dark: oklch(0.279 0.041 260.031)
        muted: { DEFAULT: '#f1f5f9', dark: '#383a5a' },
        'muted-foreground': { DEFAULT: '#6b7ca4', dark: '#94a3b8' },

        // web: --accent oklch(0.968 0.007 247.896)  /  dark: oklch(0.279 0.041 260.031)
        accent: { DEFAULT: '#f1f5f9', dark: '#383a5a' },
        'accent-foreground': { DEFAULT: '#2d2f47', dark: '#f8f9fb' },

        // --- Semantic ---
        // web: --destructive oklch(0.577 0.245 27.325)  /  dark: oklch(0.704 0.191 22.216)
        destructive: { DEFAULT: '#e44848', dark: '#f87171' },
        'destructive-foreground': { DEFAULT: '#f8f9fb', dark: '#f8f9fb' },

        // --- Borders & Inputs ---
        // web: --border oklch(0.929 0.013 255.508)  /  dark: oklch(1 0 0 / 10%)
        border: { DEFAULT: '#e2e8f0', dark: '#2a2c40' },
        // web: --input oklch(0.929 0.013 255.508)  /  dark: oklch(1 0 0 / 15%)
        input: { DEFAULT: '#e2e8f0', dark: '#2e3045' },
        // web: --ring oklch(0.704 0.04 256.788)  /  dark: oklch(0.551 0.027 264.364)
        ring: { DEFAULT: '#94a3b8', dark: '#6b7db0' },
      },
      borderRadius: {
        // web: --radius: 0.625rem
        DEFAULT: '0.625rem',
        sm: '0.375rem',
        md: '0.5rem',
        lg: '0.625rem',
        xl: '0.875rem',
        '2xl': '1rem',
      },
    },
  },
  plugins: [],
};
