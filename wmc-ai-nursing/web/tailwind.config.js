/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../../shared-resources/ui/src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        dashboard: {
          light: "#f8fafc",
          surface: "#ffffff",
          border: "#e2e8f0",
        },
      },
      boxShadow: {
        panel: "0 10px 25px -14px rgba(15, 23, 42, 0.45)",
      },
    },
  },
  plugins: [],
}
