/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        palette: {
          dark: '#1e293b',
          light: '#f1f5f9',
          accent: '#3b82f6',
        }
      }
    },
  },
  plugins: [],
}