console.log("background script loaded");

// ─── Site Management ─────────────────────────────────────────────────────────

const AUTO_SITES = [
  "localhost:3000",
  "web.koodoreader.com",
  "web.koodoreader.cn",
];

/** Get the set of manually enabled sites from storage. */
async function getEnabledSites(): Promise<string[]> {
  const { enabledSites } = await chrome.storage.sync.get("enabledSites");
  return enabledSites ?? [];
}

/** Check if a hostname is auto-enabled. */
function isAutoSite(hostname: string): boolean {
  return AUTO_SITES.some(
    (site) => hostname === site || hostname.endsWith("." + site),
  );
}

/** Inject the extension content scripts into a tab. */
async function injectContentScripts(tabId: number): Promise<void> {
  // Read content script paths from the built manifest
  const manifest = chrome.runtime.getManifest();
  const csList = manifest.content_scripts ?? [];

  const mainWorldCS = csList.find(
    (cs) => (cs as { world?: string }).world === "MAIN",
  );
  const isolatedCS = csList.find((cs) => !(cs as { world?: string }).world);

  const injectMain = mainWorldCS?.js ?? [];
  const injectBridge = isolatedCS?.js ?? [];
  const injectCSS = isolatedCS?.css ?? [];

  try {
    if (injectMain.length > 0) {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        files: injectMain,
      });
    }
    if (injectBridge.length > 0) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: injectBridge,
      });
    }
    for (const css of injectCSS) {
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: [css],
      });
    }
    console.log(`[koodo] Injected content scripts into tab ${tabId}`);
  } catch (err) {
    console.error("[koodo] Injection failed:", err);
  }
}

// ─── Auto-reinjection on navigation ──────────────────────────────────────────

/** Extract hostname (host:port) from a URL string. */
function extractHostname(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

// Re-inject content scripts when a tab navigates to a manually-enabled site
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading" || !tab.url) return;
  const hostname = extractHostname(tab.url);
  if (!hostname || isAutoSite(hostname)) return; // auto sites inject via manifest

  getEnabledSites().then((sites) => {
    if (sites.includes(hostname)) {
      injectContentScripts(tabId);
    }
  });
});

// ─── Message Handlers ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  // Site enable/disable from popup
  if (request.type === "ENABLE_SITE") {
    getEnabledSites()
      .then(async (sites) => {
        if (!sites.includes(request.hostname)) {
          sites.push(request.hostname);
          await chrome.storage.sync.set({ enabledSites: sites });
        }
        // Inject into the current tab
        await injectContentScripts(request.tabId);
        sendResponse({ success: true, enabled: true });
      })
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open
  }

  if (request.type === "DISABLE_SITE") {
    getEnabledSites()
      .then(async (sites) => {
        const filtered = sites.filter((s) => s !== request.hostname);
        await chrome.storage.sync.set({ enabledSites: filtered });
        sendResponse({ success: true, enabled: false });
      })
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.type === "GET_SITE_STATUS") {
    const autoSite = isAutoSite(request.hostname);
    getEnabledSites()
      .then((sites) => {
        const manuallyEnabled = sites.includes(request.hostname);
        sendResponse({
          success: true,
          autoSite,
          manuallyEnabled,
          enabled: autoSite || manuallyEnabled,
        });
      })
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Proxy fetch/XHR (existing logic)
  if (request.type !== "PROXY_FETCH" && request.type !== "PROXY_XHR") return;

  executeProxy(request)
    .then(sendResponse)
    .catch((err: Error) =>
      sendResponse({ success: false, error: err.message }),
    );
  return true;
});

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
 * Strip embedded credentials (user:pass) from a URL and return them
 * as a Basic Authorization header value so that the Fetch API does not
 * throw a TypeError (credentials in URLs are forbidden by the spec).
 */
function extractCredentials(rawUrl: string): {
  cleanUrl: string;
  authHeader: string | null;
} {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { cleanUrl: rawUrl, authHeader: null };
  }

  const { username, password } = parsed;
  if (!username && !password) {
    return { cleanUrl: rawUrl, authHeader: null };
  }

  // Build the Basic auth header value
  const credentials = `${decodeURIComponent(username)}:${decodeURIComponent(password)}`;
  const authHeader = "Basic " + btoa(credentials);

  // Remove credentials from the URL
  parsed.username = "";
  parsed.password = "";
  return { cleanUrl: parsed.toString(), authHeader };
}

/**
 * Execute the proxied request and return a serialisable result.
 * The response body is always returned as Base64 so that binary files
 * (images, PDFs, ZIPs …) survive the JSON message channel intact.
 */
async function executeProxy(msg: ProxyMessage) {
  const method =
    msg.method ?? (msg.options as RequestInit | undefined)?.method ?? "GET";
  const headers: Record<string, string> = {
    ...(msg.options?.headers as Record<string, string> | undefined),
    ...msg.headers,
  };

  // The Fetch API forbids credentials embedded in URLs (throws TypeError).
  // Extract them and convert to an Authorization header so the service
  // worker can proxy WebDAV requests that use user:pass@host style URLs.
  const { cleanUrl, authHeader } = extractCredentials(msg.url);
  if (authHeader && !headers["authorization"] && !headers["Authorization"]) {
    headers["Authorization"] = authHeader;
  }

  const body = await buildRequestBody(msg);

  const res = await fetch(cleanUrl, {
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
