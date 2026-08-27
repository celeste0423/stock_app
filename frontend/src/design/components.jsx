import React from "react";

function joinClasses(...values) {
  return values.filter(Boolean).join(" ");
}

const iconPaths = {
  external: [
    <path key="a" d="M14 3h7v7" />,
    <path key="b" d="M10 14 21 3" />,
    <path key="c" d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />,
  ],
  menu: [
    <path key="a" d="M4 6h16" />,
    <path key="b" d="M4 12h16" />,
    <path key="c" d="M4 18h16" />,
  ],
  moon: <path d="M20.5 14.1A8.4 8.4 0 0 1 9.9 3.5 8.5 8.5 0 1 0 20.5 14.1Z" />,
  refresh: [
    <path key="a" d="M20 6v5h-5" />,
    <path key="b" d="M4 18v-5h5" />,
    <path key="c" d="M6.1 9A7 7 0 0 1 17.7 6.4L20 11" />,
    <path key="d" d="M17.9 15A7 7 0 0 1 6.3 17.6L4 13" />,
  ],
  search: [
    <circle key="a" cx="11" cy="11" r="7" />,
    <path key="b" d="m20 20-4-4" />,
  ],
  sun: [
    <circle key="a" cx="12" cy="12" r="4" />,
    <path key="b" d="M12 2v2" />,
    <path key="c" d="M12 20v2" />,
    <path key="d" d="m4.9 4.9 1.4 1.4" />,
    <path key="e" d="m17.7 17.7 1.4 1.4" />,
    <path key="f" d="M2 12h2" />,
    <path key="g" d="M20 12h2" />,
    <path key="h" d="m6.3 17.7-1.4 1.4" />,
    <path key="i" d="m19.1 4.9-1.4 1.4" />,
  ],
};

export function Icon({ name, size = 18, className, title }) {
  return (
    <svg
      aria-hidden={title ? undefined : "true"}
      className={joinClasses("ui-icon", className)}
      fill="none"
      height={size}
      role={title ? "img" : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
      viewBox="0 0 24 24"
      width={size}
    >
      {title ? <title>{title}</title> : null}
      {iconPaths[name] || iconPaths.external}
    </svg>
  );
}

export function Button({
  as,
  children,
  className,
  icon,
  iconAfter,
  size,
  variant = "secondary",
  ...props
}) {
  const Element = as || (props.href ? "a" : "button");
  const legacyClass = variant === "primary" ? "primary-button" : variant === "mini" ? "mini-button" : "secondary-button";
  return (
    <Element
      {...props}
      className={joinClasses("ui-button", legacyClass, size && `ui-button-${size}`, className)}
      type={Element === "button" ? props.type || "button" : undefined}
    >
      {icon ? <Icon name={icon} size={size === "small" ? 15 : 17} /> : null}
      <span className="ui-button-label">{children}</span>
      {iconAfter ? <Icon name={iconAfter} size={size === "small" ? 15 : 17} /> : null}
    </Element>
  );
}

export function Badge({ children, className, tone = "neutral" }) {
  return <span className={joinClasses("ui-badge", "status-pill", `ui-badge-${tone}`, className)}>{children}</span>;
}

export function EmptyState({ children, className, compact, message }) {
  return (
    <div className={joinClasses("ui-empty-state", "empty-state", compact && "compact", className)}>
      <span className="ui-empty-state-mark" aria-hidden="true" />
      <span className="ui-empty-state-message">{children || message}</span>
    </div>
  );
}

export function LoadingBlock({ className, compact, detail, label, title }) {
  return (
    <div className={joinClasses("ui-loading-block", "loading-block", compact && "compact", className)}>
      <div className="loading-block-head">
        <strong>{title || "데이터를 불러오는 중입니다."}</strong>
        <span>{label || "잠시만 기다려 주세요."}</span>
      </div>
      <div className="loading-bar indeterminate">
        <span />
      </div>
      {detail ? <div className="loading-detail">{detail}</div> : null}
    </div>
  );
}

export function MetricCard({ className, help, label, value }) {
  return (
    <div className={joinClasses("ui-metric-card", "summary-card", className)}>
      <div className="summary-label">{label}</div>
      <div className="summary-value">{value}</div>
      {help ? <div className="summary-help">{help}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, className }) {
  return <div className={joinClasses("ui-section-title", "section-title", className)}>{children}</div>;
}

export function NoticeBox({ children, className, compact, message, tone = "neutral" }) {
  return (
    <div className={joinClasses("ui-notice-box", "notice-box", compact && "compact", tone !== "neutral" && tone, className)}>
      {children || message}
    </div>
  );
}

export function registerDesignSystem() {
  window.StockAppUI = Object.freeze({ Badge, Button, EmptyState, Icon, LoadingBlock, MetricCard, NoticeBox, SectionTitle });
}
