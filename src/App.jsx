import { useEffect, useRef, useState } from 'react';
import { createEngine } from './engine/engine.js';
import { LINES } from './lines.js';
import { Toolbar } from './components/Toolbar.jsx';
import { RoutePicker } from './components/RoutePicker.jsx';
import { useEngineStore } from './hooks/useEngineStore.js';
import { useFitLayout } from './hooks/useFitLayout.js';

// Visible toolbar button counts — the AUTO set (7) and the DRIVE set (10).
// Used by the responsive layout to decide where the toolbar fits.
const BUTTONS_AUTO = 7;
const BUTTONS_DRIVE = 10;

// The engine's own line; picking it means passing no options to createEngine.
// Also what the app opens on.
const DEFAULT_LINE_ID = 'dhaka-khulna';

export default function App() {
  const appRef = useRef(null);
  const canvasRef = useRef(null);
  const [engine, setEngine] = useState(null);
  const [builtIn, setBuiltIn] = useState(null);   // the engine's DEFAULT_LINE
  const [lineId, setLineId] = useState(DEFAULT_LINE_ID);

  // null = the built-in line. LINES.find returns a stable reference, so the
  // effect below only re-runs when the player actually picks a different line.
  const line = lineId === DEFAULT_LINE_ID ? null : LINES.find(l => l.id === lineId) || null;

  // Boot the engine on the chosen line; re-create it when the line changes and
  // tear it down on unmount. The canvas element is reused throughout.
  useEffect(() => {
    const api = createEngine(canvasRef.current, line || undefined);
    setEngine(api);
    setBuiltIn(prev => prev || api.DEFAULT_LINE);
    return () => api.dispose();
  }, [line]);

  useEngineStore(engine); // re-render when engine state changes

  const driving = engine ? engine.drive.on && !engine.ui.title : false;
  const layout = useFitLayout(appRef, canvasRef, driving ? BUTTONS_DRIVE : BUTTONS_AUTO);

  const routes = [builtIn, ...LINES].filter(Boolean);

  return (
    <div ref={appRef} className={`app ${layout.mode}`}>
      <canvas id="screen" ref={canvasRef} width={320} height={180} />
      <Toolbar engine={engine} driving={driving} />
      {engine && engine.ui.title && (
        <RoutePicker routes={routes} value={lineId} onChange={setLineId} />
      )}
    </div>
  );
}
