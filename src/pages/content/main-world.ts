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
 */

const NAMESPACE = "__KOODO_PROXY__";
let _reqId = 0;

type ProxyResponse = {
  success: boolean;
  data: string;
  status: number;
  statusText?: string;
  headers: Record<string, string>;
  error?: string;
};

/** Send a proxy request via postMessage and await the response from the isolated-world bridge. */
function proxyRequest(
  payload: Record<string, unknown>,
): Promise<ProxyResponse> {
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
      const res: ProxyResponse = event.data.payload;
      if (res.success) {
        resolve(res);
      } else {
        reject(new TypeError(res.error ?? "Proxy request failed"));
      }
    }

    window.addEventListener("message", onMessage);
    window.postMessage(
      { __ns: NAMESPACE, __type: "REQ", __id: id, payload },
      "*",
    );
  });
}

// ─── Fetch Interceptor ───────────────────────────────────────────────────────

const _originalFetch = window.fetch.bind(window);

window.fetch = async function (
  ...args: Parameters<typeof fetch>
): Promise<Response> {
  const input = args[0];
  const init: RequestInit = args[1] ?? {};

  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : (input as Request).url;

  if (!url.startsWith("http")) {
    return _originalFetch(...args);
  }

  const headers: Record<string, string> = {};
  const rawHeaders = init.headers;
  if (rawHeaders instanceof Headers) {
    rawHeaders.forEach((v, k) => (headers[k] = v));
  } else if (Array.isArray(rawHeaders)) {
    (rawHeaders as [string, string][]).forEach(([k, v]) => (headers[k] = v));
  } else if (rawHeaders) {
    Object.assign(headers, rawHeaders);
  }

  try {
    const res = await proxyRequest({
      type: "PROXY_FETCH",
      url,
      options: { ...init, headers },
    });
    return new Response(res.data, { status: res.status, headers: res.headers });
  } catch {
    return _originalFetch(...args);
  }
};

// ─── XMLHttpRequest Interceptor ──────────────────────────────────────────────

const _OriginalXHR = window.XMLHttpRequest;

class ProxiedXMLHttpRequest extends _OriginalXHR {
  private _url = "";
  private _method = "GET";
  private _reqHeaders: Record<string, string> = {};

  open(method: string, url: string, ...rest: unknown[]): void {
    this._method = method;
    this._url = url;
    // @ts-ignore
    super.open(method, url, ...rest);
  }

  setRequestHeader(name: string, value: string): void {
    this._reqHeaders[name] = value;
    super.setRequestHeader(name, value);
  }

  send(body?: Document | XMLHttpRequestBodyInit | null): void {
    const url = this._url;

    if (!url.startsWith("http")) {
      super.send(body);
      return;
    }

    proxyRequest({
      type: "PROXY_XHR",
      url,
      method: this._method,
      headers: this._reqHeaders,
      body: typeof body === "string" ? body : body ? String(body) : null,
      withCredentials: this.withCredentials,
    })
      .then((response) => {
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
          get: () => response.data,
          configurable: true,
        });
        Object.defineProperty(this, "response", {
          get: () => response.data,
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
      .catch(() => {
        // Bridge not ready — fall back to native XHR (will hit CORS, but at least won't crash).
        super.send(body);
      });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).XMLHttpRequest = ProxiedXMLHttpRequest;
