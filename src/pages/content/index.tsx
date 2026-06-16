/**
 * content/index.tsx  (isolated world)
 *
 * Acts as a postMessage ↔ chrome.runtime.sendMessage bridge:
 *   - Listens for KOODO_REQ messages posted by main-world.ts (MAIN world)
 *   - Forwards them to background/index.ts via chrome.runtime.sendMessage
 *   - Posts the response back to the page via window.postMessage (KOODO_RES)
 *
 * `chrome.runtime` is only available in this isolated world, not in MAIN.
 *
 * Only activates on auto-enabled or manually-enabled sites.  On other sites
 * the bridge stays silent and main-world.ts will not install interceptors.
 */
export {};

const NAMESPACE = "__KOODO_EXTENSION__";
const AUTO_SITES = ["web.koodoreader.com", "web.koodoreader.cn"];

function isAutoSite(hostname: string): boolean {
  return AUTO_SITES.some(
    (site) => hostname === site || hostname.endsWith("." + site),
  );
}

function startBridge(): void {
  // ── Map: requestId → metadata for chunked transfers ──────────────────
  const pendingChunked = new Map<
    string,
    {
      __id: number;
      status: number;
      statusText: string;
      headers: Record<string, string>;
    }
  >();

  // ── Port listener: receives chunked transfer data from background ────
  chrome.runtime.onConnect.addListener((port) => {
    if (!port.name.startsWith("chunked-")) return;

    const requestId = port.name.slice("chunked-".length);
    const entry = pendingChunked.get(requestId);
    if (entry == null) {
      console.warn("[koodo] chunked port for unknown requestId:", requestId);
      port.disconnect();
      return;
    }
    const { __id, status, statusText, headers } = entry;

    // Accumulate chunks as they arrive
    interface ChunkMsg {
      type: "chunk" | "done";
      index?: number;
      data?: string;
      totalChunks?: number;
    }

    const chunks: Record<number, string> = {};
    let totalChunks = 0;

    port.onMessage.addListener((msg: ChunkMsg) => {
      if (msg.type === "chunk") {
        chunks[msg.index!] = msg.data!;
      } else if (msg.type === "done") {
        totalChunks = msg.totalChunks ?? 0;
      }
    });

    port.onDisconnect.addListener(() => {
      // Reassemble the full Base64 string
      let fullData = "";
      for (let i = 0; i < totalChunks; i++) {
        fullData += chunks[i] ?? "";
      }

      // Post the complete response back to main-world (matches forwardRequest)
      window.postMessage(
        {
          __ns: NAMESPACE,
          __type: "RES",
          __id,
          payload: {
            success: true,
            data: fullData,
            encoding: "base64",
            status,
            statusText,
            headers,
          },
        },
        "*",
      );

      pendingChunked.delete(requestId);
    });
  });

  // ── Message bridge: REQ → chrome.runtime.sendMessage ────────────────
  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      !event.data ||
      event.data.__ns !== NAMESPACE ||
      event.data.__type !== "REQ"
    )
      return;

    const { __id, payload } = event.data;

    chrome.runtime.sendMessage(payload, (response) => {
      // Chunked response: store the mapping + metadata; the port listener handles RES
      if (response?.useChunked) {
        pendingChunked.set(response.requestId, {
          __id,
          status: response.status,
          statusText: response.statusText ?? "",
          headers: response.headers ?? {},
        });
        return;
      }

      // Normal (small) response: post directly
      window.postMessage(
        { __ns: NAMESPACE, __type: "RES", __id, payload: response },
        "*",
      );
    });
  });

  // Signal main-world.ts that the bridge is ready
  window.postMessage(
    { __ns: NAMESPACE, __type: "BRIDGE_READY" },
    "*",
  );

  try {
    console.log("[koodo-extension] isolated content script (bridge) loaded");
  } catch (e) {
    console.error(e);
  }
}

// ─── Startup check ───────────────────────────────────────────────────────────

const _hostname = location.host;

if (isAutoSite(_hostname)) {
  // Auto-enabled site – start immediately
  startBridge();
} else {
  // Check whether this site is manually enabled
  chrome.storage.sync.get("enabledSites", ({ enabledSites }) => {
    if ((enabledSites ?? []).includes(_hostname)) {
      startBridge();
    }
  });
}
