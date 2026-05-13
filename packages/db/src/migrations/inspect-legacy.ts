import Database from "better-sqlite3";

const dbPath = process.argv[2] ?? "/mnt/c/Users/20016390/Desktop/rush/one/data.db";
const db = new Database(dbPath, { readonly: true });

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all() as { name: string }[];

console.log("TABLES:", tables.map((t) => t.name).join(", "));
for (const { name } of tables) {
  const cols = db.prepare(`PRAGMA table_info(${name})`).all() as { name: string; type: string }[];
  const count = (db.prepare(`SELECT COUNT(*) AS c FROM ${name}`).get() as { c: number }).c;
  console.log(`\n=== ${name} (${count} rows) ===`);
  cols.forEach((c) => console.log(`  ${c.name}  ${c.type}`));
}
db.close();
