"use client";

import { useEffect, useRef } from "react";

export type JobStreamEvent =
  | { type: "ready"; at: number }
  | { type: "started"; queue: string; jobId: string; kind: string; payload?: unknown; at: number }
  | { type: "progress"; queue: string; jobId: string; progress: number; at: number }
  | { type: "completed"; queue: string; jobId: string; result?: unknown; at: number }
  | { type: "failed"; queue: string; jobId: string; error: string; at: number }
  | { type: "image:updated"; imageId: number; status: string; at: number };

export function useJobsStream(onEvent: (evt: JobStreamEvent) => void): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const es = new EventSource("/api/jobs/stream");
    const handle = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as JobStreamEvent;
        handlerRef.current(data);
      } catch {
        /* ignore */
      }
    };
    es.addEventListener("message", handle);
    es.addEventListener("ready", handle);
    es.onerror = () => {
      /* browser auto-reconnects */
    };
    return () => {
      es.close();
    };
  }, []);
}
