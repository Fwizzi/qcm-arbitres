import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// "base" doit correspondre au nom de ton dépôt GitHub pour que GitHub Pages
// trouve correctement les fichiers (ex. si ton dépôt s'appelle "qcm-arbitres",
// l'app sera servie depuis https://<toncompte>.github.io/qcm-arbitres/).
export default defineConfig({
  plugins: [react()],
  base: '/qcm-arbitres/',
});
