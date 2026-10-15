// The toolbar's 16x16 pixel icons. These are the exact SVG paths from the
// original index.html (train controls) and from the engine's ICONS table
// (pause/play, time-of-day and sound), so the toolbar looks identical.
const PATHS = {
  mode: 'M5 2h6v1h2v2h1v6h-1v2h-2v1H5v-1H3v-2H2V5h1V3h2zM6 4H5v1H4v6h1v1h6v-1h1V5h-1V4zM7 4h2v3H7zM7 7h2v2H7zM4 7h3v1H4zM9 7h3v1H9zM7 9h2v3H7z',
  engine: 'M7 1h2v7H7zM4 3h2v2H4zM10 3h2v2h-2zM2 5h2v6H2zM12 5h2v6h-2zM3 11h2v2H3zM11 11h2v2h-2zM5 13h6v1H5z',
  reverser: 'M5 2L2 5l3 3V6h6V4H5V2zM11 14l3-3-3-3v2H5v2h6v2z',
  power: 'M7 3h2v1h1v1h1v1h1v1h1v1h1v2H2V8h1V7h1V6h1V5h1V4h1z',
  brake: 'M2 5h12v2h-1v1h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5V9H4V8H3V7H2z',
  doors: 'M2 2h12v12H2zM4 4v10h3V4zM9 4v10h3V4z',
  horn: 'M1 7h3v2H1zM4 6h2v4H4zM6 5h2v6H6zM8 3h2v10H8zM12 4h1v1h-1zM13 7h2v2h-2zM12 11h1v1h-1z',
  light: 'M6 2h4v1h1v1h1v4h-1v1h-1v2H6V9H5V8H4V4h1V3h1zM6 12h4v1H6zM7 14h2v1H7z',
  skip: 'M3 3h2v1h2v1h2v1h1v1h1v2h-1v1h-1v1H7v1H5v1H3zM12 3h2v10h-2z',
  rain: 'M5 2h5v1h2v1h1v2h1v3H1V6h1V4h1V3h2zM3 11h1v2H3zM7 11h1v2H7zM11 11h1v2h-1zM5 13h1v2H5zM9 13h1v2H9z',
  pause: 'M4 3h3v10H4zM9 3h3v10H9z',
  play: 'M4 3h2v1h2v1h2v1h2v1h1v2h-1v1h-2v1H8v1H6v1H4z',
  sun: 'M6 5h4v1h1v4h-1v1H6v-1H5V6h1zM7 1h2v2H7zM7 13h2v2H7zM1 7h2v2H1zM13 7h2v2h-2zM3 3h2v2H3zM11 3h2v2h-2zM3 11h2v2H3zM11 11h2v2h-2z',
  dusk: 'M5 7h6v1h1v2H4V8h1zM1 11h14v1H1zM3 13h10v1H3zM7 2h2v3H7zM2 5h2v2H2zM12 5h2v2h-2z',
  moon: 'M7 2h4v1H8v1H7v1H6v6h1v1h1v1h3v1H7v-1H5v-1H4V9H3V6h1V4h1V3h2z',
  auto: 'M6 2h4v1h2v1h1v2h1v4h-1v2h-1v1h-2v1H6v-1H4v-1H3v-2H2V6h1V4h1V3h2zM7 4v5h4V8H8V4z',
  sound: 'M2 6h3l3-3h1v10H8l-3-3H2zM11 5h1v6h-1zM13 3h1v10h-1z',
  mute: 'M2 6h3l3-3h1v10H8l-3-3H2zM11 5h1v1h-1zM12 6h1v1h-1zM13 7h1v1h-1zM14 8h1v1h-1zM14 5h1v1h-1zM13 6h1v1h-1zM12 7h1v1h-1zM11 8h1v1h-1z',
};

export function Icon({ name }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}
