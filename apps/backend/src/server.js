import { fileURLToPath } from "node:url";
import { openDb } from "./db.js";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3001);
const dbFile = process.env.DB_FILE ?? fileURLToPath(new URL("../data/telerehab.db", import.meta.url));

const db = openDb(dbFile);
createApp(db).listen(port, () => console.log(`API de telerehabilitación en http://localhost:${port} (BD: ${dbFile})`));
