import { copyFile, cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = resolve(__dirname);
const srcDir = resolve(rootDir, "src");
const outDir = resolve(rootDir, "dist");

export default defineConfig({
  root: srcDir,
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        "popup/popup": resolve(srcDir, "popup/popup.html"),
        "options/options": resolve(srcDir, "options/options.html"),
        "background/service-worker": resolve(srcDir, "background/service-worker.ts")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  },
  plugins: [
    {
      name: "copy-extension-manifest",
      async closeBundle() {
        await mkdir(outDir, { recursive: true });
        await copyFile(resolve(rootDir, "manifest.json"), resolve(outDir, "manifest.json"));
        await cp(resolve(rootDir, "_locales"), resolve(outDir, "_locales"), { recursive: true });
      }
    }
  ],
  test: {
    root: rootDir,
    include: ["tests/**/*.test.ts"]
  }
});
