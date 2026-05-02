import { useEffect, useState } from "react";

type SiteStatus = {
  hostname: string;
  autoSite: boolean;
  manuallyEnabled: boolean;
  enabled: boolean;
};

function getHostname(url: string): string {
  try {
    const u = new URL(url);
    return u.host;
  } catch {
    return url;
  }
}

export default function Popup() {
  const [status, setStatus] = useState<SiteStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Get current tab info
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.url) {
        setError("无法获取当前页面信息");
        setLoading(false);
        return;
      }

      const hostname = getHostname(tab.url);

      // Ask background for site status
      chrome.runtime.sendMessage(
        { type: "GET_SITE_STATUS", hostname },
        (response) => {
          if (response?.success) {
            setStatus({ hostname, ...response });
          } else {
            setError(response?.error ?? "获取状态失败");
          }
          setLoading(false);
        },
      );
    });
  }, []);

  const handleToggle = async () => {
    if (!status) return;
    setToggling(true);
    setError(null);

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) {
      setError("无法获取当前标签页");
      setToggling(false);
      return;
    }

    if (status.enabled && !status.autoSite) {
      // Disable
      chrome.runtime.sendMessage(
        { type: "DISABLE_SITE", hostname: status.hostname },
        (response) => {
          if (response?.success) {
            setStatus({ ...status, manuallyEnabled: false, enabled: false });
          } else {
            setError(response?.error ?? "操作失败");
          }
          setToggling(false);
        },
      );
    } else if (!status.enabled) {
      // Enable
      chrome.runtime.sendMessage(
        { type: "ENABLE_SITE", hostname: status.hostname, tabId: tab.id },
        (response) => {
          if (response?.success) {
            setStatus({ ...status, manuallyEnabled: true, enabled: true });
          } else {
            setError(response?.error ?? "操作失败");
          }
          setToggling(false);
        },
      );
    } else {
      setToggling(false);
    }
  };

  return (
    <div className="flex flex-col h-full p-4 bg-gray-900 text-white">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-3 h-3 rounded-full bg-blue-500" />
        <h1 className="text-base font-semibold">Koodo Reader Proxy</h1>
      </div>

      {/* Status */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-red-400 text-sm">
          {error}
        </div>
      ) : status ? (
        <div className="flex-1 flex flex-col">
          {/* Site info */}
          <div className="mb-3">
            <div className="text-xs text-gray-400 mb-1">当前站点</div>
            <div className="text-sm font-mono bg-gray-800 rounded px-2 py-1 truncate">
              {status.hostname}
            </div>
          </div>

          {/* Status badge */}
          <div className="mb-4">
            <div className="text-xs text-gray-400 mb-1">状态</div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  status.enabled ? "bg-green-500" : "bg-gray-500"
                }`}
              />
              <span className="text-sm">
                {status.autoSite
                  ? "自动启用"
                  : status.manuallyEnabled
                    ? "已手动启用"
                    : "未启用"}
              </span>
            </div>
            {status.autoSite && (
              <div className="text-xs text-gray-500 mt-1">
                该站点已自动加入白名单
              </div>
            )}
          </div>

          {/* Toggle button (not for auto sites that are already enabled) */}
          {!status.autoSite && (
            <button
              onClick={handleToggle}
              disabled={toggling}
              className={`w-full py-2 px-4 rounded text-sm font-medium transition-colors ${
                status.enabled
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {toggling
                ? "处理中..."
                : status.enabled
                  ? "禁用此站点"
                  : "在此站点启用"}
            </button>
          )}

          {/* Manual enable hint for auto sites */}
          {status.autoSite && (
            <div className="text-xs text-gray-500 text-center mt-2">
              代理功能在此站点上自动运行
            </div>
          )}
        </div>
      ) : null}

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-500 text-center">
        其他站点需要手动点击启用
      </div>
    </div>
  );
}
