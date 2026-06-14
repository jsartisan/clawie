/**
 * The Clawie claw mark — three tapered ink slashes. Inherits color via
 * currentColor so it works on any surface. Canonical source of the paths:
 * assets/brand/clawie-mark.svg.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <g fill="currentColor" transform="translate(-5.75 0)">
        <path d="M 16 14 A 4.2 4.2 0 0 1 24.2 15.5 C 23 27, 24.5 38, 30 48 C 21.5 39.5, 15.5 27, 16 14 Z" />
        <path
          d="M 16 11 A 4.4 4.4 0 0 1 24.6 12.5 C 23.3 25.5, 25 39, 31 50 C 21.8 40.5, 15.4 25.5, 16 11 Z"
          transform="translate(15 0)"
        />
        <path
          d="M 16 14 A 4.2 4.2 0 0 1 24.2 15.5 C 23 27, 24.5 38, 30 48 C 21.5 39.5, 15.5 27, 16 14 Z"
          transform="translate(30 0)"
        />
      </g>
    </svg>
  );
}
