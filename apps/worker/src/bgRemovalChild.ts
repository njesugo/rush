import fs from "node:fs/promises";
import path from "node:path";

type RemoveBgFn = (input: Blob, opts?: unknown) => Promise<Blob>;

function mimeFor(ext: string): string {
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function main(): Promise<void> {
  const [, , rawPath, outPath] = process.argv;
  if (!rawPath || !outPath) {
    process.stderr.write("usage: bgRemovalChild <rawPath> <outPath>\n");
    process.exit(2);
  }

  const buf = await fs.readFile(rawPath);
  const ext = path.extname(rawPath).toLowerCase();
  const blob = new Blob([buf], { type: mimeFor(ext) });

  const mod: any = await import("@imgly/background-removal-node");
  const removeBg: RemoveBgFn =
    mod.removeBackground || mod.default?.removeBackground || mod.default;
  if (typeof removeBg !== "function") throw new Error("removeBackground not found");

  const resultBlob = await removeBg(blob, {
    output: { format: "image/png" },
    debug: false,
  });
  const out = Buffer.from(await resultBlob.arrayBuffer());
  await fs.writeFile(outPath, out);
  process.stdout.write(`OK ${outPath}\n`);
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`ERR ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
