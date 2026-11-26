/** A classic meeple in the owner's colour. Shown only on cards that can be challenged. */
export function Meeple({ color, label, size = 22 }: { color: string; label?: string; size?: number }) {
  return (
    <svg className="meeple" viewBox="0 0 40 40" width={size} height={size} role="img" aria-label={label ?? 'meeple'}>
      <path
        d="M20 3.5c3.6 0 6 2.6 6 5.9 0 2.2-1 3.6-2.2 4.6 4.5 1.1 12.7 3.6 12.7 7.4 0 2.4-3.4 2.9-6.5 2.4l4.6 10.4c.6 1.4-.3 2.3-1.6 2.3h-7.8L20 29.1l-5.2 7.4H7c-1.3 0-2.2-.9-1.6-2.3l4.6-10.4c-3.1.5-6.5 0-6.5-2.4 0-3.8 8.2-6.3 12.7-7.4C15 13 14 11.6 14 9.4c0-3.3 2.4-5.9 6-5.9z"
        fill={color}
        stroke="#1e080c"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M16.5 8.5c.8-1.6 2.6-2.3 4.4-1.9" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
