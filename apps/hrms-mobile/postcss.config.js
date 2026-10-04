import tailwind from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";
import appearanceCompatibility from "../../styles/postcss-compat.js";

export default {
  plugins: [tailwind({ optimize: { minify: false } }), appearanceCompatibility(), autoprefixer()],
};
