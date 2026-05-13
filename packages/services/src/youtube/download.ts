import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface YtMetadata {
  /** YouTube video id (11 chars, e.g. "dQw4w9WgXcQ") */
  id: string;
  title: string;
  uploader: string | null;
  durationS: number;
}

const URL_RE = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/i;

/** Extract a YouTube video id from a URL or pass-through if already an id. */
export function parseYoutubeId(input: string): string | null {
  if (!input) return null;
  if (/^[\w-]{11}$/.test(input)) return input;
  const m = URL_RE.exec(input.trim());
  return m ? m[1] : null;
}

/**
 * Materialize the YouTube cookies file once per process.
 * YouTube blocks unauthenticated yt-dlp from cloud IPs ("sign in to confirm
 * you're not a bot"). The user can export Netscape-format cookies from a
 * logged-in browser and pass them via env (raw or base64-encoded).
 */
let cookiesPathPromise: Promise<string | null> | null = null;
async function getCookiesPath(): Promise<string | null> {
  if (cookiesPathPromise) return cookiesPathPromise;
  cookiesPathPromise = (async () => {
    const explicit = process.env.YOUTUBE_COOKIES_FILE?.trim();
    if (explicit) {
      try {
        await fs.access(explicit);
        return explicit;
      } catch {
        return null;
      }
    }
    const b64 = process.env.YOUTUBE_COOKIES_B64?.trim();
    const raw = process.env.YOUTUBE_COOKIES?.trim();
    if (!b64 && !raw) return null;
    const content = b64 ? Buffer.from(b64, "base64").toString("utf8") : raw!;
    if (!content.includes("\t") && !content.startsWith("# Netscape")) {
      // Probably wrong format — yt-dlp would reject it.
      return null;
    }
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ytcookies-"));
    const file = path.join(dir, "cookies.txt");
    await fs.writeFile(file, content, "utf8");
    return file;
  })();
  return cookiesPathPromise;
}

/** Common args appended to every yt-dlp invocation (cookies, anti-bot tricks). */
async function ytExtraArgs(): Promise<string[]> {
  const args: string[] = [];
  const cookies = await getCookiesPath();
  if (cookies) args.push("--cookies", cookies);
  // Help bypass the "confirm you're not a bot" check without cookies.
  args.push(
    "--extractor-args",
    "youtube:player_client=android,web",
    "--user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );
  return args;
}

/** Spawn yt-dlp/ffmpeg, collect stdout, raise on non-zero exit. */
function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number } = {}
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (b) => (out += b.toString()));
    child.stderr.on("data", (b) => (err += b.toString()));
    let killed = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          killed = true;
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : null;
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (killed) return reject(new Error(`${cmd} timed out after ${opts.timeoutMs}ms`));
      if (code !== 0) {
        return reject(new Error(`${cmd} exited ${code}: ${err.trim().slice(0, 500)}`));
      }
      resolve({ stdout: out, stderr: err });
    });
  });
}

/** Probe a YouTube URL for metadata without downloading. */
export async function probeYoutube(url: string): Promise<YtMetadata> {
  const extra = await ytExtraArgs();
  const { stdout } = await run(
    "yt-dlp",
    ["--no-playlist", "--no-warnings", "-J", ...extra, url],
    { timeoutMs: 30_000 }
  );
  const json = JSON.parse(stdout);
  return {
    id: String(json.id),
    title: String(json.title ?? ""),
    uploader: json.uploader ? String(json.uploader) : null,
    durationS: Number(json.duration ?? 0),
  };
}

export interface DownloadedVideo {
  meta: YtMetadata;
  /** Local mp4 path on disk. Caller is responsible for cleanup. */
  filePath: string;
  /** Local 16k mono wav path used for transcription. */
  audioPath: string;
  /** Working dir to remove when done. */
  workDir: string;
}

/** Hard cap to avoid abuse: 40 min source videos. */
export const MAX_SOURCE_DURATION_S = 40 * 60;

/**
 * Download a YouTube video as <=720p mp4 + extract a 16k mono WAV
 * suitable for Whisper. Returns absolute paths in a temp dir.
 *
 * Caller MUST call `cleanupDownload(result.workDir)` once done.
 */
export async function downloadYoutube(url: string): Promise<DownloadedVideo> {
  const meta = await probeYoutube(url);
  if (!meta.id) throw new Error("yt-dlp returned no video id");
  if (meta.durationS > MAX_SOURCE_DURATION_S) {
    throw new Error(
      `Video too long: ${Math.round(meta.durationS)}s (max ${MAX_SOURCE_DURATION_S}s)`
    );
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `yt-${meta.id}-`));
  const filePath = path.join(workDir, `${meta.id}.mp4`);
  const audioPath = path.join(workDir, `${meta.id}.wav`);

  // 720p ceiling, prefer mp4 muxing for compatibility with downstream FFmpeg.
  const extra = await ytExtraArgs();
  await run(
    "yt-dlp",
    [
      "--no-playlist",
      "--no-warnings",
      "-f",
      "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]",
      "--merge-output-format",
      "mp4",
      "-o",
      filePath,
      ...extra,
      url,
    ],
    { timeoutMs: 10 * 60_000 }
  );

  // Extract a low-bitrate mono 16k WAV — best Whisper input format.
  await run(
    "ffmpeg",
    ["-y", "-i", filePath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", audioPath],
    { timeoutMs: 5 * 60_000 }
  );

  return { meta, filePath, audioPath, workDir };
}

export async function cleanupDownload(workDir: string): Promise<void> {
  if (!workDir) return;
  await fs.rm(workDir, { recursive: true, force: true });
}
