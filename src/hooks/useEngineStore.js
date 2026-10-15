import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribe to the engine's state notifications.
 *
 * The engine mutates its state objects (sim / drive / ui / …) in place and
 * bumps an internal revision counter whenever something the UI depends on
 * changes. useSyncExternalStore turns that counter into a React re-render, so
 * components can then read the live values straight off the returned engine.
 *
 * Returns the current revision (useful as a dependency).
 */
export function useEngineStore(engine) {
  const subscribe = useCallback(
    onStoreChange => (engine ? engine.subscribe(onStoreChange) : () => {}),
    [engine],
  );
  const getSnapshot = useCallback(() => (engine ? engine.getRevision() : 0), [engine]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
