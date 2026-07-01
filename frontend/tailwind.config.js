/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'deep-orange': '#D35400',
        'light-orange': '#E67E22',
        'gold': '#F1C40F',
        'dark-bg': '#0A0A0A',
        'card-bg': '#121212',
      }
    },
  },
  plugins: [],
}
