import { useEffect, useState } from "react";
import { localEngineClient } from "../lib/localEngine/client.ts";
import type { LocalEngineConnectionStatus } from "../lib/localEngine/types.ts";
import { createBrowserOnlyStatus } from "../lib/localEngine/capabilities.ts";

const DEFAULT_POLL_MS = 15000;

export function useLocalEngineStatus(pollMs: number = DEFAULT_POLL_MS) {
  const [status, setStatus] = useState<LocalEngineConnectionStatus>(createBrowserOnlyStatus());
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      setIsChecking(true);
      const nextStatus = await localEngineClient.probeConnection();
      if (!cancelled) {
        setStatus(nextStatus);
        setIsChecking(false);
      }
    }

    void refresh();
    const intervalId = window.setInterval(() => {
      void refresh();
    }, pollMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [pollMs]);

  return { status, isChecking };
}
