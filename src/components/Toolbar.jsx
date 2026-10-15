import { useEffect, useRef } from 'react';
import { Icon } from './Icon.jsx';

// A single toolbar button. Mirrors the original #bar button markup: an icon, a
// label (or just a label for the speed button), the `on` state class and the
// big font variant. `...rest` carries the pointer/click handlers.
function BarButton({ icon, label, on, big, ...rest }) {
  const className = [big && 'big', on && 'on'].filter(Boolean).join(' ') || undefined;
  return (
    <button type="button" className={className} {...rest}>
      {icon && <Icon name={icon} />}
      {label != null && <span>{label}</span>}
    </button>
  );
}

// Power and brake step once per tap and keep stepping while held; a click with
// no pointer (keyboard activation on the button) taps once.
function HoldButton({ onStep, ...rest }) {
  const timer = useRef(0);
  const stop = () => {
    clearTimeout(timer.current);
    timer.current = 0;
  };
  const start = e => {
    e.preventDefault();
    onStep();
    stop();
    const again = () => {
      onStep();
      timer.current = setTimeout(again, 170);
    };
    timer.current = setTimeout(again, 420);
  };
  useEffect(() => stop, []);
  return (
    <BarButton
      {...rest}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={e => {
        if (e.detail === 0) onStep();
      }}
    />
  );
}

// The horn sounds for as long as it is held (at least a short toot).
function HornButton({ engine, ...rest }) {
  const down = e => {
    e.preventDefault();
    engine.unlockAudio();
    engine.hornOn();
  };
  const up = () => engine.hornOff();
  return (
    <BarButton
      {...rest}
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={up}
      onPointerCancel={up}
      onClick={e => {
        if (e.detail === 0) {
          engine.unlockAudio();
          engine.hornOn();
          setTimeout(() => engine.hornOff(), 400);
        }
      }}
    />
  );
}

/**
 * The train controls. AUTO and DRIVE each show their own set of buttons; this
 * renders from the live engine state, so it stays in step with the keyboard
 * shortcuts the engine also handles.
 */
export function Toolbar({ engine, driving }) {
  if (!engine) return <div id="bar" className="bar" role="toolbar" aria-label="Train controls" />;

  const { ui, drive, sim, audio, TIME_MODES, RAIN_MODES } = engine;
  const live = audio.ctx && audio.ctx.state === 'running';
  const E = drive.engine;
  const closing =
    sim.state === 'STOPPED' &&
    (sim.stopPhase === 'BOARDING' || sim.stopPhase === 'BOARDED' || sim.stopPhase === 'DOORS_OPEN');
  const timeMode = TIME_MODES[ui.timeMode][0];
  const timeIcon =
    timeMode === 'NIGHT' ? 'moon' : timeMode === 'DUSK' ? 'dusk' : timeMode === 'DAY' ? 'sun' : 'auto';

  const tap = name => () => engine.invoke(name);

  return (
    <div id="bar" className="bar" role="toolbar" aria-label="Train controls">
      <BarButton
        id="b-mode"
        icon="mode"
        label={driving ? 'DRIVE' : 'AUTO'}
        on={driving}
        title="Drive the train yourself (C)"
        aria-label={driving ? 'Driver mode on: hand back to autopilot' : 'Drive the train yourself'}
        onClick={tap('mode')}
      />

      {driving && (
        <>
          <BarButton
            id="b-engine"
            icon="engine"
            label={E === 'OFF' ? 'START' : E === 'ON' ? 'STOP' : '...'}
            on={E === 'ON'}
            title="Engine start / stop (E)"
            aria-label={E === 'OFF' ? 'Start the engine' : 'Stop the engine'}
            onClick={tap('engine')}
          />
          <BarButton
            id="b-rev"
            icon="reverser"
            label={drive.reverser === -1 ? 'REV' : 'FWD'}
            on={drive.reverser === -1}
            title="Reverse / Forward (R)"
            aria-label={
              drive.reverser === -1 ? 'Reverse gear: back up slowly (R)' : 'Forward gear (R)'
            }
            onClick={tap('rev')}
          />
          <HoldButton
            id="b-power"
            icon="power"
            label="POWER"
            on={drive.lever > 0}
            title="Power up / release brake (Up arrow)"
            aria-label="Power up, release brake"
            onStep={tap('power')}
          />
          <HoldButton
            id="b-brake"
            icon="brake"
            label="BRAKE"
            on={drive.lever < 0}
            title="Power down / brake (Down arrow, B = emergency)"
            aria-label="Brake"
            onStep={tap('brake')}
          />
          <BarButton
            id="b-doors"
            icon="doors"
            label={closing ? 'CLOSE' : 'OPEN'}
            on={sim.doorOpen > 0}
            title="Doors (O)"
            aria-label={closing ? 'Close the doors' : 'Open the doors'}
            onClick={tap('doors')}
          />
          <HornButton
            engine={engine}
            id="b-horn"
            icon="horn"
            label="HORN"
            title="Horn (hold H)"
            aria-label="Horn"
          />
          <BarButton
            id="b-light"
            icon="light"
            label="LIGHT"
            on={drive.headlight}
            title="Headlight (L)"
            aria-label={drive.headlight ? 'Headlight off' : 'Headlight on'}
            onClick={tap('light')}
          />
        </>
      )}

      <BarButton
        id="b-pause"
        icon={ui.paused ? 'play' : 'pause'}
        label={ui.paused ? 'PLAY' : 'PAUSE'}
        on={ui.paused}
        title="Pause (P)"
        aria-label={ui.paused ? 'Resume' : 'Pause'}
        onClick={tap('pause')}
      />

      {!driving && (
        <>
          <BarButton
            id="b-speed"
            label={`${ui.speed}x`}
            on={ui.speed > 1}
            big
            title="Speed (1 / 2 / 4)"
            aria-label={`Speed ${ui.speed}x`}
            onClick={tap('speed')}
          />
          <BarButton
            id="b-skip"
            icon="skip"
            label="NEXT"
            title="Next stop (N)"
            aria-label="Skip to the next booked stop"
            onClick={tap('skip')}
          />
          <BarButton
            id="b-time"
            icon={timeIcon}
            label={timeMode}
            on={ui.timeMode > 0}
            title="Time of day (T)"
            aria-label={`Time of day: ${timeMode}`}
            onClick={tap('time')}
          />
          <BarButton
            id="b-rain"
            icon="rain"
            label={RAIN_MODES[ui.rainMode]}
            on={ui.rainMode === 1}
            title="Rain (W)"
            aria-label={`Rain: ${RAIN_MODES[ui.rainMode]}`}
            onClick={tap('rain')}
          />
        </>
      )}

      <BarButton
        id="b-mute"
        icon={live && !audio.muted ? 'sound' : 'mute'}
        label={!live ? 'TAP' : audio.muted ? 'OFF' : 'ON'}
        on={live && !audio.muted}
        title="Sound (M)"
        aria-label={!live ? 'Turn sound on' : audio.muted ? 'Unmute' : 'Mute'}
        onClick={tap('mute')}
      />
    </div>
  );
}
