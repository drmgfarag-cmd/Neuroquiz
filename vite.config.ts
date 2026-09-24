import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// `base: "./"` keeps asset paths relative so the same build works as a
// hosted PWA, inside the Capacitor Android shell and inside Electron.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "NeuroQuiz – Neurosurgery Question Bank",
        short_name: "NeuroQuiz",
        description: "Offline neurosurgery question bank with AI tagging, flashcards and cases.",
        theme_color: "#1f4e79",
        background_color: "#0f1720",
        display: "standalone",
        start_url: ".",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }
        ]
      },
      workbox: { maximumFileSizeToCacheInBytes: 6 * 1024 * 1024 }
    })
  ],
  build: { chunkSizeWarningLimit: 1500 },
  test: { environment: "node" }
});
