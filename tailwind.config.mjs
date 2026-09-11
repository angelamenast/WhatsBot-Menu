/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        primary: "#EA580C",
        secondary: "#C2410C",
        "on-primary": "#FFFFFF",
        surface: "#FFFFFF",
        "surface-variant": "#F3F4F6",
        "on-surface": "#0F172A",
        "on-surface-variant": "#475569",
        "surface-container-lowest": "#FFFFFF",
        "surface-container-low": "#F8FAFC",
        "surface-container": "#F1F5F9",
        "surface-container-high": "#E2E8F0",
        "surface-container-highest": "#CBD5E1",
        "inverse-surface": "#0F172A",
        "inverse-on-surface": "#F8FAFC",
        "orange-light": "#FFEDD5",
        "orange-subtle": "#FFF7ED",
        "outline-variant": "#E2E8F0",
        "border-technical": "#E2E8F0",
      },
      spacing: {
        "gutter-mobile": "1rem",
        "gutter-desktop": "2rem",
        "unit-xs": "0.5rem",
        "unit-sm": "1rem",
        "unit-md": "1.5rem",
      },
      fontSize: {
        "headline-md": ["1.5rem", { lineHeight: "2rem" }],
      },
      boxShadow: {
        "ambient-shadow": "0 4px 20px -2px rgba(0, 0, 0, 0.05)",
        "ambient-shadow-lg": "0 10px 30px -4px rgba(0, 0, 0, 0.1)",
      },
    },
  },
  plugins: [],
};
