import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import api from "./routes/api.js";
import "./lib/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use("/api", api);
app.use(express.static(join(__dirname, "..", "public")));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Stackr running on :${port}`));
