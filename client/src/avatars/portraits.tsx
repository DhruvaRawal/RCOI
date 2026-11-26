/**
 * Original avatar set: ten simple court portraits drawn from shared parts.
 * Each is unique by headgear, colours and facial hair. AVATAR_COUNT in shared must match.
 */
import type { ReactNode } from 'react';

type Headgear = 'crown' | 'veil' | 'helmet' | 'turban' | 'tiara' | 'plumeTurban' | 'jester' | 'shikha' | 'bun' | 'pagdi';

interface Portrait {
  name: string;
  bg: [string, string];
  skin: string;
  hair: string;
  garment: string;
  headgear: Headgear;
  accent: string;
  mustache?: boolean;
  beard?: boolean;
  bindi?: boolean;
  tilak?: boolean;
  smile?: boolean;
}

export const PORTRAITS: Portrait[] = [
  { name: 'Maharaja', bg: ['#7a1f2d', '#3d1118'], skin: '#c68863', hair: '#2b1a12', garment: '#8c1d2c', headgear: 'crown', accent: '#e5bd62', mustache: true, beard: true, tilak: true },
  { name: 'Rajkumari', bg: ['#1c6f74', '#0a3437'], skin: '#d9a27a', hair: '#1f120c', garment: '#167a6e', headgear: 'veil', accent: '#e46aa0', bindi: true },
  { name: 'Senapati', bg: ['#4a5560', '#20262c'], skin: '#a8714e', hair: '#1a100a', garment: '#5d6772', headgear: 'helmet', accent: '#c9ced4', mustache: true },
  { name: 'Mahamantri', bg: ['#3c6b3a', '#1d351c'], skin: '#b97d57', hair: '#d8d2c6', garment: '#2f6b3a', headgear: 'turban', accent: '#f6ebd0', mustache: true, beard: true },
  { name: 'Rani', bg: ['#6a3d8f', '#2e1842'], skin: '#c68863', hair: '#120a06', garment: '#7d3fa0', headgear: 'tiara', accent: '#e5bd62', bindi: true },
  { name: 'Yodha', bg: ['#9a3b1f', '#45180b'], skin: '#8d5a3b', hair: '#140c08', garment: '#a1361c', headgear: 'plumeTurban', accent: '#f2a516', mustache: true },
  { name: 'Vidushaka', bg: ['#b8860b', '#5a3f04'], skin: '#d9a27a', hair: '#3a2416', garment: '#c99a16', headgear: 'jester', accent: '#d8434b', smile: true },
  { name: 'Purohit', bg: ['#c0651c', '#5c2c08'], skin: '#b97d57', hair: '#2b1a12', garment: '#e07b24', headgear: 'shikha', accent: '#f6ebd0', tilak: true },
  { name: 'Nartaki', bg: ['#a3305a', '#4a1027'], skin: '#a8714e', hair: '#120a06', garment: '#b8326a', headgear: 'bun', accent: '#f8e6b4', bindi: true, smile: true },
  { name: 'Gajarohi', bg: ['#2e5aa8', '#142849'], skin: '#8d5a3b', hair: '#1a100a', garment: '#2c4f94', headgear: 'pagdi', accent: '#f2a516', beard: true, mustache: true },
];

