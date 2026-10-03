import { APP_NAME } from "../../i18n";

/**
 * BrandMark — the app's logo: a petrol tile with a cream roofline and three
 * ascending brass bars (property + portfolio growth). Rendered as a self-contained
 * inline SVG (same pattern as the lucide nav icons) so it carries its own colors and
 * reads correctly on both light and dark sidebars. The same artwork drives the macOS
 * app icon — see `src-tauri/icon-source.svg`.
 */
export function BrandMark({
  size = 28,
  className,
  title = APP_NAME,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={title}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <rect x="0" y="0" width="48" height="48" rx="11" fill="#16484c" />
      <polyline
        points="11,22 24,11 37,22"
        fill="none"
        stroke="#f5f3ee"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="12.5" y="31" width="5" height="7" rx="1.2" fill="#9a7b3f" />
      <rect x="21.5" y="28" width="5" height="10" rx="1.2" fill="#9a7b3f" />
      <rect x="30.5" y="25" width="5" height="13" rx="1.2" fill="#9a7b3f" />
    </svg>
  );
}
