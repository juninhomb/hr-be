const fs = require("fs");
const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      on("task", {
        loadShip2uRecipient({ path: filePath }) {
          if (!filePath || typeof filePath !== "string") {
            throw new Error("RECIPIENT_FILE inválido ou em falta.");
          }
          const raw = fs.readFileSync(filePath, "utf8");
          return JSON.parse(raw);
        },
      });
      return config;
    },
  },
});