function Headwear({ p }: { p: Portrait }): ReactNode {
  const gold = '#e5bd62';
  switch (p.headgear) {
    case 'crown':
      return (
        <g>
          <path d="M35 41 C35 34 65 34 65 41 L65 44 C60 40 40 40 35 44 Z" fill={p.hair} />
          <path d="M34 38 L34 24 L39.5 30 L44.5 18 L50 28 L55.5 18 L60.5 30 L66 24 L66 38 Z" fill={gold} stroke="#8a6420" strokeWidth="0.8" />
          <rect x="33.5" y="34" width="33" height="5.5" rx="1.5" fill="#b8892e" />
          <circle cx="50" cy="36.8" r="2" fill="#c8262f" />
          <circle cx="42" cy="36.8" r="1.3" fill="#1c9bb0" />
          <circle cx="58" cy="36.8" r="1.3" fill="#1c9bb0" />
          <circle cx="44.5" cy="18" r="1.4" fill="#f8e6b4" />
          <circle cx="55.5" cy="18" r="1.4" fill="#f8e6b4" />
        </g>
      );
    case 'veil':
      return (
        <g>
          <path d="M35 38 C35 30 65 30 65 38 C60 34 40 34 35 38 Z" fill={p.hair} />
          <path d="M33 37 C35 22 65 22 67 37 C61 31 39 31 33 37 Z" fill={p.accent} opacity="0.95" />
          <path d="M33 37 C35 22 65 22 67 37" fill="none" stroke={gold} strokeWidth="1.4" strokeDasharray="0.2 2.6" strokeLinecap="round" />
          <line x1="50" y1="31" x2="50" y2="35.5" stroke={gold} strokeWidth="0.9" />
          <circle cx="50" cy="36.5" r="1.7" fill={gold} />
        </g>
      );
    case 'helmet':
      return (
        <g>
          <path d="M33.5 41 C32.5 26 41 19.5 50 19.5 C59 19.5 67.5 26 66.5 41 Z" fill="#9aa3ad" stroke="#5d6772" strokeWidth="0.8" />
          <path d="M37 27 C42 23 58 23 63 27" fill="none" stroke="#c9ced4" strokeWidth="1.2" />
          <rect x="32.5" y="38" width="35" height="4" rx="1.6" fill="#7d8792" />
          <path d="M50 19.5 L48 12 L50 5.5 L52 12 Z" fill="#c9ced4" stroke="#5d6772" strokeWidth="0.6" />
          <rect x="49" y="41" width="2" height="8" rx="1" fill="#7d8792" />
        </g>
      );
    case 'turban':
    case 'pagdi':
    case 'plumeTurban': {
      const color = p.headgear === 'turban' ? '#f1ece0' : p.headgear === 'pagdi' ? '#f08a24' : '#c8262f';
      const fold = p.headgear === 'turban' ? '#cfc6b2' : 'rgba(0,0,0,0.22)';
      const tall = p.headgear === 'pagdi';
      return (
        <g>
          <path
            d={tall ? 'M32.5 41 C30 22 40 12 50 12 C60 12 70 22 67.5 41 C61 36 39 36 32.5 41 Z' : 'M33 41 C31 25 40 17 50 17 C60 17 69 25 67 41 C61 36 39 36 33 41 Z'}
            fill={color}
          />
          <path d="M35 34 C42 28 58 28 65 34" fill="none" stroke={fold} strokeWidth="1.6" />
          <path d="M34 38.5 C42 33 58 33 66 38.5" fill="none" stroke={fold} strokeWidth="1.6" />
          <path d={tall ? 'M38 26 C44 20 56 20 62 26' : 'M38 28 C44 23 56 23 62 28'} fill="none" stroke={fold} strokeWidth="1.4" />
          <circle cx="50" cy="30" r="2.6" fill={gold} />
          <circle cx="50" cy="30" r="1.2" fill="#1c9bb0" />
          {p.headgear === 'plumeTurban' && (
            <path d="M50.5 28 C49 19 53 11 59 7 C56 14 54 21 52 28 Z" fill="#f6ebd0" stroke="#cdbb94" strokeWidth="0.5" />
          )}
          {p.headgear === 'pagdi' && <path d="M62 16 C67 14 70 18 69 23 C67 19 65 18 62 16 Z" fill={color} />}
        </g>
      );
    }
    case 'tiara':
      return (
        <g>
          <path d="M35.5 43 C33 27 42 21 50 21 C58 21 67 27 64.5 43 C62 34 56 30.5 50 30.5 C44 30.5 38 34 35.5 43 Z" fill={p.hair} />
          <path d="M38.5 28.5 L42.5 24.5 L46 27.5 L50 21.5 L54 27.5 L57.5 24.5 L61.5 28.5" fill="none" stroke={gold} strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="50" cy="22" r="1.6" fill="#c8262f" />
        </g>
      );
    case 'jester':
      return (
        <g>
          <path d="M37 37 C35 22 26 17 17 22 C24 23 29 28 31 36 Z" fill="#d8434b" />
          <path d="M63 37 C65 22 74 17 83 22 C76 23 71 28 69 36 Z" fill="#2e5aa8" />
          <path d="M35 38 C35 25 65 25 65 38 Z" fill="#f2a516" />
          <rect x="33.5" y="35.5" width="33" height="4.5" rx="2" fill="#6a3d8f" />
          <circle cx="17" cy="22.5" r="2.4" fill={gold} />
          <circle cx="83" cy="22.5" r="2.4" fill={gold} />
        </g>
      );
    case 'shikha':
      return (
        <g>
          <path d="M36 38 C37 31 63 31 64 38 C60 34.5 40 34.5 36 38 Z" fill={p.hair} opacity="0.35" />
          <circle cx="53" cy="29.5" r="2.6" fill={p.hair} />
          <path d="M54.5 28 C57 25 59 25 60.5 26.5" fill="none" stroke={p.hair} strokeWidth="1.4" />
        </g>
      );
    case 'bun':
      return (
        <g>
          <path d="M35.5 42 C33 27 42 21.5 50 21.5 C58 21.5 67 27 64.5 42 C61 33.5 39 33.5 35.5 42 Z" fill={p.hair} />
          <circle cx="64" cy="27" r="7" fill={p.hair} />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => {
            const a = (i / 7) * Math.PI * 1.5 + Math.PI * 0.6;
            return <circle key={i} cx={64 + Math.cos(a) * 7.4} cy={27 + Math.sin(a) * 7.4} r="1.5" fill="#fffaf0" />;
          })}
        </g>
      );
  }
}

