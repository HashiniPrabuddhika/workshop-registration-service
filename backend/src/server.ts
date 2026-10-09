import { createApp } from "./app";
import { config } from "./config";
import { openDatabase } from "./db";
import { seedIfEmpty } from "./seed";

const db = openDatabase(config.dbPath);
if (seedIfEmpty(db)) {
  console.log("Empty database detected: seeded initial accounts");
}

const server = createApp(db).listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
