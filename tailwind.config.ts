import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          0: '#ffffff',
          50: '#ededed',
          100: '#c8c8c8',
          200: '#8e8e8e',
          300: '#5b5b5b',
          400: '#383838',
          500: '#232323',
          600: '#161616',
          700: '#0e0e0e',
          800: '#080808',
          900: '#050505',
          950: '#020202',
        },
        // Legacy aliases — kept so old code paths still compile but they
        // now resolve to the monochrome system, not the old glassy panel.
        surface: '#050505',
        panel: '#080808',
        accent: '#ededed',
        muted: '#8e8e8e',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.045em',
      },
      keyframes: {
        'pulse-dot-on': {
          '0%': { boxShadow: '0 0 0 0 rgba(255,255,255,0.5)' },
          '100%': { boxShadow: '0 0 0 8px rgba(255,255,255,0)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-dot-on': 'pulse-dot-on 2.2s ease-out infinite',
        'fade-up': 'fade-up 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
