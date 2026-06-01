/** True when the page is running inside a Reader web app (localStorage marker). */
export function hasAppVersion(): boolean {
  const v = localStorage.getItem("appVersion");
  return v !== null && v !== "";
}

/** Injected into tabs via chrome.scripting.executeScript (must be self-contained). */
export function checkAppVersionInPage(): boolean {
  const v = localStorage.getItem("appVersion");
  return v !== null && v !== "";
}
