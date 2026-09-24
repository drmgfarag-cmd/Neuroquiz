/**
 * Colour coding: every topic and app section gets its own hue, so lists,
 * cards and charts are easier to scan. Hues are used with the theme's
 * lightness via CSS (hsl(var(--hue) …)), so they work in light and dark mode.
 */
const HUES = [212, 262, 330, 20, 160, 190, 40, 290, 0, 125, 235, 305, 60, 175];

export function topicHue(topic: string | undefined): number {
  if (!topic) return 212;
  let h = 0;
  for (const c of topic) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

/** App sections (sidebar, dashboard tiles). */
export const SECTION_HUE: Record<string, number> = {
  "/": 212,
  "/library": 175,
  "/quiz": 235,
  "/mock": 340,
  "/flashcards": 268,
  "/cases": 28,
  "/search": 195,
  "/atlas": 310,
  "/reference": 140,
  "/tagging": 45,
  "/answer-check": 290,
  "/history": 215,
  "/stats": 155,
  "/import": 200,
  "/settings": 220
};
