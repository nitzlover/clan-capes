import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          0: '#ffffff',
          50: '#f5f5f5',
          100: '#e5e5e5',
          200: '#c8c8c8',
          300: '#9a9a9a',
          400: '#6b6b6b',
          500: '#454545',
          600: '#2a2a2a',
          700: '#1a1a1a',
          800: '#101010',
          900: '#0a0a0a',
          950: '#050505',
        },
        // Legacy aliases used by dashboard until it gets its own pass.
        surface: '#050505',
        panel: '#101010',
        accent: '#f5f5f5',
        muted: '#9a9a9a',
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
