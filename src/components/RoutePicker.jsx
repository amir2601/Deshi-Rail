/**
 * The route picker. Shown on the title card (before a journey starts), it lists
 * the built-in line plus every line in src/lines.js. Choosing one re-creates the
 * engine on that line, so the app restarts on the new route's title card.
 *
 * The engine owns the canvas UI (including the train picker); this is a plain
 * React control layered over the picture, which is why it is only mounted while
 * the title card is up — changing line mid-journey would restart the run.
 */
export function RoutePicker({ routes, value, onChange }) {
  return (
    <label className="routebar">
      <span className="routebar-label">LINE</span>
      <select
        className="routebar-select"
        value={value}
        onChange={e => onChange(e.target.value)}
        title="Choose a route"
      >
        {routes.map(r => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
    </label>
  );
}
