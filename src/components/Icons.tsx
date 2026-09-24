const P = (d: string) => (props: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={props.size ?? 18} height={props.size ?? 18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export const Icon = {
  home: P("M3 11l9-8 9 8M5 10v10h14V10"),
  book: P("M4 4h11a3 3 0 013 3v13H7a3 3 0 01-3-3V4zM4 17a3 3 0 013-3h11"),
  quiz: P("M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9"),
  cards: P("M3 7h14v12H3zM7 3h14v12"),
  cases: P("M9 4h6a1 1 0 011 1v2H8V5a1 1 0 011-1zM4 7h16v13H4zM12 11v6M9 14h6"),
  search: P("M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3"),
  tag: P("M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8zM7.5 7.5h.01"),
  stats: P("M4 20V10M10 20V4M16 20v-7M22 20H2"),
  settings: P("M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"),
  upload: P("M12 16V4M6 10l6-6 6 6M4 20h16"),
  flag: P("M5 21V4M5 4h11l-2 4 2 4H5"),
  history: P("M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8M3 3v5h5M12 7v5l3 3"),
  image: P("M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01"),
  timer: P("M12 21a8 8 0 100-16 8 8 0 000 16zM12 9v4l2 2M9 2h6"),
  sparkle: P("M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z")
};
