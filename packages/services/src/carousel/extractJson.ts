/** Extract JSON from a Claude/LLM text response. Port of one/src/utils/extractJson.js */
export function extractJson<T = unknown>(text: string): T {
  if (typeof text !== "string") throw new Error("extractJson: input non-string");

  try {
    return JSON.parse(text) as T;
  } catch {}

  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try {
      return JSON.parse(codeBlock[1].trim()) as T;
    } catch {}
  }

  const firstArrayStart = text.indexOf("[");
  const firstObjStart = text.indexOf("{");
  let start = -1;
  let openChar = "";
  let closeChar = "";

  if (firstArrayStart !== -1 && (firstObjStart === -1 || firstArrayStart < firstObjStart)) {
    start = firstArrayStart;
    openChar = "[";
    closeChar = "]";
  } else if (firstObjStart !== -1) {
    start = firstObjStart;
    openChar = "{";
    closeChar = "}";
  }

  if (start !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (c === "\\") {
          escape = true;
          continue;
        }
        if (c === '"') inString = false;
        continue;
      }
      if (c === '"') {
        inString = true;
        continue;
      }
      if (c === openChar) depth++;
      else if (c === closeChar) {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(start, i + 1);
          try {
            return JSON.parse(candidate) as T;
          } catch {}
          break;
        }
      }
    }
  }

  throw new Error("extractJson: impossible de parser la réponse comme JSON");
}
