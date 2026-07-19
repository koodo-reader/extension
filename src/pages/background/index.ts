// Restore the badge on startup (the service worker may have been evicted).
refreshBadge();

// ─── Pending Host Authorization ───────────────────────────────────────────────
//
// User-configured WebDAV/S3 hosts that the extension has been asked to forward
// to but does not yet have host permission for. Stored as normalized origins
// (e.g. "https://nas.example.com:5005"). The popup lets the user grant each
// origin via chrome.permissions.request (must run in a user-gesture context).

const PENDING_HOSTS_KEY = "pendingHosts";

/** Normalize a raw URL string into a web origin (scheme://host[:port]). */
function normalizeOrigin(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.origin === "null") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Convert an origin into the match pattern chrome.permissions expects. */
function originToPattern(origin: string): string {
  return origin + "/*";
}

async function getPendingHosts(): Promise<string[]> {
  const { pendingHosts } = await chrome.storage.sync.get(PENDING_HOSTS_KEY);
  return pendingHosts ?? [];
}

async function setPendingHosts(list: string[]): Promise<void> {
  await chrome.storage.sync.set({ [PENDING_HOSTS_KEY]: list });
}

async function addPendingHost(origin: string): Promise<void> {
  const list = await getPendingHosts();
  if (!list.includes(origin)) {
    list.push(origin);
    await setPendingHosts(list);
  }
}

async function removePendingHost(origin: string): Promise<void> {
  const list = (await getPendingHosts()).filter((h) => h !== origin);
  await setPendingHosts(list);
}

/** True when the extension already holds host permission for this origin. */
function hasHostPermission(origin: string): Promise<boolean> {
  return chrome.permissions.contains({ origins: [originToPattern(origin)] });
}

/** Refresh the toolbar badge to reflect the pending-host count. */
async function refreshBadge(): Promise<void> {
  try {
    const count = (await getPendingHosts()).length;
    if (count > 0) {
      await chrome.action.setBadgeText({ text: String(count) });
      await chrome.action.setBadgeBackgroundColor({ color: "#e53935" });
    } else {
      await chrome.action.setBadgeText({ text: "" });
    }
  } catch {
    // Action API may be unavailable in some contexts (e.g. Firefox); ignore.
  }
}

/** Reverse of originToPattern: recover an origin from a match pattern. */
function patternToOrigin(pattern: string): string | null {
  // Only concrete origins (e.g. "https://host:port/*") round-trip back to a
  // single origin; wildcard patterns are ignored.
  const match = pattern.match(/^(https?:\/\/[^/*]+)\/\*$/);
  if (!match) return null;
  try {
    return new URL(match[1]).origin;
  } catch {
    return null;
  }
}

// The popup is torn down by Chrome while the permissions dialog is open, so the
// popup's post-grant callback may never fire. Listen for grants here and clean
// up the pending list + badge from the service worker instead.
chrome.permissions.onAdded.addListener((permissions) => {
  const origins = (permissions.origins ?? [])
    .map(patternToOrigin)
    .filter((o): o is string => o !== null);
  if (origins.length === 0) return;
  Promise.all(origins.map(removePendingHost))
    .then(refreshBadge)
    .catch(() => {});
});

// ─── External Message Bridge (from the Koodo Reader web app) ─────────────────
//
// The web app runs on *.koodoreader.{com,cn} (declared in externally_connectable)
// and asks the extension to authorize a user-configured storage host by sending
// { type: "REQUEST_NEW_HOST", origin } via chrome.runtime.sendMessage(extensionId).
chrome.runtime.onMessageExternal.addListener(
  (message, _sender, sendResponse) => {
    if (message?.type !== "REQUEST_NEW_HOST") return false;
    (async () => {
      const origin = normalizeOrigin(message.origin);
      if (!origin) {
        sendResponse({ success: false, error: "INVALID_ORIGIN" });
        return;
      }
      if (await hasHostPermission(origin)) {
        sendResponse({ success: true, status: "already_granted" });
        return;
      }
      await addPendingHost(origin);
      await refreshBadge();
      sendResponse({ success: true, status: "pending" });
    })();
    return true; // keep channel open for async sendResponse
  },
);

// ─── Message Handlers ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === "OPEN_IMPORT_URL") {
    (async () => {
      try {
        if (request.tabId == null) {
          sendResponse({ success: false, error: "Missing tabId" });
          return;
        }
        await chrome.tabs.update(request.tabId, { url: request.url });
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return true;
  }

  if (request.type === "GET_PENDING_HOSTS") {
    getPendingHosts()
      .then((pendingHosts) => sendResponse({ success: true, pendingHosts }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.type === "REMOVE_PENDING_HOST") {
    removePendingHost(request.origin)
      .then(() => refreshBadge())
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.type === "CHECK_HOST_PERMISSION") {
    const origin = normalizeOrigin(request.origin);
    if (!origin) {
      sendResponse({ success: false, error: "INVALID_ORIGIN" });
      return true;
    }
    hasHostPermission(origin)
      .then((granted) => sendResponse({ success: true, granted }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Forward fetch/XHR (existing logic)
  if (request.type !== "FORWARD_FETCH" && request.type !== "FORWARD_XHR")
    return;

  // Before forwarding, check that we hold host permission for the target
  // origin. If not, record it as pending authorization and tell the main
  // world to fall back to the native fetch/XHR path — the service worker
  // fetch would be rejected anyway, and the page can still try directly
  // (CORS permitting).
  const origin = normalizeOrigin(request.url);
  hasHostPermission(origin ?? "")
    .then(async (granted) => {
      if (granted) {
        try {
          sendResponse(await executeForward(request));
        } catch (err: any) {
          sendResponse({ success: false, error: err.message });
        }
        return;
      }
      if (origin) {
        await addPendingHost(origin);
        await refreshBadge();
      }
      sendResponse({ success: false, fallback: "native" });
    })
    .catch((err: Error) => {
      sendResponse({ success: false, error: err.message });
    });
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

type ForwardMessage = {
  type: "FORWARD_FETCH" | "FORWARD_XHR";
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
  /** Legacy: FORWARD_FETCH used to pass the whole RequestInit here. */
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
  msg: ForwardMessage,
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
 * Execute the forwarded request and return a serialisable result.
 * The response body is always returned as Base64 so that binary files
 * (images, PDFs, ZIPs …) survive the JSON message channel intact.
 */
async function executeForward(msg: ForwardMessage) {
  const method =
    msg.method ?? (msg.options as RequestInit | undefined)?.method ?? "GET";
  const headers: Record<string, string> = {
    ...(msg.options?.headers as Record<string, string> | undefined),
    ...msg.headers,
  };

  // The Fetch API forbids credentials embedded in URLs (throws TypeError).
  // Extract them and convert to an Authorization header so the service
  // worker can forward WebDAV requests that use user:pass@host style URLs.
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
