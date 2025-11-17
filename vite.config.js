import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    fs: {
      deny: ['**/llama.cpp/**']
    }
  },
  optimizeDeps: {
    exclude: ['llama.cpp']
  }
});