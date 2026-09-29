type BrandVariant = "primary" | "black" | "reverse" | "icon";

export function BrandLogo({
  variant = "primary",
  className = "",
}: {
  variant?: BrandVariant;
  className?: string;
}) {
  const reverse = variant === "reverse";
  const black = variant === "black";
  const iconOnly = variant === "icon";
  const outline = reverse ? "rgba(255,255,255,.76)" : black ? "#4b5563" : "#aebcc0";
  const primary = reverse ? "#ffffff" : black ? "#111111" : "#17212b";
  const accent = reverse ? "#ffffff" : black ? "#111111" : "#008080";

  return (
    <span className={`brand-logo brand-logo-${variant} ${className}`.trim()} aria-label="LeaveCtrl">
      <svg className="brand-mark" viewBox="0 0 42 42" aria-hidden="true" focusable="false">
        {[2, 15, 28].flatMap((x) =>
          [2, 15, 28].map((y) => {
            const centre = x === 15 && y === 15;
            const partial = x === 28 && y === 28;
            return (
              <g key={`${x}-${y}`}>
                <rect x={x} y={y} width="11" height="11" rx="2.2"
                  fill={centre ? accent : "transparent"}
                  stroke={centre ? accent : outline} strokeWidth="1.6" />
                {partial ? <path d="M29.2 37.8 L37.8 29.2 L37.8 37.8 Z" fill={accent} /> : null}
              </g>
            );
          })
        )}
      </svg>
      {!iconOnly ? (
        <span className="brand-wordmark" aria-hidden="true">
          <span className="brand-word-leave" style={{ color: primary }}>Leave</span>
          <span className="brand-word-ctrl" style={{ color: accent }}>Ctrl</span>
        </span>
      ) : null}
    </span>
  );
}
