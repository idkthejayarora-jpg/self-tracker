/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  'rgb(var(--accent-rgb-light) / 0.08)',
          100: 'rgb(var(--accent-rgb-light) / 0.15)',
          200: 'rgb(var(--accent-rgb-light) / 0.25)',
          300: 'rgb(var(--accent-rgb-light) / 0.5)',
          400: 'rgb(var(--accent-rgb-light) / <alpha-value>)',
          500: 'rgb(var(--accent-rgb) / <alpha-value>)',
          600: 'rgb(var(--accent-rgb) / <alpha-value>)',
          700: 'rgb(var(--accent-rgb-dark) / <alpha-value>)',
          800: 'rgb(var(--accent-rgb-dark) / 0.8)',
          900: 'rgb(var(--accent-rgb-dark) / 0.6)',
        },
      },
    },
  },
  plugins: [],
};
