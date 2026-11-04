import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cave: { 950: '#0b0a12', 900: '#14121f', 800: '#1d1a2e', 700: '#2a2542', 600: '#3a3358' },
        gold: { 400: '#fbbf24', 500: '#f59e0b' },
      },
      fontFamily: { sans: ['system-ui', 'Segoe UI', 'Tahoma', 'sans-serif'] },
    },
  },
  plugins: [],
};
export default config;
