/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // warm paper/ink neutrals replace the cool blue-grey slate everywhere
        slate: {
          50: "#faf8f4", 100: "#f2efe8", 200: "#e6e1d7", 300: "#d0c9bb", 400: "#a69e8f",
          500: "#7f786b", 600: "#5e584e", 700: "#45403a", 800: "#2f2b26", 900: "#221f1b", 950: "#181613",
        },
        // fountain-pen ink blue: the single accent (overrides indigo so existing indigo-* classes pick it up)
        indigo: {
          50: "#eef3fa", 100: "#dbe5f3", 200: "#b8cbe6", 300: "#94b0da", 400: "#6a90c6",
          500: "#2f5f9e", 600: "#24508f", 700: "#1f4275", 800: "#1b365f", 900: "#172c4c", 950: "#0e1b2f",
        },
        marker: "#f5d547", // highlighter yellow, used sparingly
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Newsreader", "Georgia", "serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: { glow: "none" },
    },
  },
  plugins: [],
};
