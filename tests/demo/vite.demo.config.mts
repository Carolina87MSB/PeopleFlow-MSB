import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const raiz = fileURLToPath(new URL("../../", import.meta.url));
const api = `http://localhost:${process.env.DEMO_API_PORT ?? 5190}`;
// Demonstração local: o cliente do Supabase é trocado por um que fala com o servidor local (nada vai para produção).
export default defineConfig({
  root: raiz,
  plugins: [react()],
  resolve: { alias: [{ find: /^(\.\.?\/)+lib\/supabaseClient$/, replacement: fileURLToPath(new URL("./supabaseShim.ts", import.meta.url)) }] },
  server: { port: Number(process.env.DEMO_WEB_PORT ?? 5191), strictPort: true, proxy: { "/api": api, "/demo": api }, fs: { allow: [raiz] } },
  optimizeDeps: { entries: ["tests/demo/index.html"] },
});
