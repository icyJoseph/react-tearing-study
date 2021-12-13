import { useRef, useCallback, useDebugValue } from "react";
import { useSyncExternalStore } from "use-sync-external-store/shim";

type Listener = () => void;

const createExternalStore = () => {
  const data = { x: 0 };

  const listeners: Set<Listener> = new Set();

  const callback = (event: MouseEvent) => {
    data.x = event.clientX;
  };

  window.addEventListener("mousemove", callback);

  return {
    get value() {
      return data;
    },
    subscribe(listener: Listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    destroy() {
      listeners.clear();

      window.removeEventListener("mousemove", callback);
    }
  };
};

const store = createExternalStore();

export const useMousePosition = () => {
  const ref = useRef(store);

  useDebugValue(
    ref.current,
    (store) => `useMousePosition<x: ${store.value.x}>`
  );
  return ref.current.value.x;
};

export const useSyncMousePosition = () => {
  const ref = useRef(store);

  const getState = useCallback(() => ref.current.value.x, []);

  useDebugValue(
    ref.current,
    (store) => `useSyncMousePosition<x: ${store.value.x}>`
  );
  return useSyncExternalStore(ref.current.subscribe, getState);
};
