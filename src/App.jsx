import { useEffect, useRef, useState } from 'react';
import { createEngine } from './engine/engine.js';
import { LINES } from './lines.js';
import { Toolbar } from './components/Toolbar.jsx';
import { RoutePicker } from './components/RoutePicker.jsx';
import { useEngineStore } from './hooks/useEngineStore.js';
import { useFitLayout } from './hooks/useFitLayout.js';
import { getCurrentUser, login, logout, saveProgress, loadProgress, clearProgress } from './auth/auth.js';
import { LoginModal } from './components/LoginModal.jsx';
import { UserBar } from './components/UserBar.jsx';

// Visible toolbar button counts — the AUTO set (7) and the DRIVE set (10).
// Used by the responsive layout to decide where the toolbar fits.
const BUTTONS_AUTO = 7;
const BUTTONS_DRIVE = 10;

// The engine's own line; picking it means passing no options to createEngine.
// Also what the app opens on.
const DEFAULT_LINE_ID = 'dhaka-khulna';

// How often the journey is written to storage while a logged-in player is
// mid-trip. Cheap (a few hundred bytes), so it runs unnoticed.
const AUTOSAVE_MS = 20000;

export default function App() {
  const appRef = useRef(null);
  const canvasRef = useRef(null);
  const [engine, setEngine] = useState(null);
  const [builtIn, setBuiltIn] = useState(null);   // the engine's DEFAULT_LINE
  const [lineId, setLineId] = useState(DEFAULT_LINE_ID);
  const [user, setUser] = useState(() => getCurrentUser());
  const [showLogin, setShowLogin] = useState(!getCurrentUser());
  const [status, setStatus] = useState('');       // small in-app message, top-left
  const [hasProgress, setHasProgress] = useState(() => {
    const u = getCurrentUser();
    return u ? !!loadProgress(u.username) : false;
  });

  // A resume that needs the engine re-booted on another line first: the
  // engine effect picks this up once the new engine has booted.
  const pendingResume = useRef(null);
  const statusTimer = useRef(0);

  // null = the built-in line. LINES.find returns a stable reference, so the
  // effect below only re-runs when the player actually picks a different line.
  const line = lineId === DEFAULT_LINE_ID ? null : LINES.find(l => l.id === lineId) || null;

  const say = (msg, ms = 2600) => {
    setStatus(msg);
    clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(''), ms);
  };

  // Boot the engine on the chosen line; re-create it when the line changes and
  // tear it down on unmount. The canvas element is reused throughout.
  //
  // The engine rasterises every Bangla string to a 1-bit mask as it boots, so
  // Nazrul Pixel must be loaded before createEngine() runs — otherwise the
  // masks bake in whatever system Bengali font the browser falls back to.
  // The size mirrors CONFIG.BN_SIZE (14) so the face is warmed at its real size.
  useEffect(() => {
    let cancelled = false;
    let api = null;
    const boot = async () => {
      try {
        await document.fonts.load('14px "Nazrul Pixel"');
      } catch {
        /* no Font Loading API, or offline: BN_FONT falls back to system faces */
      }
      if (cancelled) return;
      api = createEngine(canvasRef.current, line || undefined);
      setEngine(api);
      setBuiltIn(prev => prev || api.DEFAULT_LINE);
      // A queued resume waits for the engine built on the saved line.
      if (pendingResume.current) {
        const p = pendingResume.current;
        pendingResume.current = null;
        api.importProgress(p);
      }
    };
    boot();
    return () => {
      cancelled = true;
      if (api) api.dispose();
    };
  }, [line]);

  useEffect(() => () => clearTimeout(statusTimer.current), []);

  useEngineStore(engine); // re-render when engine state changes

  const driving = engine ? engine.drive.on && !engine.ui.title : false;
  const layout = useFitLayout(appRef, canvasRef, driving ? BUTTONS_DRIVE : BUTTONS_AUTO);

  const routes = [builtIn, ...LINES].filter(Boolean);

  const handleLogin = (username) => {
    try {
      const loggedIn = login(username);
      setUser(loggedIn);
      setShowLogin(false);
      setHasProgress(!!loadProgress(loggedIn.username));
      const saved = loadProgress(loggedIn.username);
      say(saved ? 'WELCOME BACK, ' + loggedIn.username.toUpperCase() + ' - PRESS CONTINUE' : 'WELCOME, ' + loggedIn.username.toUpperCase());
    } catch (e) {
      // ignore
    }
  };

  const handleSkip = () => {
    setShowLogin(false);
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setHasProgress(false);
    setShowLogin(true);
  };

  const handleSaveProgress = () => {
    if (!engine || !user) return;
    try {
      const progress = engine.exportProgress();
      saveProgress(user.username, progress);
      setHasProgress(true);
      say('PROGRESS SAVED');
    } catch (e) {
      say('SAVE FAILED');
    }
  };

  const handleLoadProgress = () => {
    if (!user) return;
    const p = loadProgress(user.username);
    if (!p) {
      say('NO SAVED JOURNEY');
      return;
    }
    if (p.lineId && p.lineId !== lineId) {
      // The save is on another line: boot the engine there, then resume.
      pendingResume.current = p;
      setLineId(p.lineId);
      say('RESUMING ON ' + String(p.lineId).toUpperCase());
    } else if (engine) {
      if (engine.importProgress(p)) say('JOURNEY RESUMED');
      else say('SAVE UNREADABLE');
    }
  };

  const handleClearProgress = () => {
    if (!user) return;
    clearProgress(user.username);
    setHasProgress(false);
    say('SAVED JOURNEY CLEARED');
  };

  // Autosave: while a logged-in player is mid-trip, and once more when the
  // tab is hidden or closed, so "continue" always lands close to the last run.
  useEffect(() => {
    if (!user || !engine) return undefined;
    const snap = () => {
      try {
        if (engine.ui.title || engine.ui.complete) return;
        saveProgress(user.username, engine.exportProgress());
        setHasProgress(true);
      } catch (e) { /* ignore */ }
    };
    const onVis = () => { if (document.visibilityState === 'hidden') snap(); };
    const id = setInterval(snap, AUTOSAVE_MS);
    addEventListener('pagehide', snap);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      removeEventListener('pagehide', snap);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [user, engine]);

  return (
    <div ref={appRef} className={`app ${layout.mode}`}>
      <canvas id="screen" ref={canvasRef} width={320} height={180} />
      <Toolbar engine={engine} driving={driving} />
      {engine && engine.ui.title && (
        <RoutePicker routes={routes} value={lineId} onChange={setLineId} />
      )}
      <UserBar
        user={user}
        status={status}
        onLogin={() => setShowLogin(true)}
        onLogout={handleLogout}
        onSave={handleSaveProgress}
        onLoad={handleLoadProgress}
        onClear={handleClearProgress}
        hasProgress={hasProgress}
      />
      {showLogin && <LoginModal onLogin={handleLogin} onSkip={handleSkip} />}
    </div>
  );
}
