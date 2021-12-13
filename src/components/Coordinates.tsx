import {
  useMousePosition,
  useSyncMousePosition
} from "../hooks/useMousePosition";

export const Coordinates = () => {
  const value = useMousePosition();

  const start = performance.now();

  while (performance.now() - start < 50) {
    // no-op
  }

  return (
    <div>
      <pre>x: {value}</pre>
    </div>
  );
};

export const SyncCoordinates = () => {
  const value = useSyncMousePosition();

  const start = performance.now();

  while (performance.now() - start < 50) {
    // no-op
  }

  return (
    <div>
      <pre>x: {value}</pre>
    </div>
  );
};
