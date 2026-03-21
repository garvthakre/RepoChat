import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          950: '#110b16',
          900: '#1a1321',
          800: '#2b1f36',
          700: '#3c2a4c',
          600: '#6d4bbc'
        }
      }
    }
  },
  plugins: []
};

export default config;
