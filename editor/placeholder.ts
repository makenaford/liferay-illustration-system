/** A labelled placeholder image, so the slot's size and purpose read at a glance. */
export function placeholder(w: number, h: number, label: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b2434"/><stop offset="1" stop-color="#0e1420"/></linearGradient>` +
    `<pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#2a3548" stroke-width="1"/></pattern></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/><rect width="${w}" height="${h}" fill="url(#p)"/>` +
    `<text x="50%" y="50%" fill="#8a97ad" font-family="'Source Sans 3', system-ui, sans-serif" font-size="${Math.max(14, Math.round(Math.min(w, h) / 14))}" text-anchor="middle" dominant-baseline="middle">${label} · ${w} × ${h}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
