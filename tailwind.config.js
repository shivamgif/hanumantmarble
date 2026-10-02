/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './app/**/*.{js,jsx}',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        brand: {
          primary: "#E07A00",
          secondary: "#1A1A54",
          accent: "#0d9488",
          slateSidebar: "#0f172a",
          slateCanvas: "#f8fafc",
        },
        teal: {
          DEFAULT: "#0d9488",
          light: "#2dd4bf",
          muted: "rgba(13, 148, 136, 0.1)",
        },
        // Channel triplets + <alpha-value> so `/NN` opacity modifiers compile.
        border: "rgb(var(--border) / <alpha-value>)",
        input: "rgb(var(--input) / <alpha-value>)",
        ring: "rgb(var(--ring) / <alpha-value>)",
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--secondary) / <alpha-value>)",
          foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--destructive) / <alpha-value>)",
          foreground: "rgb(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "rgb(var(--muted) / <alpha-value>)",
          foreground: "rgb(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          foreground: "rgb(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "rgb(var(--popover) / <alpha-value>)",
          foreground: "rgb(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "rgb(var(--card) / <alpha-value>)",
          foreground: "rgb(var(--card-foreground) / <alpha-value>)",
        },
      },
      fontFamily: {
        // Set by next/font in app/layout.js.
        display: ["var(--font-dm-serif)", "Georgia", "Times New Roman", "serif"],
        sans: ["var(--font-dm-sans)", "var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.06), 0 1px 3px 0 rgb(15 23 42 / 0.04)",
        "card-hover": "0 1px 2px 0 rgb(15 23 42 / 0.06), 0 8px 24px -12px rgb(15 23 42 / 0.20)",
      },
      // Motion system. One curve for nearly everything: a fast start that
      // settles softly (ease-out quint), so UI answers immediately and lands
      // without a bump. Bare `transition` classes and every Radix
      // menu/sheet/dialog animation (tailwindcss-animate reads these) inherit it.
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.22, 1, 0.36, 1)",
        out: "cubic-bezier(0.22, 1, 0.36, 1)",
        "in-out": "cubic-bezier(0.65, 0, 0.35, 1)",
        in: "cubic-bezier(0.55, 0, 1, 0.45)",
      },
      // Named, not arbitrary: duration-[400ms] is ambiguous between this and
      // tailwindcss-animate's animation duration, and Tailwind drops it.
      transitionDuration: {
        DEFAULT: "200ms",
        250: "250ms",
        400: "400ms",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
        "slide-up": {
          from: { transform: "translateY(24px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "scale-in": {
          from: { transform: "scale(0.95)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        // Page and panel arrival: a short rise with the fade.
        rise: {
          from: { transform: "translateY(12px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
        "accordion-up": "accordion-up 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
        "slide-up": "slide-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
        "scale-in": "scale-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) both",
        // Not "enter": tailwindcss-animate owns that keyframe name.
        rise: "rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
