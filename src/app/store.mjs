// Minimal observable store plus an event bus. No framework.
export function createStore(initial) {
  let state = { ...initial };
  const keyListeners = new Map();   // key -> Set<fn(value, state)>
  const busListeners = new Map();   // event -> Set<fn(payload)>
  const add = (map, k, fn) => {
    if (!map.has(k)) map.set(k, new Set());
    map.get(k).add(fn);
    return () => map.get(k).delete(fn);
  };
  return {
    get: () => state,
    set(patch) {
      const changed = Object.keys(patch).filter((k) => state[k] !== patch[k]);
      if (!changed.length) return;
      state = { ...state, ...patch };
      for (const k of changed) for (const fn of keyListeners.get(k) ?? []) {
        try { fn(state[k], state); } catch (e) { console.error(`listener for "${k}" failed`, e); }
      }
    },
    on: (key, fn) => add(keyListeners, key, fn),
    bus: {
      emit(name, payload) {
        for (const fn of busListeners.get(name) ?? []) {
          try { fn(payload); } catch (e) { console.error(`bus handler for "${name}" failed`, e); }
        }
      },
      on: (name, fn) => add(busListeners, name, fn),
    },
  };
}
