import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: "#F7F9FC", // Clean light blue-gray
          muted: "#E8EDF5",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          subtle: "#FAFBFC",
        },
        text: {
          primary: "#1A1F36", // Deep navy
          secondary: "#3C4257",
          muted: "#697386",
        },
        brand: {
          primary: "#5469D4", // Circle/Arc purple
          hover: "#3D4FC4",
          accent: "#00D4FF", // Circle bright blue
          subtle: "#E8ECFF",
        },
        card: {
          bg: "#FFFFFF",
          border: "#E3E8EE",
        },
        border: {
          DEFAULT: "#D9DFE8",
          focus: "#5469D4",
        },
        error: "#E25950",
        success: "#3ECF8E",
      },
      boxShadow: {
        card: "0 10px 25px rgba(15, 23, 42, 0.08)",
      },
      borderRadius: {
        xl: "20px",
      },
    },
  },
  plugins: [],
};

export default config;

