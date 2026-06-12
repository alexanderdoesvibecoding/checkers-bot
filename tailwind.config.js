/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      boxShadow: {
        "piece-red": "0 14px 30px rgba(127, 29, 29, 0.45)",
        "piece-black": "0 14px 30px rgba(0, 0, 0, 0.55)",
      },
    },
  },
  plugins: [],
};
