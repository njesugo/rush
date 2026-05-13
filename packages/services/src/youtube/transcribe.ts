import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { TranscriptSegment } from "@rush/db";

/**
 * Groq Whisper API (OpenAI-compatible).
 * Free tier: large-v3-turbo recommended for speed; 25MB upload cap.
 */
const GROQ_BASE = "https://api.groq.com/openai/v1";
const MODEL = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo";

/** Hard cap from Groq: 25MB. We compress to mp3 64kbps mono → ~480 KB/min. */
const GROQ_MAX_BYTES = 25 * 1024 * 1024;
/** Conservative chunk: 20 minutes per request keeps audio < ~10 MB. */
const CHUNK_SECONDS = 20 * 60;

interface GroqVerboseResponse {
  text: string;
  duration?: number;
  segments?: Array<{
    id?: number;
    start: number;
    end: number;
    text: string;
  }>;
  words?: Array<{ word: string; start: number; end: number }>;
}

function run(cmd: string, args: string[], timeoutMs = 5 * 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (b) => (err += b.toString()));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${cmd} timed out`));
    }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`${cmd} exited ${code}: ${err.slice(0, 400)}`));
      resolve();
    });
  });
}

async function compressToMp3(inputWav: string, outputMp3: string): Promise<void> {
  await run("ffmpeg", [
    "-y",
    "-i",
    inputWav,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "64k",
    "-c:a",
    "libmp3lame",
    outputMp3,
  ]);
}

async function sliceMp3(inputMp3: string, startS: number, durationS: number, outputMp3: string): Promise<void> {
  await run("ffmpeg", [
    "-y",
    "-ss",
    String(startS),
    "-t",
    String(durationS),
    "-i",
    inputMp3,
    "-c",
    "copy",
    outputMp3,
  ]);
}

async function callGroq(filePath: string, language?: string): Promise<GroqVerboseResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  const buf = await fs.readFile(filePath);
  if (buf.byteLength > GROQ_MAX_BYTES) {
    throw new Error(`audio too large for Groq (${buf.byteLength} > ${GROQ_MAX_BYTES})`);
  }

  const form = new FormData();
  form.append("file", new Blob([buf], { type: "audio/mpeg" }), path.basename(filePath));
  form.append("model", MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  if (language) form.append("language", language);

  const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Groq Whisper ${res.status}: ${txt.slice(0, 300)}`);
  }
  return (await res.json()) as GroqVerboseResponse;
}

export interface TranscribeOptions {
  /** ISO-639-1 hint, e.g. "fr" or "en". Auto-detect if omitted. */
  language?: string;
}

/**
 * Transcribe a WAV file to segments via Groq Whisper. Handles >25MB by
 * chunking into 20-minute mp3 slices and stitching results.
 */
export async function transcribeAudio(
  wavPath: string,
  opts: TranscribeOptions = {}
): Promise<TranscriptSegment[]> {
  const dir = path.dirname(wavPath);
  const base = path.basename(wavPath, path.extname(wavPath));
  const fullMp3 = path.join(dir, `${base}.mp3`);
  await compressToMp3(wavPath, fullMp3);

  const stat = await fs.stat(fullMp3);
  if (stat.size <= GROQ_MAX_BYTES) {
    const out = await callGroq(fullMp3, opts.language);
    return (out.segments ?? []).map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }));
  }

  // Need chunking — probe duration via ffprobe-less trick: encode duration into name later.
  // We rely on yt-dlp metadata duration provided by caller via the wav file's silence duration
  // is not strictly necessary; estimate via mp3 size and bitrate.
  // Simpler: re-run ffmpeg to read duration.
  const durationS = await probeDurationS(fullMp3);

  const segmentsAll: TranscriptSegment[] = [];
  let offset = 0;
  let idx = 0;
  while (offset < durationS) {
    const sliceLen = Math.min(CHUNK_SECONDS, durationS - offset);
    const slicePath = path.join(dir, `${base}.${idx}.mp3`);
    await sliceMp3(fullMp3, offset, sliceLen, slicePath);
    const out = await callGroq(slicePath, opts.language);
    for (const s of out.segments ?? []) {
      segmentsAll.push({
        start: +(s.start + offset).toFixed(3),
        end: +(s.end + offset).toFixed(3),
        text: s.text.trim(),
      });
    }
    await fs.rm(slicePath, { force: true });
    offset += sliceLen;
    idx += 1;
  }

  return segmentsAll;
}

function probeDurationS(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    let out = "";
    let err = "";
    child.stdout.on("data", (b) => (out += b.toString()));
    child.stderr.on("data", (b) => (err += b.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}: ${err}`));
      const n = parseFloat(out.trim());
      if (!Number.isFinite(n)) return reject(new Error(`ffprobe parse failed: ${out}`));
      resolve(n);
    });
  });
}
