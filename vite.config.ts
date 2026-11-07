import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5173, host: true },
  build: {
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: asset=>asset.name?.endsWith(".css")?"assets/app.css":"assets/[name]-[hash][extname]",
      },
    },
  },
});
