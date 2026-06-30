import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // Sidecar writes stem/export WAVs under local-engine; watching them can EBUSY-crash Vite on Windows.
      ignored: ["**/local-engine/service/.work/**"],
    },
  },
});
