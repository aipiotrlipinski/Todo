// Small stroke icons; they inherit the text colour.
const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const IconInbox = () => (
  <svg {...base}><path d="M3 11h4l1 2h4l1-2h4M3 11l2-6h10l2 6v4H3v-4z" /></svg>
);
export const IconToday = () => (
  <svg {...base}><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M3 8h14M7 2.5v3M13 2.5v3" /><circle cx="10" cy="12.5" r="1.4" fill="currentColor" stroke="none" /></svg>
);
export const IconUpcoming = () => (
  <svg {...base}><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M3 8h14M7 2.5v3M13 2.5v3M6.5 11.5h2M11.5 11.5h2M6.5 14h2" /></svg>
);
export const IconSettings = () => (
  <svg {...base}><circle cx="10" cy="10" r="2.5" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></svg>
);
export const IconSun = () => (
  <svg {...base} width={15} height={15}><circle cx="10" cy="10" r="3.4" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" /></svg>
);
export const IconMoon = () => (
  <svg {...base} width={15} height={15}><path d="M16.5 12A7 7 0 018 3.5a7 7 0 108.5 8.5z" /></svg>
);
export const IconPlus = () => (
  <svg {...base} width={16} height={16}><path d="M10 4v12M4 10h12" /></svg>
);
export const IconRepeat = () => (
  <svg {...base} width={13} height={13}><path d="M4 8a6 6 0 0110-2.5L16 7M16 3v4h-4M16 12a6 6 0 01-10 2.5L4 13M4 17v-4h4" /></svg>
);
export const IconClock = () => (
  <svg {...base} width={13} height={13}><circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.5 1.5" /></svg>
);
export const IconTrash = () => (
  <svg {...base} width={16} height={16}><path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11" /></svg>
);
export const IconClose = () => (
  <svg {...base} width={16} height={16}><path d="M5 5l10 10M15 5L5 15" /></svg>
);
export const IconCheck = () => (
  <svg {...base} width={12} height={12} strokeWidth={2.4}><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>
);
export const IconSubtasks = () => (
  <svg {...base} width={13} height={13}><path d="M5 4v8a2 2 0 002 2h7M11 11l3 3-3 3" /></svg>
);
export const IconGrip = () => (
  <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
    <circle cx="3" cy="3" r="1.3" /><circle cx="7" cy="3" r="1.3" />
    <circle cx="3" cy="8" r="1.3" /><circle cx="7" cy="8" r="1.3" />
    <circle cx="3" cy="13" r="1.3" /><circle cx="7" cy="13" r="1.3" />
  </svg>
);
export const IconLogo = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 7.5l2.5 2.5L11 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
