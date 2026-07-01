// Ragnarok Online Boss Monster icons — one per menu slot
// viewBox 24x24, mixed fill+stroke pixel-art style

const b: React.SVGProps<SVGSVGElement> = {
  width: 24, height: 24, viewBox: '0 0 24 24',
  xmlns: 'http://www.w3.org/2000/svg',
};

// Dashboard → Poring (pink blob mascot)
export const RoMap = () => (
  <svg {...b}>
    {/* body */}
    <ellipse cx="12" cy="14" rx="8" ry="7" fill="#FF88BB" stroke="#CC5580" strokeWidth="0.6"/>
    {/* antenna */}
    <line x1="12" y1="7" x2="12" y2="4" stroke="#FF88BB" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="12" cy="3" r="2" fill="#FF88BB" stroke="#CC5580" strokeWidth="0.6"/>
    {/* X eyes */}
    <path d="M9 12.5l1.4 1.4M10.4 12.5L9 13.9" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M13 12.5l1.4 1.4M14.4 12.5L13 13.9" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
    {/* blush */}
    <ellipse cx="8" cy="15.5" rx="1.8" ry="1" fill="#FF5599" opacity="0.45"/>
    <ellipse cx="16" cy="15.5" rx="1.8" ry="1" fill="#FF5599" opacity="0.45"/>
    {/* smile */}
    <path d="M10 17.5q2 1.2 4 0" stroke="#CC5580" strokeWidth="0.8" fill="none" strokeLinecap="round"/>
  </svg>
);

// Strategy → Baphomet (demon lord)
export const RoSword = () => (
  <svg {...b}>
    {/* horns */}
    <path d="M7 9C5 6 6 2 8 4" stroke="#5A3070" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
    <path d="M17 9C19 6 18 2 16 4" stroke="#5A3070" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
    {/* head */}
    <ellipse cx="12" cy="13" rx="7" ry="7" fill="#3A2050" stroke="#7A50A0" strokeWidth="0.8"/>
    {/* glowing eyes */}
    <circle cx="9.5" cy="12" r="1.8" fill="#FF2020"/>
    <circle cx="14.5" cy="12" r="1.8" fill="#FF2020"/>
    <circle cx="9.5" cy="12" r="0.8" fill="#FF8888"/>
    <circle cx="14.5" cy="12" r="0.8" fill="#FF8888"/>
    {/* skull teeth */}
    <path d="M8.5 16.5h7" stroke="#B090D0" strokeWidth="0.8"/>
    <path d="M10 16.5v2M12 16.5v2M14 16.5v2" stroke="#B090D0" strokeWidth="0.8" strokeLinecap="round"/>
    {/* nose */}
    <path d="M11 14.5h2" stroke="#7A50A0" strokeWidth="0.7" strokeLinecap="round"/>
  </svg>
);

// Rule Filter → Orc Lord (green orc)
export const RoScroll = () => (
  <svg {...b}>
    {/* helmet */}
    <path d="M5 11C5 6 8 3 12 3s7 3 7 8" fill="#5A7830" stroke="#3A5010" strokeWidth="0.7"/>
    <path d="M4 11h16" stroke="#3A5010" strokeWidth="1.2"/>
    {/* horns on helmet */}
    <path d="M7 8L5 4M17 8L19 4" stroke="#8A9040" strokeWidth="1.5" strokeLinecap="round"/>
    {/* face */}
    <ellipse cx="12" cy="16" rx="7" ry="6" fill="#6AAA40" stroke="#3A5010" strokeWidth="0.7"/>
    {/* angry eyes */}
    <ellipse cx="9.5" cy="14.5" rx="1.5" ry="1.2" fill="#FF6020"/>
    <ellipse cx="14.5" cy="14.5" rx="1.5" ry="1.2" fill="#FF6020"/>
    {/* brow furrow */}
    <path d="M8 12.5l3 1.5M16 12.5l-3 1.5" stroke="#3A5010" strokeWidth="0.9"/>
    {/* tusks */}
    <path d="M10 19.5L9 22M14 19.5L15 22" stroke="#FFFAEE" strokeWidth="1.5" strokeLinecap="round"/>
    {/* nose */}
    <ellipse cx="12" cy="17" rx="2" ry="1.2" fill="#4A8030"/>
    <circle cx="11" cy="17" r="0.5" fill="#3A5010"/>
    <circle cx="13" cy="17" r="0.5" fill="#3A5010"/>
  </svg>
);

