import { defineConfig } from "vite";

// base "./" : le site fonctionne quel que soit le dossier d'hébergement
// (GitHub Pages, sous-dossier, ouverture locale…).
export default defineConfig({
    base: "./",
    build: {
        outDir: "docs",
        emptyOutDir: true
    }
});
