import { useEffect, useState } from "react";
import { readPageContextInTab } from "../../utils/pageContext";

/** Minimal i18n helper using Chrome's built-in i18n API. */
function t(key: string, fallback: string): string {
  try {
    const msg = chrome.i18n.getMessage(key);
    return msg || fallback;
  } catch {
    return fallback;
  }
}

type SiteStatus = {
  hostname: string;
  autoSite: boolean;
  manuallyEnabled: boolean;
  enabled: boolean;
};

type TabInfo = {
  id: number;
  title: string;
  url: string;
};

type PageMode = "auto" | "proxy" | "save";

function getHostname(url: string): string {
  try {
    const u = new URL(url);
    return u.host;
  } catch {
    return url;
  }
}

function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function buildImportSchemeUrl(pageUrl: string): string {
  return `koodo-reader://import-url?importUrl=${encodeURIComponent(pageUrl)}`;
}

export default function Popup() {
  const [status, setStatus] = useState<SiteStatus | null>(null);
  const [tabInfo, setTabInfo] = useState<TabInfo | null>(null);
  const [pageMode, setPageMode] = useState<PageMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (tab?.id == null) {
        setError(t("errNoPageInfo", "Unable to get current page info"));
        setLoading(false);
        return;
      }

      let pageUrl: string;
      let pageTitle: string;
      let hasAppVersion: boolean;

      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: readPageContextInTab,
        });
        const ctx = result?.result;
        if (!ctx?.url) {
          setError(t("errNoPageInfo", "Unable to get current page info"));
          setLoading(false);
          return;
        }
        pageUrl = ctx.url;
        pageTitle = ctx.title;
        hasAppVersion = ctx.hasAppVersion;
      } catch {
        setError(t("errCannotAccessPage", "Cannot access this page"));
        setLoading(false);
        return;
      }

      const hostname = getHostname(pageUrl);
      setTabInfo({
        id: tab.id,
        title: pageTitle || hostname,
        url: pageUrl,
      });

      const statusPromise = new Promise<SiteStatus>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "GET_SITE_STATUS", hostname },
          (response) => {
            if (response?.success) {
              resolve({ hostname, ...response });
            } else {
              reject(
                new Error(
                  response?.error ?? t("errGetStatus", "Failed to get status"),
                ),
              );
            }
          },
        );
      });

      try {
        const siteStatus = await statusPromise;
        setStatus(siteStatus);

        if (siteStatus.autoSite) {
          setPageMode("auto");
          setLoading(false);
          return;
        }

        if (!isHttpUrl(pageUrl)) {
          setError(t("errCannotAccessPage", "Cannot access this page"));
          setLoading(false);
          return;
        }

        setPageMode(hasAppVersion ? "proxy" : "save");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t("errGetStatus", "Failed to get status"),
        );
      }
      setLoading(false);
    });
  }, []);

  const handleToggle = async () => {
    if (!status) return;
    setToggling(true);
    setError(null);

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) {
      setError(t("errNoTab", "Unable to get current tab"));
      setToggling(false);
      return;
    }

    const reloadTab = () => chrome.tabs.reload(tab.id!);

    if (status.enabled && !status.autoSite) {
      chrome.runtime.sendMessage(
        { type: "DISABLE_SITE", hostname: status.hostname },
        (response) => {
          if (response?.success) {
            setStatus({ ...status, manuallyEnabled: false, enabled: false });
            reloadTab();
          } else {
            setError(
              response?.error ?? t("errOperationFailed", "Operation failed"),
            );
          }
          setToggling(false);
        },
      );
    } else if (!status.enabled) {
      chrome.runtime.sendMessage(
        { type: "ENABLE_SITE", hostname: status.hostname, tabId: tab.id },
        (response) => {
          if (response?.success) {
            setStatus({ ...status, manuallyEnabled: true, enabled: true });
            reloadTab();
          } else if (response?.error === "NO_APP_VERSION") {
            setError(
              t(
                "errNoAppVersion",
                "This page is not a Koodo Reader web app",
              ),
            );
          } else {
            setError(
              response?.error ?? t("errOperationFailed", "Operation failed"),
            );
          }
          setToggling(false);
        },
      );
    } else {
      setToggling(false);
    }
  };

  const handleSave = () => {
    if (!tabInfo || saving) return;
    setSaving(true);
    setError(null);
    const schemeUrl = buildImportSchemeUrl(tabInfo.url);

    chrome.runtime.sendMessage(
      { type: "OPEN_IMPORT_URL", url: schemeUrl, tabId: tabInfo.id },
      (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          // Popup cannot use <a>.click() for custom schemes; fall back to
          // navigating the extension page, which Chrome treats as a top-level open.
          window.location.assign(schemeUrl);
          setSaving(false);
          return;
        }
        window.close();
      },
    );
  };

  const footerHint =
    pageMode === "save"
      ? t(
          "saveFooterHint",
          "Save this page to read in Koodo Reader desktop app",
        )
      : pageMode === "proxy"
        ? t("footerHint", "Other sites need to be manually enabled")
        : pageMode === "auto"
          ? null
          : null;

  return (
    <div className="flex flex-col h-full p-4 bg-gray-900 text-white">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-3 h-3 rounded-full bg-blue-500" />
        <h1 className="text-base font-semibold">
          {t("extName", "Koodo Reader")}
        </h1>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-red-400 text-sm text-center px-2">
          {error}
        </div>
      ) : pageMode === "save" && tabInfo ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="mb-3 min-h-0">
            <div className="text-xs text-gray-400 mb-1">
              {t("pageTitle", "Page title")}
            </div>
            <div
              className="text-sm bg-gray-800 rounded px-2 py-1 line-clamp-2"
              title={tabInfo.title}
            >
              {tabInfo.title}
            </div>
          </div>
          <div className="mb-4 min-h-0 flex-1">
            <div className="text-xs text-gray-400 mb-1">
              {t("pageUrl", "Page URL")}
            </div>
            <div
              className="text-xs font-mono bg-gray-800 rounded px-2 py-1 break-all max-h-24 overflow-y-auto"
              title={tabInfo.url}
            >
              {tabInfo.url}
            </div>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2 px-4 rounded text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving
              ? t("btnProcessing", "Processing...")
              : t("btnSave", "Save to Koodo Reader")}
          </button>
        </div>
      ) : status && pageMode === "proxy" ? (
        <div className="flex-1 flex flex-col">
          <div className="mb-3">
            <div className="text-xs text-gray-400 mb-1">
              {t("currentSite", "Current Site")}
            </div>
            <div className="text-sm font-mono bg-gray-800 rounded px-2 py-1 truncate">
              {status.hostname}
            </div>
          </div>
          <div className="mb-4">
            <div className="text-xs text-gray-400 mb-1">
              {t("status", "Status")}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  status.enabled ? "bg-green-500" : "bg-gray-500"
                }`}
              />
              <span className="text-sm">
                {status.manuallyEnabled
                  ? t("statusManuallyEnabled", "Manually enabled")
                  : t("statusDisabled", "Disabled")}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggle}
            disabled={toggling}
            className={`w-full py-2 px-4 rounded text-sm font-medium transition-colors cursor-pointer ${
              status.enabled
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {toggling
              ? t("btnProcessing", "Processing...")
              : status.enabled
                ? t("btnDisable", "Disable this site")
                : t("btnEnable", "Enable on this site")}
          </button>
        </div>
      ) : status && pageMode === "auto" ? (
        <div className="flex-1 flex flex-col">
          <div className="mb-3">
            <div className="text-xs text-gray-400 mb-1">
              {t("currentSite", "Current Site")}
            </div>
            <div className="text-sm font-mono bg-gray-800 rounded px-2 py-1 truncate">
              {status.hostname}
            </div>
          </div>
          <div className="mb-4">
            <div className="text-xs text-gray-400 mb-1">
              {t("status", "Status")}
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm">
                {t("statusAutoEnabled", "Auto-enabled")}
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {t("autoSiteHint", "This site is auto-whitelisted")}
            </div>
          </div>
          <div className="text-xs text-gray-500 text-center mt-2">
            {t("autoSiteRunning", "Service runs automatically on this site")}
          </div>
        </div>
      ) : null}

      {footerHint && (
        <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-500 text-center">
          {footerHint}
        </div>
      )}
    </div>
  );
}
