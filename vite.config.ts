import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  root: path.resolve(__dirname, "client"),
  server: {
    host: "0.0.0.0",
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname)],
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist", "client"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        game: path.resolve(__dirname, "client", "index.html"),
        admin: path.resolve(__dirname, "client", "admin.html"),
      },
    },
  },
});
