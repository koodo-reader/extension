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
 * The bridge starts unconditionally; main-world.ts only emits requests once
 * it detects the Koodo Reader web app (via the localStorage "appVersion"
 * marker), so on non-app pages the bridge stays idle.
 */
export {};

const NAMESPACE = "__KOODO_EXTENSION__";

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
}

startBridge();
