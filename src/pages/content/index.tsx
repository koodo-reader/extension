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
import { hasAppVersion } from "../../utils/appVersion";

export {};

const NAMESPACE = "__KOODO_EXTENSION__";
const AUTO_SITES = ["web.koodoreader.com", "web.koodoreader.cn"];

function isAutoSite(hostname: string): boolean {
  return AUTO_SITES.some(
    (site) => hostname === site || hostname.endsWith("." + site),
  );
}

function startBridge(): void {
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
    if ((enabledSites ?? []).includes(_hostname) && hasAppVersion()) {
      startBridge();
    }
  });
}
