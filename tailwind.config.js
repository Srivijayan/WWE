/** Tailwind is prebuilt into css/tailwind.css so the game doesn't compile CSS in the browser.
 *  After adding or changing Tailwind classes in index.html, run: npm run build:css */
module.exports = {
  content: ['./index.html', './js/**/*.js'],
  theme: { extend: {} },
  plugins: [],
};
