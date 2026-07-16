import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Health marker palette (green / yellow / red)
        health: {
          green: "#16a34a",
          greenBg: "#dcfce7",
          yellow: "#d97706",
          yellowBg: "#fef3c7",
          red: "#dc2626",
          redBg: "#fee2e2",
        },
      },
    },
  },
  plugins: [],
};

export default config;
