/**
 * main-world.ts  ("world": "MAIN")
 *
 * Runs inside the PAGE's JS context. `chrome.runtime` is NOT available here.
 *
 * Communication flow:
 *   main-world  →  window.postMessage(KOODO_REQ)  →  content/index.tsx
 *   content/index.tsx  →  chrome.runtime.sendMessage  →  background
 *   background  →  sendResponse  →  content/index.tsx
 *   content/index.tsx  →  window.postMessage(KOODO_RES)  →  main-world
 *
 * The response body is always Base64-encoded by the background so that
 * binary files (images, PDFs, ZIPs …) survive the JSON message channel intact.
 *
 * Installs fetch / XHR interceptors only when the page is a Koodo Reader web
 * app (detected via the localStorage "appVersion" marker).  On other pages
 * this script is a no-op.
 */

export {};

const NAMESPACE = "__KOODO_EXTENSION__";
let _reqId = 0;

// ─── Types ───────────────────────────────────────────────────────────────────

type FormEntry = {
  name: string;
  value: string; // plain string or Base64 file content
  isFile: boolean;
  fileName?: string;
  fileType?: string;
};

type BodyEncoding = "none" | "text" | "base64" | "formdata";

type ForwardResponse = {
  success: boolean;
  /** Always Base64-encoded by the background. */
  data: string;
  encoding: "base64";
  status: number;
  statusText?: string;
  headers: Record<string, string>;
  error?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Read a File/Blob as a raw Base64 string (no data-URL prefix). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Strip "data:<mime>;base64," prefix
      resolve(dataUrl.substring(dataUrl.indexOf(",") + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Convert a Base64 string back to a Uint8Array. */
function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Inspect a fetch/XHR body and serialise it into a form that can travel
 * through the JSON message channel.
 */
async function serializeBody(
  body: BodyInit | Document | null | undefined,
): Promise<{
  bodyEncoding: BodyEncoding;
  body?: string | null;
  formEntries?: FormEntry[];
}> {
  if (body == null) return { bodyEncoding: "none" };

  if (typeof body === "string") return { bodyEncoding: "text", body };

  if (body instanceof URLSearchParams)
    return { bodyEncoding: "text", body: body.toString() };

  if (body instanceof FormData) {
    const formEntries: FormEntry[] = [];
    for (const [name, value] of body.entries()) {
      if (value instanceof File) {
        formEntries.push({
          name,
          value: await blobToBase64(value),
          isFile: true,
          fileName: value.name,
          fileType: value.type,
        });
      } else {
        formEntries.push({ name, value: value as string, isFile: false });
      }
    }
    return { bodyEncoding: "formdata", formEntries };
  }

  if (body instanceof Blob) {
    return { bodyEncoding: "base64", body: await blobToBase64(body) };
  }

  if (body instanceof ArrayBuffer) {
    let binary = "";
    const bytes = new Uint8Array(body);
    for (let i = 0; i < bytes.byteLength; i++)
      binary += String.fromCharCode(bytes[i]);
    return { bodyEncoding: "base64", body: btoa(binary) };
  }

  if (ArrayBuffer.isView(body)) {
    let binary = "";
    const bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    for (let i = 0; i < bytes.byteLength; i++)
      binary += String.fromCharCode(bytes[i]);
    return { bodyEncoding: "base64", body: btoa(binary) };
  }

  // ReadableStream – not feasible to forward; fall back to native
  return { bodyEncoding: "none" };
}

// ─── Site Check ─────────────────────────────────────────────────────────────

/**
 * Synchronously returns true if the current page is a Koodo Reader web app.
 * Detected via the localStorage "appVersion" marker set by the web app.
 */
function siteCheckPassed(): boolean {
  const v = localStorage.getItem("appVersion");
  return v !== null && v !== "";
}

// ─── postMessage Bridge ──────────────────────────────────────────────────────

/** Send a forward request via postMessage and await the Base64 response. */
function forwardRequest(
  payload: Record<string, unknown>,
): Promise<ForwardResponse> {
  return new Promise((resolve, reject) => {
    const id = ++_reqId;

    function onMessage(event: MessageEvent) {
      if (
        event.source !== window ||
        !event.data ||
        event.data.__ns !== NAMESPACE ||
        event.data.__type !== "RES" ||
        event.data.__id !== id
      )
        return;

      window.removeEventListener("message", onMessage);
      const res: ForwardResponse = event.data.payload;
      if (res.success) {
        resolve(res);
      } else {
        reject(new TypeError(res.error ?? "Forward request failed"));
      }
    }

    window.addEventListener("message", onMessage);
    window.postMessage(
      { __ns: NAMESPACE, __type: "REQ", __id: id, payload },
      "*",
    );
  });
}

// ─── Forward Blacklist ───────────────────────────────────────────────────────

/**
 * Domains (and their subdomains) whose requests should bypass the forward
 * and use the native fetch / XHR directly.
 */
const FORWARD_BLACKLIST = [
  "koodoreader.com",
  "koodoreader.cn",
  "960960.xyz",
  "chatwoot.com",
];

/** Check whether a URL matches a blacklisted domain or any of its subdomains. */
function isBlacklisted(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return FORWARD_BLACKLIST.some(
      (domain) => hostname === domain || hostname.endsWith("." + domain),
    );
  } catch {
    return false;
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────

/**
 * Install fetch / XHR interceptors and fetch the enabled-sites cache.
 * Only called when the current site is confirmed as allowed (auto or manual).
 */
function initMainWorld(): void {
  // ── Fetch Interceptor ──────────────────────────────────────────────

  const _originalFetch = window.fetch.bind(window);

  window.fetch = async function (
    ...args: Parameters<typeof fetch>
  ): Promise<Response> {
    // Only forward for auto-enabled or manually-enabled sites
    if (!siteCheckPassed()) return _originalFetch(...args);
    const input = args[0];
    const init: RequestInit = args[1] ?? {};

    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;

    if (!url.startsWith("http")) return _originalFetch(...args);

    // Bypass forward for blacklisted domains
    if (isBlacklisted(url)) return _originalFetch(...args);

    // Serialise request headers
    // When input is a Request object, its headers (e.g. AWS signature) must be
    // read first; init.headers are merged on top so they win on conflict.
    const reqHeaders: Record<string, string> = {};
    if (input instanceof Request) {
      input.headers.forEach((v, k) => (reqHeaders[k] = v));
    }
    const rawHeaders = init.headers;
    if (rawHeaders instanceof Headers) {
      rawHeaders.forEach((v, k) => (reqHeaders[k] = v));
    } else if (Array.isArray(rawHeaders)) {
      (rawHeaders as [string, string][]).forEach(
        ([k, v]) => (reqHeaders[k] = v),
      );
    } else if (rawHeaders) {
      Object.assign(reqHeaders, rawHeaders);
    }

    // When input is a Request object, fall back to its method/body if init does
    // not supply them (AWS SDK v3 puts everything on the Request object).
    const effectiveMethod =
      init.method ?? (input instanceof Request ? input.method : "GET");

    // ReadableStream cannot cross the JSON channel — read it as ArrayBuffer first.
    // This also ensures content-length stays consistent with what AWS SDK signed.
    let rawBody: BodyInit | null | undefined;
    if (init.body !== undefined) {
      rawBody = init.body as BodyInit | null | undefined;
    } else if (input instanceof Request && input.body !== null) {
      rawBody = await input.clone().arrayBuffer();
    }

    // Serialise request body
    const { bodyEncoding, body, formEntries } = await serializeBody(rawBody);

    try {
      const res = await forwardRequest({
        type: "FORWARD_FETCH",
        url,
        method: effectiveMethod,
        headers: reqHeaders,
        bodyEncoding,
        body,
        formEntries,
      });
      if (res.data === "") {
        return new Response(null, {
          status: res.status,
          statusText: res.statusText ?? "",
          headers: res.headers,
        });
      }

      // Decode Base64 response body back to binary
      const bytes = base64ToUint8Array(res.data);
      return new Response(bytes.buffer as ArrayBuffer, {
        status: res.status,
        headers: res.headers,
      });
    } catch (err) {
      // Do NOT fall back to the native fetch – that would send the request
      // from the page origin and trigger a CORS block.  Surface the error.
      throw err;
    }
  };

  // ── XMLHttpRequest Interceptor ────────────────────────────────────

  const _OriginalXHR = window.XMLHttpRequest;

  class ForwardedXMLHttpRequest extends _OriginalXHR {
    private _url = "";
    private _method = "GET";
    private _reqHeaders: Record<string, string> = {};
    private _responseType_: XMLHttpRequestResponseType = "";

    open(method: string, url: string, ...rest: unknown[]): void {
      this._method = method;
      this._url = url;
      // @ts-ignore
      super.open(method, url, ...rest);
    }

    set responseType(value: XMLHttpRequestResponseType) {
      this._responseType_ = value;
      try {
        super.responseType = value;
      } catch {
        /* ignore */
      }
    }
    get responseType(): XMLHttpRequestResponseType {
      return this._responseType_;
    }

    setRequestHeader(name: string, value: string): void {
      this._reqHeaders[name] = value;
      super.setRequestHeader(name, value);
    }

    send(body?: Document | XMLHttpRequestBodyInit | null): void {
      if (!siteCheckPassed()) {
        super.send(body);
        return;
      }

      const url = this._url;

      if (!url.startsWith("http")) {
        super.send(body);
        return;
      }

      // Bypass forward for blacklisted domains
      if (isBlacklisted(url)) {
        super.send(body);
        return;
      }

      const responseType = this._responseType_;

      serializeBody(body as BodyInit | null | undefined)
        .then((serialized) =>
          forwardRequest({
            type: "FORWARD_XHR",
            url,
            method: this._method,
            headers: this._reqHeaders,
            ...serialized,
            withCredentials: this.withCredentials,
          }),
        )
        .then((response) => {
          // Decode the Base64 response into the right type
          const bytes = base64ToUint8Array(response.data);

          let decodedResponse: unknown;
          let decodedText: string;

          // Build text via TextDecoder for accuracy
          decodedText = new TextDecoder().decode(bytes);

          switch (responseType) {
            case "arraybuffer":
              decodedResponse = bytes.buffer;
              break;
            case "blob":
              decodedResponse = new Blob([bytes.buffer as ArrayBuffer], {
                type:
                  response.headers["content-type"] ??
                  "application/octet-stream",
              });
              break;
            case "json":
              try {
                decodedResponse = JSON.parse(decodedText);
              } catch {
                decodedResponse = null;
              }
              break;
            default:
              decodedResponse = decodedText;
          }

          Object.defineProperty(this, "readyState", {
            get: () => 4,
            configurable: true,
          });
          Object.defineProperty(this, "status", {
            get: () => response.status,
            configurable: true,
          });
          Object.defineProperty(this, "statusText", {
            get: () => response.statusText ?? "",
            configurable: true,
          });
          Object.defineProperty(this, "responseText", {
            get: () => decodedText,
            configurable: true,
          });
          Object.defineProperty(this, "response", {
            get: () => decodedResponse,
            configurable: true,
          });
          Object.defineProperty(this, "getAllResponseHeaders", {
            value: () =>
              Object.entries(response.headers)
                .map(([k, v]) => `${k}: ${v}`)
                .join("\r\n"),
            configurable: true,
          });

          this.dispatchEvent(new Event("readystatechange"));
          this.dispatchEvent(new ProgressEvent("load"));
          this.dispatchEvent(new ProgressEvent("loadend"));
          if (typeof this.onreadystatechange === "function")
            this.onreadystatechange(new Event("readystatechange"));
          if (typeof this.onload === "function")
            this.onload(new ProgressEvent("load"));
        })
        .catch((err) => {
          // Do NOT fall back to super.send() – that fires a real XHR from the
          // page origin and causes a CORS preflight failure.  Instead, dispatch
          // an error event so the caller receives a proper network error.
          Object.defineProperty(this, "readyState", {
            get: () => 4,
            configurable: true,
          });
          Object.defineProperty(this, "status", {
            get: () => 0,
            configurable: true,
          });
          Object.defineProperty(this, "statusText", {
            get: () => "",
            configurable: true,
          });
          this.dispatchEvent(new Event("readystatechange"));
          this.dispatchEvent(new ProgressEvent("error"));
          this.dispatchEvent(new ProgressEvent("loadend"));
          if (typeof this.onreadystatechange === "function")
            this.onreadystatechange(new Event("readystatechange"));
          if (typeof this.onerror === "function")
            this.onerror(new ProgressEvent("error"));
          console.error("[koodo] XHR forward failed, request not retried:", err);
        });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).XMLHttpRequest = ForwardedXMLHttpRequest;
}

// ─── Startup ─────────────────────────────────────────────────────────────────
//
// This script runs at document_start, before the page's own JS has had a
// chance to write the "appVersion" marker into localStorage.  So we poll for
// it: once the Koodo Reader web app sets the marker, we install the fetch/XHR
// interceptors.  If the marker never appears (this page isn't the web app),
// we give up after the timeout and stay inert.

const APP_VERSION_POLL_INTERVAL_MS = 50;
const APP_VERSION_POLL_TIMEOUT_MS = 10_000;

function startWhenAppReady(): void {
  if (siteCheckPassed()) {
    initMainWorld();
    return;
  }

  const deadline = Date.now() + APP_VERSION_POLL_TIMEOUT_MS;
  const timer = setInterval(() => {
    if (siteCheckPassed()) {
      clearInterval(timer);
      initMainWorld();
    } else if (Date.now() > deadline) {
      clearInterval(timer);
    }
  }, APP_VERSION_POLL_INTERVAL_MS);
}

startWhenAppReady();
