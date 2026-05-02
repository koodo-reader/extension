console.log("background script loaded");

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single serialised FormData field sent from the main world. */
type FormEntry = {
  name: string;
  /** Plain string value, or Base64-encoded file content. */
  value: string;
  isFile: boolean;
  fileName?: string;
  fileType?: string;
};

type ProxyMessage = {
  type: "PROXY_FETCH" | "PROXY_XHR";
  url: string;
  method?: string;
  headers?: Record<string, string>;
  /**
   * How the request body is encoded:
   *   'none'      – no body
   *   'text'      – plain string (JSON, URL-encoded, etc.)
   *   'base64'    – binary body encoded as Base64
   *   'formdata'  – FormData serialised into `formEntries`
   */
  bodyEncoding: "none" | "text" | "base64" | "formdata";
  body?: string | null;
  formEntries?: FormEntry[];
  withCredentials?: boolean;
  /** Legacy: PROXY_FETCH used to pass the whole RequestInit here. */
  options?: RequestInit & { headers?: Record<string, string> };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert an ArrayBuffer to a Base64 string (Service Worker has no FileReader). */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Reconstruct the BodyInit that should be sent to the real server.
 * FormData entries that contain files are decoded from Base64 via a data-URL
 * fetch, which is the only way to get a Blob inside a Service Worker.
 */
async function buildRequestBody(
  msg: ProxyMessage,
): Promise<BodyInit | null | undefined> {
  switch (msg.bodyEncoding) {
    case "none":
      return undefined;

    case "text":
      return msg.body ?? undefined;

    case "base64": {
      if (!msg.body) return undefined;
      const binary = atob(msg.body);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }

    case "formdata": {
      const formData = new FormData();
      for (const entry of msg.formEntries ?? []) {
        if (entry.isFile) {
          // Re-hydrate the file from its Base64 data URL
          const res = await fetch(
            `data:${entry.fileType ?? "application/octet-stream"};base64,${entry.value}`,
          );
          const blob = await res.blob();
          formData.append(entry.name, blob, entry.fileName ?? entry.name);
        } else {
          formData.append(entry.name, entry.value);
        }
      }
      return formData;
    }
  }
}

/**
 * Execute the proxied request and return a serialisable result.
 * The response body is always returned as Base64 so that binary files
 * (images, PDFs, ZIPs …) survive the JSON message channel intact.
 */
async function executeProxy(msg: ProxyMessage) {
  const method =
    msg.method ?? (msg.options as RequestInit | undefined)?.method ?? "GET";
  const headers: Record<string, string> =
    msg.headers ??
    (msg.options?.headers as Record<string, string> | undefined) ??
    {};

  const body = await buildRequestBody(msg);

  const res = await fetch(msg.url, {
    method,
    headers,
    body,
    credentials: msg.withCredentials ? "include" : "omit",
  });

  const arrayBuffer = await res.arrayBuffer();
  const base64 = arrayBufferToBase64(arrayBuffer);

  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    success: true,
    /** Always Base64-encoded. */
    data: base64,
    encoding: "base64" as const,
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
  };
}

// ─── Message Listener ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (request: ProxyMessage, _sender, sendResponse) => {
    if (request.type !== "PROXY_FETCH" && request.type !== "PROXY_XHR") return;

    executeProxy(request)
      .then(sendResponse)
      .catch((err: Error) =>
        sendResponse({ success: false, error: err.message }),
      );

    // Keep the message channel open for the async response.
    return true;
  },
);
