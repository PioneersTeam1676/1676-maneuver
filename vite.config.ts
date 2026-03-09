/// <reference types="vitest" />
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
const HMR_HOST = process.env.VITE_HMR_HOST || ""
const HMR_PROTOCOL = process.env.VITE_HMR_PROTOCOL || ""
const HMR_CLIENT_PORT = process.env.VITE_HMR_CLIENT_PORT

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      devOptions: {
        enabled: true,
      },
      includeAssets: ['pioneer.png'],
      workbox: {
        importScripts: ["push-handler.js"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MB (increase from default 2 MB)
        // Exclude external analytics and API domains from caching
        navigateFallbackDenylist: [/^https:\/\/www\.googletagmanager\.com/, /^https:\/\/www\.google-analytics\.com/],
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) => 
              request.destination === "document" && 
              !url.hostname.includes('googletagmanager.com') &&
              !url.hostname.includes('google-analytics.com'),
            handler: "NetworkFirst",
            options: {
              cacheName: "html-cache",
            },
          },
          {
            urlPattern: ({ request, url }) => 
              request.destination === "script" && 
              !url.hostname.includes('googletagmanager.com') &&
              !url.hostname.includes('google-analytics.com'),
            handler: "NetworkFirst",
            options: {
              cacheName: "js-cache",
            },
          },
          {
            urlPattern: ({ request }) => request.destination === "style",
            handler: "NetworkFirst",
            options: {
              cacheName: "css-cache",
            },
          },
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "NetworkFirst",
            options: {
              cacheName: "image-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 30 * 24 * 60 * 60, // Cache images for 30 days
              },
            },
          },
        ],
      },
      injectRegister: false,
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
  },
  /* QE: different port so both versions can run simultaneously on the same host */
  server: {
    host: true, // same as "--host" flag
    port: 4176,
    strictPort: true,
    // Allow requests to the local hostname used on this network
    allowedHosts: ["atlas.local", "scouting.1676.team", "scouting.team1676.org"],
    hmr: (HMR_HOST || HMR_PROTOCOL || HMR_CLIENT_PORT)
      ? {
          host: HMR_HOST || undefined,
          protocol: (HMR_PROTOCOL as "wss" | "ws" | undefined) || undefined,
          clientPort: HMR_CLIENT_PORT ? Number(HMR_CLIENT_PORT) : undefined,
        }
      : undefined,
  },
  /* QE: preview also on a separate port */
  preview: {
    port: 4174,
    host: true,
    strictPort: true,
    allowedHosts: ["atlas.local", "scouting.1676.team", "scouting.team1676.org"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return
          if (id.includes("d3") || id.includes("recharts")) {
            return "charts-vendor"
          }
          if (id.includes("three")) {
            return "three-vendor"
          }
          if (id.includes("dexie")) {
            return "dexie-vendor"
          }
          if (id.includes("framer-motion") || id.includes("/motion/")) {
            return "motion-vendor"
          }
          if (id.includes("lucide-react") || id.includes("@tabler/icons-react")) {
            return "icons-vendor"
          }
          return "vendor"
        },
      },
    },
  },
})
