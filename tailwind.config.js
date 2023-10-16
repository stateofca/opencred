/* eslint-disable unicorn/prefer-module */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./ui/**/*.html', './ui/**/*.vue', './ui/**/*.js'],
  theme: {
    extend: {},
    clipPath: {
      bg: 'polygon(0 0,100% 0,100% 75%,0 100%)',
    },
  },
  plugins: [require('tailwind-clip-path')],
};
