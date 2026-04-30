/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        comercialObsPulse: {
          "0%, 100%": {
            opacity: "1",
            boxShadow: "0 0 0 0 rgb(56 189 248 / 0.55)",
          },
          "50%": {
            opacity: "1",
            boxShadow: "0 0 0 6px rgb(56 189 248 / 0.25)",
          },
        },
      },
      animation: {
        "comercial-obs-pulse": "comercialObsPulse 1.15s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

