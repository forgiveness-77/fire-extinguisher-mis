/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'sans-serif'] },
      colors: {
        crimson: {
          50:  '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#DC143C',
          800: '#be123c',
          900: '#9f1239',
          DEFAULT: '#DC143C',
        },
        cream: {
          50:  '#fffdf9',
          100: '#FFF8F0',
          200: '#fef0e0',
          300: '#fde8cc',
          DEFAULT: '#FFF8F0',
        },
      },
    },
  },
  plugins: [],
};
