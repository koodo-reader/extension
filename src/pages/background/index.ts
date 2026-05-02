console.log("background script loaded");

/**
 * Method 2: Message-forwarding proxy.
 *
 * The content script (running in the isolated world) cannot directly reach the
 * page's `window` object, so we inject a tiny main-world script that hijacks
 * `fetch` / `XMLHttpRequest` and routes them through `chrome.runtime.sendMessage`.
 * The service-worker receives those messages here and issues the real request —
 * service-workers are not subject to CORS restrictions.
 */
chrome.runtime.onMessage.addListener(
  (
    request: {
      type: string;
      url: string;
      options?: RequestInit;
      // XHR-specific fields
      method?: string;
      headers?: Record<string, string>;
      body?: string | null;
      withCredentials?: boolean;
    },
    _sender,
    sendResponse,
  ) => {
    if (request.type === "PROXY_FETCH") {
      fetch(request.url, request.options)
        .then(async (res) => {
          const data = await res.text();
          // Collect response headers
          const headers: Record<string, string> = {};
          res.headers.forEach((value, key) => {
            headers[key] = value;
          });
          sendResponse({ success: true, data, status: res.status, headers });
        })
        .catch((err: Error) => {
          sendResponse({ success: false, error: err.message });
        });

      // Keep the message channel open for the async response
      return true;
    }

    if (request.type === "PROXY_XHR") {
      const { url, method = "GET", headers = {}, body = null } = request;

      fetch(url, {
        method,
        headers,
        body: body ?? undefined,
        credentials: request.withCredentials ? "include" : "omit",
      })
        .then(async (res) => {
          const data = await res.text();
          const responseHeaders: Record<string, string> = {};
          res.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });
          sendResponse({
            success: true,
            data,
            status: res.status,
            statusText: res.statusText,
            headers: responseHeaders,
          });
        })
        .catch((err: Error) => {
          sendResponse({ success: false, error: err.message });
        });

      return true;
    }
  },
);
