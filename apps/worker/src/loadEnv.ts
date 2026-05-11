import { config as dotenvConfig } from "dotenv";
import path from "node:path";
import fs from "node:fs";

// Cherche .env en remontant depuis cwd jusqu'à la racine du monorepo
function loadEnvUp(start: string): void {
  let dir = path.resolve(start);
  for (let i = 0; i < 8; i++) {
    const p = path.join(dir, ".env");
    if (fs.existsSync(p)) {
      dotenvConfig({ path: p });
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  dotenvConfig();
}

loadEnvUp(process.cwd());
