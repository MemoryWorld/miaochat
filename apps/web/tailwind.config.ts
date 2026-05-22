import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        xl: "1.25rem",
        "2xl": "1.5rem"
      },
      boxShadow: {
        glass:
          "0 24px 80px -36px rgba(15, 23, 42, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.45)"
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
        ring: "hsl(var(--ring))"
      },
      fontFamily: {
        mono: ["var(--font-mono)", "monospace"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
} satisfies Config;
