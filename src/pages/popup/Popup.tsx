import { useEffect, useState, type ReactNode } from "react";
import { readPageContextInTab } from "../../utils/pageContext";

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

// ─── SVG Icons ───────────────────────────────────────────────────────────────

function IconBook({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function IconCheck({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconDownload({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconZap({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconAlert({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

// ─── Primitive UI components ──────────────────────────────────────────────────

type IconBoxVariant = "dark" | "orange" | "danger" | "muted";

function IconBox({
  children,
  variant = "dark",
}: {
  children: ReactNode;
  variant?: IconBoxVariant;
}) {
  const styles: Record<IconBoxVariant, string> = {
    dark: "bg-app-ink text-white",
    orange: "bg-app-orange text-white",
    danger: "bg-app-danger text-white",
    muted: "bg-app-paper border border-app-border text-app-muted",
  };
  return (
    <div
      className={`w-10 h-10 rounded-app-xl flex items-center justify-center shrink-0 ${styles[variant]}`}
    >
      {children}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full py-2.5 px-5 rounded-full text-sm font-medium bg-app-ink text-white hover:bg-app-ink/90 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-app-card flex items-center justify-center gap-2"
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
}

function OutlineButton({
  children,
  onClick,
  disabled,
  variant = "default",
  icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
  icon?: ReactNode;
}) {
  const styles =
    variant === "danger"
      ? "border-app-danger/40 text-app-danger hover:bg-app-danger-bg"
      : "border-app-border text-app-ink hover:bg-app-paper";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-2.5 px-5 rounded-full text-sm font-medium bg-app-surface border active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${styles}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
}

function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-app-surface border border-app-border rounded-app-2xl p-4 shadow-app-card ${className}`}
    >
      {children}
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold text-app-muted uppercase tracking-widest">
        {label}
      </div>
      <div className="text-sm text-app-ink bg-app-paper/60 border border-app-border rounded-xl px-3 py-2 leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function CardHeader({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      {icon}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-app-ink leading-snug">
          {title}
        </p>
        <p className="text-xs text-app-muted leading-snug mt-0.5">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

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
              t("errNoAppVersion", "This page is not a Koodo Reader web app"),
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
        : null;

  return (
    <div className="flex flex-col bg-app-cream text-app-ink rounded-2xl overflow-hidden">
      {/* ── Content ── */}
      <div className="flex-1 flex flex-col p-4 gap-3">
        {loading ? (
          /* Loading */
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <div className="w-12 h-12 rounded-app-xl bg-app-surface border border-app-border shadow-app-card flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-app-orange border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-xs text-app-muted">
              {t("loading", "Loading…")}
            </p>
          </div>
        ) : error ? (
          /* Error */
          <Card>
            <div className="flex items-start gap-3">
              <IconBox variant="danger">
                <IconAlert />
              </IconBox>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-sm font-semibold text-app-ink mb-1">
                  {t("errTitle", "Something went wrong")}
                </p>
                <p className="text-xs text-app-body leading-relaxed">
                  {error}
                </p>
              </div>
            </div>
          </Card>
        ) : pageMode === "save" && tabInfo ? (
          /* Save mode */
          <>
            <Card>
              <CardHeader
                icon={
                  <IconBox variant="dark">
                    <IconDownload />
                  </IconBox>
                }
                title={t("btnSave", "Save to Koodo Reader")}
                subtitle={t(
                  "saveSubtitle",
                  "Import this page into your library",
                )}
              />
              <div className="space-y-3">
                <MetaRow label={t("pageTitle", "Page title")}>
                  <span className="line-clamp-2" title={tabInfo.title}>
                    {tabInfo.title}
                  </span>
                </MetaRow>
                <MetaRow label={t("pageUrl", "Page URL")}>
                  <span
                    className="font-mono text-[11px] text-app-body break-all"
                    title={tabInfo.url}
                  >
                    {tabInfo.url}
                  </span>
                </MetaRow>
              </div>
            </Card>
            <PrimaryButton
              onClick={handleSave}
              disabled={saving}
              icon={<IconDownload size={15} />}
            >
              {saving
                ? t("btnProcessing", "Processing...")
                : t("btnSave", "Save to Koodo Reader")}
            </PrimaryButton>
          </>
        ) : status && pageMode === "proxy" ? (
          /* Proxy mode */
          <>
            <Card>
              <CardHeader
                icon={
                  <IconBox variant={status.enabled ? "orange" : "muted"}>
                    <IconZap />
                  </IconBox>
                }
                title={t("proxyTitle", "Proxy Mode")}
                subtitle={
                  status.enabled
                    ? t("proxyActive", "Network proxy is active")
                    : t("proxyInactive", "Network proxy is disabled")
                }
              />
              <div className="space-y-3">
                <MetaRow label={t("currentSite", "Current Site")}>
                  <span className="font-mono text-[11px] text-app-body">
                    {status.hostname}
                  </span>
                </MetaRow>
                <div className="flex items-center gap-2 px-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      status.enabled
                        ? "bg-app-orange shadow-[0_0_0_3px_rgb(242_139_48/0.2)]"
                        : "bg-app-muted/40"
                    }`}
                  />
                  <span className="text-xs text-app-body">
                    {status.manuallyEnabled
                      ? t("statusManuallyEnabled", "Manually enabled")
                      : t("statusDisabled", "Disabled")}
                  </span>
                </div>
              </div>
            </Card>
            {status.enabled ? (
              <OutlineButton
                onClick={handleToggle}
                disabled={toggling}
                variant="danger"
              >
                {toggling
                  ? t("btnProcessing", "Processing...")
                  : t("btnDisable", "Disable this site")}
              </OutlineButton>
            ) : (
              <PrimaryButton
                onClick={handleToggle}
                disabled={toggling}
                icon={<IconZap size={15} />}
              >
                {toggling
                  ? t("btnProcessing", "Processing...")
                  : t("btnEnable", "Enable on this site")}
              </PrimaryButton>
            )}
          </>
        ) : status && pageMode === "auto" ? (
          /* Auto mode */
          <>
            <Card>
              <CardHeader
                icon={
                  <IconBox variant="dark">
                    <IconCheck />
                  </IconBox>
                }
                title={t("statusAutoEnabled", "Auto-enabled")}
                subtitle={t("autoSiteHint", "This site is auto-whitelisted")}
              />
              <MetaRow label={t("currentSite", "Current Site")}>
                <span className="font-mono text-[11px] text-app-body">
                  {status.hostname}
                </span>
              </MetaRow>
            </Card>
            <Card className="flex items-center gap-3">
              <IconBox variant="orange">
                <IconBook />
              </IconBox>
              <p className="text-xs text-app-body leading-relaxed">
                {t(
                  "autoSiteRunning",
                  "Service runs automatically on this site",
                )}
              </p>
            </Card>
          </>
        ) : null}
      </div>

      {/* ── Footer hint ── */}
      {footerHint && (
        <footer className="px-4 pb-4 pt-3 text-[11px] text-app-muted text-center leading-relaxed border-t border-app-border/60 mt-auto">
          {footerHint}
        </footer>
      )}
    </div>
  );
}
