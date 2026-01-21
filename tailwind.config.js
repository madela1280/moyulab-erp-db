/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    // Symphony Color (cell bg)
    "bg-red-200",
    "bg-yellow-200",
    "bg-blue-200",
    "bg-green-200",
    "bg-purple-200",
    "bg-slate-300",

    // Symphony Color (text)
    "text-red-800",
    "text-yellow-800",
    "text-blue-800",
    "text-green-800",
    "text-purple-800",
    "text-slate-900",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};