// Live Chart → Moonlight Flower (nine-tail fox)
export const RoCrystal = () => (
  <svg {...b}>
    {/* ears */}
    <path d="M7 8L5 2l4 4z" fill="#F0A0B0" stroke="#C07080" strokeWidth="0.5"/>
    <path d="M17 8L19 2l-4 4z" fill="#F0A0B0" stroke="#C07080" strokeWidth="0.5"/>
    <path d="M7 8L6 4l2.5 3z" fill="#FFDDEE"/>
    <path d="M17 8L18 4l-2.5 3z" fill="#FFDDEE"/>
    {/* head */}
    <ellipse cx="12" cy="14" rx="8" ry="7.5" fill="#F8C8D4" stroke="#C07080" strokeWidth="0.7"/>
    {/* eyes - slanted */}
    <ellipse cx="9" cy="12.5" rx="1.8" ry="1.3" fill="#C040A0" transform="rotate(-10 9 12.5)"/>
    <ellipse cx="15" cy="12.5" rx="1.8" ry="1.3" fill="#C040A0" transform="rotate(10 15 12.5)"/>
    <ellipse cx="9" cy="12.5" rx="0.7" ry="0.9" fill="#1A0820"/>
    <ellipse cx="15" cy="12.5" rx="0.7" ry="0.9" fill="#1A0820"/>
    <circle cx="9.5" cy="12" r="0.4" fill="white" opacity="0.8"/>
    <circle cx="15.5" cy="12" r="0.4" fill="white" opacity="0.8"/>
    {/* nose */}
    <ellipse cx="12" cy="15" rx="1" ry="0.6" fill="#D06080"/>
    {/* whiskers */}
    <path d="M5 14.5h5M14 14.5h5" stroke="#C07080" strokeWidth="0.5" opacity="0.7"/>
    <path d="M5 16h4.5M14.5 16h4.5" stroke="#C07080" strokeWidth="0.5" opacity="0.5"/>
    {/* mouth */}
    <path d="M11 16.5q1 0.8 2 0" stroke="#C07080" strokeWidth="0.7" fill="none" strokeLinecap="round"/>
  </svg>
);

// Backtest Replay → Osiris (mummy pharaoh)
export const RoHourglass = () => (
  <svg {...b}>
    {/* crown/nemes headdress */}
    <path d="M5 10h14v-3l-2-4H7L5 7z" fill="#C8A020" stroke="#906010" strokeWidth="0.6"/>
    <path d="M5 10l-2 8h3M19 10l2 8h-3" fill="#C8A020" stroke="#906010" strokeWidth="0.6"/>
    {/* stripes on headdress */}
    <path d="M5 8h14M5 9.5h14" stroke="#1A1200" strokeWidth="0.4" opacity="0.5"/>
    {/* face */}
    <rect x="7" y="10" width="10" height="11" rx="2" fill="#E8D890" stroke="#906010" strokeWidth="0.6"/>
    {/* bandage lines */}
    <path d="M7 12h10M7 14h10M7 16h10" stroke="#C8B060" strokeWidth="0.6" opacity="0.6"/>
    {/* eyes - glowing */}
    <ellipse cx="9.5" cy="13" rx="1.3" ry="1" fill="#20C0FF"/>
    <ellipse cx="14.5" cy="13" rx="1.3" ry="1" fill="#20C0FF"/>
    <circle cx="9.5" cy="13" r="0.5" fill="#0060A0"/>
    <circle cx="14.5" cy="13" r="0.5" fill="#0060A0"/>
    {/* ankh symbol */}
    <path d="M12 17v4M10 19h4" stroke="#906010" strokeWidth="1" strokeLinecap="round"/>
    <ellipse cx="12" cy="16.5" rx="1.5" ry="1" fill="none" stroke="#906010" strokeWidth="0.8"/>
  </svg>
);

