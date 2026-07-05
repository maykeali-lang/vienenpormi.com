import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base relativa ("./") para que funcione tanto en localhost como servido
// desde una subcarpeta de tu dominio. Cambia a "/" si lo sirves desde la raiz.
export default defineConfig({
  base: "/",
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // En dev, /api/* va al contador local (npm run plays). Si no esta arriba,
    // el cliente cae a localStorage automaticamente.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1600,
  },
});
