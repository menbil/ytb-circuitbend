/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rack: {
          950: '#0a0b0d',
          900: '#121418',
          850: '#171920',
          800: '#1e2129',
          700: '#2a2f3a',
          600: '#3d4454',
          panel: '#15171c',
          metal: '#22252e',
          screw: '#495061',
        },
        glow: {
          amber: '#ff9d00',
          phosphor: '#00ff73',
          crimson: '#ff2a4b',
          electric: '#00e1ff',
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Menlo', 'Consolas', 'monospace'],
        display: ['"Chakra Petch"', 'system-ui', 'monospace']
      },
      boxShadow: {
        'rack-inset': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.8), inset 0 0 1px 1px rgba(255, 255, 255, 0.05)',
        'rack-raised': '0 4px 6px -1px rgba(0, 0, 0, 0.6), 0 2px 4px -2px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'amber-glow': '0 0 15px rgba(255, 157, 0, 0.4)',
        'phosphor-glow': '0 0 15px rgba(0, 255, 115, 0.4)',
        'crimson-glow': '0 0 15px rgba(255, 42, 75, 0.4)',
      }
    },
  },
  plugins: [],
}

