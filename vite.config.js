import { resolve } from "node:path"
import { defineConfig } from "vite"
import glsl from "vite-plugin-glsl"

export default defineConfig({
  plugins: [glsl()],
  build: {
    rolldownOptions: {
      input: {
        home: resolve(import.meta.dirname, "index.html"),
        notFound: resolve(import.meta.dirname, "404.html"),
        contact: resolve(import.meta.dirname, "contact/index.html"),
      },
    },
  },
})
