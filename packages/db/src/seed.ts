import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { users } from "./schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@rush.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "rush-admin";
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";

  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    console.log(`User ${email} already exists (id=${existing[0].id})`);
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    const [u] = await db
      .insert(users)
      .values({ email, name, passwordHash })
      .returning({ id: users.id, email: users.email });
    console.log(`Created admin user id=${u.id} email=${u.email}`);
    console.log(`  password: ${password}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
