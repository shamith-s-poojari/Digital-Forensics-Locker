/**
 * ForensicsLocker logo mark: a shield (the locker) holding two interlocked links (the chain of custody).
 * Drawn on a 24px grid in the same stroke style as the lucide icons used across the app, so it sits
 * naturally next to them. public/favicon.svg uses the same paths.
 *
 * @param {object} [props]
 * @param {number} [props.size=18]
 * @param {number} [props.strokeWidth=1.9]
 */
export default function BrandMark({ size = 18, strokeWidth = 1.9 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 2.5 19.5 5.5v5.8c0 4.6-3.1 8.4-7.5 10.2-4.4-1.8-7.5-5.6-7.5-10.2V5.5Z" />
      <rect x="7.1" y="9.6" width="6" height="4" rx="2" transform="rotate(-45 10.1 11.6)" />
      <rect x="10.9" y="9.6" width="6" height="4" rx="2" transform="rotate(-45 13.9 11.6)" />
    </svg>
  );
}
