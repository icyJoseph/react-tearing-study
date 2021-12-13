import {
  useMousePosition,
  useSyncMousePosition
} from "../hooks/useMousePosition";

function syncSleep() {
  const start = performance.now();
  while (performance.now() - start < 50) {
    // no-op
  }
}

export const Coordinates = () => {
  const value = useMousePosition();

  syncSleep();

  return (
    <div>
      <pre>x: {value}</pre>
    </div>
  );
};

export const SyncCoordinates = () => {
  const value = useSyncMousePosition();

  syncSleep();

  return (
    <div>
      <pre>x: {value}</pre>
    </div>
  );
};
