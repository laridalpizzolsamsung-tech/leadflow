/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        concreto: { 50: '#F6F7F4', 100: '#EDEFEA', 200: '#DDE0D8', 300: '#C3C8BC', 400: '#979D90', 500: '#6E7468', 600: '#545A50', 700: '#3F443C', 800: '#2A2E28', 900: '#1A1D19' },
        petroleo: { 50: '#EAF3F1', 100: '#CFE4E0', 200: '#9FC9C1', 300: '#6AA99F', 400: '#3D877C', 500: '#226B61', 600: '#17564E', 700: '#13453F', 800: '#0F3632', 900: '#0B2724' },
        quente: '#C92A2A', morno: '#B98200', frio: '#2F78C4', semclass: '#979D90',
        sinal: '#E8590C',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        sans: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { pequeno: '6px', medio: '10px', grande: '16px' },
    },
  },
  plugins: [],
}
