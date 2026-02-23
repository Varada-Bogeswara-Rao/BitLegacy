/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        fontFamily: {
            display: ['"Instrument Serif"', 'serif'],
            body: ['"Times New Roman"', 'Times', 'serif'],
        },
        extend: {
            colors: {
                paper: '#F7F7F5',
                surface: '#FAFAFA',
                ink: '#1C1C1C',
                muted: '#6B6B6B',
                border: '#E2E2E2',
                accent: '#9B7F5A',
                brick: '#B65A4A',
                sage: '#6E8B6A',
                slate: '#6F7782',
            },
            boxShadow: {
                soft: '0 8px 24px rgba(0, 0, 0, 0.04)',
            },
        },
    },
    plugins: [],
}
