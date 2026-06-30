import { defineConfig } from "vite";

export default defineConfig({
  // worker は ES module 形式で出力（import を使えるように）
  worker: {
    format: "es",
  },
});
