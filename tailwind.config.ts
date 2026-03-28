import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        parchment: "#f5e6c8",
        "deep-night": "#0d0a1a",
        "midnight-purple": "#1a0f2e",
        "arcane-gold": "#d4a843",
        "arcane-gold-bright": "#f0c060",
        "ember": "#c0622a",
        "wood-dark": "#5c3317",
        "wood-mid": "#8b5e3c",
        "wood-light": "#a0714f",
        "mystic-glow": "#7c3aed",
      },
      fontFamily: {
        cinzel: ["var(--font-cinzel)", "serif"],
        crimson: ["var(--font-crimson)", "serif"],
      },
      boxShadow: {
        "book-glow-crimson": "0 0 20px 4px rgba(180, 30, 50, 0.6)",
        "book-glow-blue": "0 0 20px 4px rgba(30, 60, 160, 0.6)",
        "book-glow-green": "0 0 20px 4px rgba(20, 120, 80, 0.6)",
        "book-glow-amber": "0 0 20px 4px rgba(180, 100, 20, 0.6)",
        "book-glow-violet": "0 0 20px 4px rgba(100, 30, 180, 0.6)",
        "book-glow-teal": "0 0 20px 4px rgba(20, 130, 140, 0.6)",
      },
      animation: {
        "float": "float 6s ease-in-out infinite",
        "twinkle": "twinkle 3s ease-in-out infinite",
        "flicker": "flicker 4s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        twinkle: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
        flicker: {
          "0%, 100%": { opacity: "1" },
          "25%": { opacity: "0.85" },
          "50%": { opacity: "0.95" },
          "75%": { opacity: "0.8" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
