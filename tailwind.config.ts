import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontSize: {
        'elder-sm': ['18px', '1.6'],
        'elder-base': ['20px', '1.6'],
        'elder-lg': ['24px', '1.5'],
        'elder-xl': ['28px', '1.4'],
        'elder-2xl': ['36px', '1.3'],
        'elder-3xl': ['48px', '1.2'],
      },
      minHeight: {
        touch: '64px',
      },
      minWidth: {
        touch: '64px',
      },
    },
  },
  plugins: [],
}

export default config