export function PortraitSvg({ index, title }: { index: number; title?: string }) {
  const p = PORTRAITS[((index % PORTRAITS.length) + PORTRAITS.length) % PORTRAITS.length];
  const id = `pg${index}`;
  const longHair = p.headgear === 'tiara' || p.headgear === 'bun';
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label={title ?? p.name} className="portrait">
      <defs>
        <radialGradient id={id} cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor={p.bg[0]} />
          <stop offset="100%" stopColor={p.bg[1]} />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${id})`} />
      <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(246,235,208,0.12)" strokeWidth="1" strokeDasharray="1 3" />
      {p.headgear === 'veil' && (
        <path d="M27 100 C25 72 29 42 33 32 C37 21 44 16 50 16 C56 16 63 21 67 32 C71 42 75 72 73 100 Z" fill={p.accent} opacity="0.9" />
      )}
      {longHair && <path d="M34 44 C30 62 30 80 36 90 L64 90 C70 80 70 62 66 44 Z" fill={p.hair} />}
      {/* garment */}
      <path d="M12 100 C15 80 32 72 50 72 C68 72 85 80 88 100 Z" fill={p.garment} />
      <path d="M41 72 L50 85 L59 72" fill="none" stroke="#e5bd62" strokeWidth="1.6" />
      <path d="M37.5 75.5 Q50 92 62.5 75.5" fill="none" stroke="#f8e6b4" strokeWidth="2.6" strokeDasharray="0.1 3.4" strokeLinecap="round" />
      {/* neck, ears, face */}
      <rect x="44" y="59" width="12" height="14" rx="4" fill={p.skin} />
      <ellipse cx="36" cy="49" rx="2.3" ry="3.6" fill={p.skin} />
      <ellipse cx="64" cy="49" rx="2.3" ry="3.6" fill={p.skin} />
      <ellipse cx="50" cy="48" rx="14.2" ry="17" fill={p.skin} />
      <circle cx="36" cy="54.5" r="1.6" fill="#e5bd62" />
      <circle cx="64" cy="54.5" r="1.6" fill="#e5bd62" />
      {/* features */}
      <path d="M40.5 43.2 Q44.5 41.2 48 43" fill="none" stroke={p.hair === '#d8d2c6' ? '#7a7062' : '#2b1a12'} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M52 43 Q55.5 41.2 59.5 43.2" fill="none" stroke={p.hair === '#d8d2c6' ? '#7a7062' : '#2b1a12'} strokeWidth="1.3" strokeLinecap="round" />
      <ellipse cx="44.6" cy="47.3" rx="2" ry="1.3" fill="#24140d" />
      <ellipse cx="55.4" cy="47.3" rx="2" ry="1.3" fill="#24140d" />
      <path d="M50 47.5 Q48.4 53 50.6 54" fill="none" stroke="rgba(60,25,15,0.55)" strokeWidth="1" strokeLinecap="round" />
      <path
        d={p.smile ? 'M45.5 57.5 Q50 61.8 54.5 57.5' : 'M46.5 58.4 Q50 60 53.5 58.4'}
        fill="none"
        stroke="#6b2a22"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {p.beard && (
        <path d="M36 50 C36 63 42 70.5 50 71.5 C58 70.5 64 63 64 50 C62 58.5 57.5 62.5 50 63 C42.5 62.5 38 58.5 36 50 Z" fill={p.hair} />
      )}
      {p.mustache && (
        <path d="M50 55.4 C46 54 42 55 39.5 52.6 C40.5 57.2 46 57.8 50 56.6 C54 57.8 59.5 57.2 60.5 52.6 C58 55 54 54 50 55.4 Z" fill={p.hair} />
      )}
      {p.bindi && <circle cx="50" cy="40.5" r="1.2" fill="#c8262f" />}
      {p.tilak && (
        <g>
          <path d="M44 38 H56 M44.5 40 H55.5" stroke="#f6ebd0" strokeWidth="0.9" opacity="0.9" />
          <ellipse cx="50" cy="39" rx="0.9" ry="1.8" fill="#c8262f" />
        </g>
      )}
      <Headwear p={p} />
    </svg>
  );
}
