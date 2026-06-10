import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem"
      },
      boxShadow: {
        card: "0 0 0 1px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.04)",
        glass: "0 8px 40px rgba(0, 0, 0, 0.08)",
        pop: "0 0 0 1px rgba(0, 0, 0, 0.05), 0 12px 32px rgba(0, 0, 0, 0.12)"
      },
      colors: {
        background: "hsl(var(--background))",
        border: "hsl(var(--border))",
        card: "hsl(var(--card))",
        foreground: "hsl(var(--foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        ring: "hsl(var(--ring))",
        separator: "hsl(var(--separator))"
      },
      fontFamily: {
        mono: ["var(--font-mono)", "monospace"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"]
      },
      transitionTimingFunction: {
        apple: "cubic-bezier(0.32, 0.72, 0, 1)"
      }
    }
  },
  plugins: []
} satisfies Config;
