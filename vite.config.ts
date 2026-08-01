import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },

    server: {
      host: "0.0.0.0",
      port: 5173,
      hmr: process.env.DISABLE_HMR !== "true",
      allowedHosts: true,
    },

    preview: {
      host: "0.0.0.0",
      port: 4173,
      allowedHosts: true,
    },
  };
});