// Calendar → Maya (Bug Queen)
export const RoMoon = () => (
  <svg {...b}>
    {/* antennae */}
    <path d="M9 6L7 2" stroke="#608020" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M15 6L17 2" stroke="#608020" strokeWidth="1.3" strokeLinecap="round"/>
    <circle cx="7" cy="1.5" r="1.2" fill="#A0C830"/>
    <circle cx="17" cy="1.5" r="1.2" fill="#A0C830"/>
    {/* shell/carapace */}
    <ellipse cx="12" cy="10" rx="7" ry="5" fill="#80AA28" stroke="#507010" strokeWidth="0.7"/>
    {/* shell segments */}
    <path d="M5 10c0-3 14-3 14 0" stroke="#507010" strokeWidth="0.5" fill="none"/>
    <path d="M6 8h12" stroke="#507010" strokeWidth="0.4" opacity="0.6"/>
    {/* face */}
    <ellipse cx="12" cy="17" rx="6" ry="5.5" fill="#C0D850" stroke="#507010" strokeWidth="0.7"/>
    {/* compound eyes */}
    <circle cx="8.5" cy="15.5" r="2.5" fill="#202000" stroke="#507010" strokeWidth="0.5"/>
    <circle cx="15.5" cy="15.5" r="2.5" fill="#202000" stroke="#507010" strokeWidth="0.5"/>
    <circle cx="8" cy="15" r="1" fill="#80FF40" opacity="0.6"/>
    <circle cx="15" cy="15" r="1" fill="#80FF40" opacity="0.6"/>
    {/* mandibles */}
    <path d="M9 20.5L7 23M15 20.5L17 23" stroke="#507010" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

// History → Drake (Pirate Captain skeleton)
export const RoBook = () => (
  <svg {...b}>
    {/* pirate hat */}
    <path d="M4 10h16l-1-5H5z" fill="#1A1A2A" stroke="#444" strokeWidth="0.5"/>
    <path d="M3 10h18" stroke="#444" strokeWidth="1.5"/>
    {/* skull and crossbones on hat */}
    <circle cx="12" cy="7" r="2.2" fill="#E8E0D0" stroke="#666" strokeWidth="0.4"/>
    <circle cx="11" cy="6.5" r="0.5" fill="#1A1A2A"/>
    <circle cx="13" cy="6.5" r="0.5" fill="#1A1A2A"/>
    <path d="M10.5 8h3" stroke="#1A1A2A" strokeWidth="0.5"/>
    {/* skull face */}
    <ellipse cx="12" cy="15.5" rx="7" ry="7.5" fill="#E8E0D0" stroke="#999" strokeWidth="0.6"/>
    {/* eye sockets */}
    <ellipse cx="9" cy="13.5" rx="2.2" ry="2" fill="#1A1A2A"/>
    <ellipse cx="15" cy="13.5" rx="2.2" ry="2" fill="#1A1A2A"/>
    <circle cx="9" cy="13.5" r="0.8" fill="#CC2020" opacity="0.8"/>
    <circle cx="15" cy="13.5" r="0.8" fill="#CC2020" opacity="0.8"/>
    {/* nose cavity */}
    <path d="M11.2 16.5h1.6l-0.8-1.5z" fill="#1A1A2A"/>
    {/* teeth */}
    <path d="M8 18.5h8" stroke="#999" strokeWidth="0.5"/>
    <path d="M9.5 18.5v2M11.5 18.5v2.3M13.5 18.5v2.3M15 18.5v1.5" stroke="#E8E0D0" strokeWidth="1.1" strokeLinecap="round"/>
  </svg>
);

// Trade Ledger → Mistress (Queen Bee)
export const RoCoin = () => (
  <svg {...b}>
    {/* wings */}
    <ellipse cx="7.5" cy="9" rx="5" ry="3.5" fill="#C0E8FF" stroke="#88C0E8" strokeWidth="0.6" opacity="0.85" transform="rotate(-20 7.5 9)"/>
    <ellipse cx="16.5" cy="9" rx="5" ry="3.5" fill="#C0E8FF" stroke="#88C0E8" strokeWidth="0.6" opacity="0.85" transform="rotate(20 16.5 9)"/>
    {/* crown */}
    <path d="M8 10h8l-1-3-2 1.5-1-3-1 3-2-1.5z" fill="#FFD020" stroke="#C09000" strokeWidth="0.5"/>
    {/* head */}
    <ellipse cx="12" cy="14" rx="6" ry="5.5" fill="#FFE030" stroke="#C09000" strokeWidth="0.8"/>
    {/* stripes */}
    <path d="M6.2 13.5q5.8-2 11.6 0" fill="#C08000" opacity="0.5" stroke="none"/>
    <path d="M6 15.5q6-1.5 12 0" fill="#C08000" opacity="0.4" stroke="none"/>
    <rect x="6" y="13" width="12" height="1.5" rx="0.5" fill="#C08000" opacity="0.3"/>
    <rect x="6.5" y="15" width="11" height="1.5" rx="0.5" fill="#C08000" opacity="0.3"/>
    {/* eyes */}
    <circle cx="9.5" cy="13" r="1.5" fill="#1A0A00"/>
    <circle cx="14.5" cy="13" r="1.5" fill="#1A0A00"/>
    <circle cx="9.8" cy="12.6" r="0.5" fill="white" opacity="0.7"/>
    <circle cx="14.8" cy="12.6" r="0.5" fill="white" opacity="0.7"/>
    {/* stinger */}
    <path d="M12 19.5l1 3" stroke="#C09000" strokeWidth="1.2" strokeLinecap="round"/>
    {/* mouth */}
    <path d="M10.5 16.5q1.5 1 3 0" stroke="#C09000" strokeWidth="0.7" fill="none" strokeLinecap="round"/>
  </svg>
);

// Statistics → Eddga (Tiger Lord)
export const RoShield = () => (
  <svg {...b}>
    {/* ears */}
    <path d="M7 7L5 2l4 3z" fill="#E08020" stroke="#904000" strokeWidth="0.5"/>
    <path d="M17 7L19 2l-4 3z" fill="#E08020" stroke="#904000" strokeWidth="0.5"/>
    <path d="M7 7L6 4l2 2z" fill="#FFD0A0"/>
    <path d="M17 7L18 4l-2 2z" fill="#FFD0A0"/>
    {/* head */}
    <ellipse cx="12" cy="15" rx="9" ry="8" fill="#E88030" stroke="#904000" strokeWidth="0.8"/>
    {/* forehead stripes */}
    <path d="M9 9.5c1-2 5-2 6 0" fill="#904000" opacity="0.5" stroke="none"/>
    <path d="M10.5 8c0.5-1.5 3-1.5 3 0" fill="#904000" opacity="0.5" stroke="none"/>
    <path d="M9 9c0.5-2 6-2 6 0M10 7.5c0.5-1.5 4-1.5 4 0" stroke="#904000" strokeWidth="0.8" fill="none" opacity="0.6"/>
    {/* cheek stripes */}
    <path d="M4 13l4 1M4.5 15l3.5 0.5" stroke="#904000" strokeWidth="0.8" opacity="0.6"/>
    <path d="M20 13l-4 1M19.5 15l-3.5 0.5" stroke="#904000" strokeWidth="0.8" opacity="0.6"/>
    {/* muzzle */}
    <ellipse cx="12" cy="17" rx="4" ry="3" fill="#FFD0A0" stroke="#904000" strokeWidth="0.5"/>
    {/* nose */}
    <ellipse cx="12" cy="15.5" rx="1.5" ry="1" fill="#C04050"/>
    {/* eyes */}
    <ellipse cx="9" cy="13.5" rx="2" ry="1.6" fill="#20A020"/>
    <ellipse cx="15" cy="13.5" rx="2" ry="1.6" fill="#20A020"/>
    <ellipse cx="9" cy="13.5" rx="0.6" ry="1.4" fill="#0A3008"/>
    <ellipse cx="15" cy="13.5" rx="0.6" ry="1.4" fill="#0A3008"/>
    <circle cx="9.4" cy="13" r="0.4" fill="white" opacity="0.7"/>
    <circle cx="15.4" cy="13" r="0.4" fill="white" opacity="0.7"/>
    {/* fangs */}
    <path d="M10.5 19.5L10 22M13.5 19.5L14 22" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
    {/* whiskers */}
    <path d="M5 17h5M14 17h5" stroke="#904000" strokeWidth="0.4" opacity="0.6"/>
  </svg>
);

// Settings → Dark Lord (skull king)
export const RoGear = () => (
  <svg {...b}>
    {/* dark aura */}
    <ellipse cx="12" cy="13" rx="10" ry="10" fill="#120820" opacity="0.3"/>
    {/* crown */}
    <path d="M5 10h14l-0.5-4-3 2-2-4-2 4-3-2z" fill="#8020C0" stroke="#5010A0" strokeWidth="0.6"/>
    {/* crown jewels */}
    <circle cx="8.5" cy="7.5" r="1" fill="#FF2020"/>
    <circle cx="12" cy="6" r="1.2" fill="#FF8800"/>
    <circle cx="15.5" cy="7.5" r="1" fill="#FF2020"/>
    {/* skull head */}
    <ellipse cx="12" cy="16" rx="7.5" ry="7" fill="#D8D0C8" stroke="#888" strokeWidth="0.7"/>
    {/* dark eye sockets */}
    <ellipse cx="9" cy="14.5" rx="2.5" ry="2.3" fill="#1A1020"/>
    <ellipse cx="15" cy="14.5" rx="2.5" ry="2.3" fill="#1A1020"/>
    {/* glowing eyes */}
    <circle cx="9" cy="14.5" r="1.2" fill="#8020C0" opacity="0.9"/>
    <circle cx="15" cy="14.5" r="1.2" fill="#8020C0" opacity="0.9"/>
    <circle cx="9" cy="14.5" r="0.6" fill="#E060FF"/>
    <circle cx="15" cy="14.5" r="0.6" fill="#E060FF"/>
    {/* nose cavity */}
    <path d="M11 18h2l-1-1.5z" fill="#1A1020"/>
    {/* cracked teeth */}
    <path d="M8 19.5h8" stroke="#888" strokeWidth="0.5"/>
    <path d="M9 19.5v2.5M11 19.5v3M13 19.5v3M15 19.5v2" stroke="#D8D0C8" strokeWidth="1.2" strokeLinecap="round"/>
    {/* crack on skull */}
    <path d="M12 9l0.5 3-1 2" stroke="#888" strokeWidth="0.5" fill="none"/>
  </svg>
);
