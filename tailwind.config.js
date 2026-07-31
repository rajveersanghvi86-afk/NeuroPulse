/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0B0F19',
        panel: '#0F172A',
        baseline: '#14B8A6', // Neon Teal
        warning: '#F59E0B',  // Amber
        severe: '#F43F5E',   // Rose
      },
      backgroundImage: {
        'gradient-glass': 'linear-gradient(145deg, rgba(15, 23, 42, 0.7) 0%, rgba(15, 23, 42, 0.4) 100%)',
      },
      boxShadow: {
        'glass': '0 4px 30px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      }
    },
  },
  plugins: [],
}
