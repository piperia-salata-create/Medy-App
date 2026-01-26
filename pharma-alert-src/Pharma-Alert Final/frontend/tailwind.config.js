/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // Primary/Accents
        'pharma-teal': '#008B8B',
        'pharma-steel-blue': '#4682B4',
        'pharma-sea-green': '#2E8B57',
        'pharma-royal-blue': '#3B4C9B',
        'pharma-dark-slate': '#2C3E50',

        // Surfaces/Backgrounds
        'pharma-white': '#FFFFFF',
        'pharma-ice-blue': '#F5F9FC',
        'pharma-pale-blue': '#C0D6E4',
        'pharma-soft-blue': '#CAD6E8',
        'pharma-steel-mist': '#B0C4DE',

        // Neutrals/Text/Borders
        'pharma-silver': '#C0C0C0',
        'pharma-grey-light': '#B3B3B3',
        'pharma-grey-pale': '#E0E0E0',
        'pharma-cool-grey': '#A4A7B6',
        'pharma-slate-grey': '#6D7B92',
        'pharma-charcoal-light': '#4B4C53',
        'pharma-charcoal': '#4D4D4D',
        'pharma-charcoal-dark': '#3F3F3F',

        // Semantic Colors
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',

        // Status Colors
        'status-available': '#2E8B57',
        'status-limited': '#4682B4',
        'status-unavailable': '#6D7B92',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'card': '0 2px 8px -2px rgba(44, 62, 80, 0.08)',
        'card-hover': '0 8px 24px -4px rgba(44, 62, 80, 0.12)',
        'button': '0 2px 4px -1px rgba(0, 139, 139, 0.2)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' }
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
        'scale-in': 'scale-in 0.3s ease-out',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
};
