/** Injected via chrome.scripting.executeScript (must be self-contained). */
export function readPageContextInTab(): {
  url: string;
  title: string;
  hasAppVersion: boolean;
} {
  const v = localStorage.getItem("appVersion");
  return {
    url: location.href,
    title: document.title,
    hasAppVersion: v !== null && v !== "",
  };
}
