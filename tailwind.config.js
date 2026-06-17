/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          50:  '#fdfbe6',
          100: '#faf3c0',
          200: '#f5e880',
          300: '#f0d848',
          400: '#e8c217',
          500: '#d4af37',
          600: '#b4941f',
          700: '#8f6c18',
          800: '#6b4f14',
          900: '#46340d',
          950: '#251b07',
        },
        slate: {
          850: '#172033',
          900: '#0f172a',
          925: '#0b1220',
          950: '#020617',
        }
      },
      fontFamily: {
        sans:  ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Merriweather', 'Georgia', 'serif'],
        mono:  ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial':   'radial-gradient(var(--tw-gradient-stops))',
        'gradient-gold':     'linear-gradient(135deg, #d4af37, #f0d848, #d4af37)',
        'gradient-legal':    'linear-gradient(135deg, #020617 0%, #0f172a 50%, #020617 100%)',
      },
      boxShadow: {
        'gold-sm': '0 0 10px rgba(212,175,55,0.2)',
        'gold':    '0 0 20px rgba(212,175,55,0.3)',
        'gold-lg': '0 0 40px rgba(212,175,55,0.4)',
        'gold-xl': '0 0 60px rgba(212,175,55,0.5)',
        'inner-gold': 'inset 0 0 20px rgba(212,175,55,0.1)',
      },
      animation: {
        'fade-in':     'fadeIn 0.4s ease-out',
        'slide-up':    'slideUp 0.35s ease-out',
        'slide-right': 'slideRight 0.3s ease-out',
        'glow-pulse':  'glowPulse 2.5s ease-in-out infinite',
        'float':       'float 6s ease-in-out infinite',
        'shimmer':     'shimmer 2s linear infinite',
        'spin-slow':   'spin 8s linear infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' },                              to: { opacity: '1' } },
        slideUp:   { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideRight:{ from: { opacity: '0', transform: 'translateX(-8px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        glowPulse: {
          '0%,100%': { boxShadow: '0 0 10px rgba(212,175,55,0.2)' },
          '50%':     { boxShadow: '0 0 30px rgba(212,175,55,0.5)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0px)' },
          '50%':     { transform: 'translateY(-12px)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition:  '200% center' },
        },
      },
      backdropBlur: { xs: '2px' },
    },
  },
  plugins: [],
}
