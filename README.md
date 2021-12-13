# Tearing when using External State and Concurrent Features

## Rendering root

Starting with React 18, concurrent features are introduced. Instead of forcing users, to commit entire parts of the application to concurrent mode, as it was done during the experimental period, React 18 introduces the concept of concurrent features.

In order to use concurrent features, one has to change the rendering root.

```tsx
import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import App from "./App";

const container = document.getElementById("root");

if (!container) throw new Error("Missing container");

const root = ReactDOM.createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Up to React 17, and even during React 18 without access to concurrent features, the rendering root was invoked like:

```tsx
import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import App from "./App";

const root = document.getElementById("root");

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  container
);
```

Notice that, in React 18 with the rendering root, if container is `null`, we need to throw.

This is enforced by the TypeScript function signatures.

Because the types are not in version 18 yet. The `tsconfig.json` must include:

```json
{
  "compilerOptions": {
    // rest of configuration
    "types": ["react/next", "react-dom/next"]
  }
}
```

## External Stores

> Discussed on this [React Working Group thread](https://github.com/reactwg/react-18/discussions/70).

Normally, state is managed by React. However, because certain libraries want to apply a paradigm, or want to perform optimizations to how state is mutated, and from there, optimize rendering cycles, or reduce memory consumption.

In absense of concurrent rendering it is not an issue to have external stores, managing their own state. Since rendering is done in one go, synchronously, events that could change an external state, are queued up in the event loop, and executed later.

## Tearing

With concurrency, React is able to abandon work that's no longer relevant. React recognizes if state updates can be discarded, or even prioritized over others. The only caveat is that these pieces of state must be managed by React too.

> At its core, React is essentially a library for processing a queue of state updates to produce consistent UIs.

External stores would need an API to let React know that a state update is no longer relevant. Even worse, because some external stores rely on rendering, to pass updated values to the UI, when using concurrent features, it is possible for a component to render data that it is not longer in sync.

Without concurrent features, all updates are flushed synchronously, before any type of asynchronous operation can contribute to state mutation. The entire React tree is rendered, and user inputs, timer results, or promise resolutions are stuck on the event loop until rendering is done.

With concurrent features, it is possible to get some updates to flush later, opening the door events that can mutate an external store. React continues rendering concurrently, but has no idea that a piece of external state has changed.

If there's two UI elements consuming the same piece of data from an external store, and React is done preparing the update for the first element, but before it prepares the update for the second the external store is updated, then React simply renders the second element, using fresh state to render it.

Once React is done with all updates, it commits to the DOM, and even though these two elements are pointing to the same data, the UI is will not show consistent data.

> So when a library uses external state, it loses access to all of this effort React put into making consistency guarantees for React state.

This is called _tearing_.

> Tearing is a term traditionally used in graphics programming to refer to a visual inconsistency.

## Avoiding Tearing

To avoid tearing, an external store needs:

1. Tell React that the store updated during render, so that React can render again
2. Force React to interrupt and re-render when the external state changes
3. Implement a solution that allows React to render without state changing in the middle of renders

There's different levels of support for external stores:

### Level 1: Making it work

> Trade-off: Render with a tear, but fix it immediately.

Use the `useSubscription` hook to trigger a synchronous update, to fix the tear. The hooks exists as an [npm package](https://github.com/facebook/react/tree/main/packages/use-subscription).

A [gist showing the implementation](https://gist.github.com/bvaughn/e25397f70e8c65b0ae0d7c90b731b189) of `use-subscription`.

```ts
import {useEffect, useState} from 'react';

// Hook used for safely managing subscriptions in concurrent mode.
//
// In order to avoid removing and re-adding subscriptions each time this hook is called,
// the parameters passed to this hook should be memoized in some way–
// either by wrapping the entire params object with useMemo()
// or by wrapping the individual callbacks with useCallback().
export function useSubscription<Value>({
  // (Synchronously) returns the current value of our subscription.
  getCurrentValue,

  // This function is passed an event handler to attach to the subscription.
  // It should return an unsubscribe function that removes the handler.
  subscribe,
}: {|
  getCurrentValue: () => Value,
  subscribe: (callback: Function) => () => void,
|}): Value {
  // Read the current value from our subscription.
  // When this value changes, we'll schedule an update with React.
  // It's important to also store the hook params so that we can check for staleness.
  // (See the comment in checkForUpdates() below for more info.)
  const [state, setState] = useState(() => ({
    getCurrentValue,
    subscribe,
    value: getCurrentValue(),
  }));

  let valueToReturn = state.value;

  // If parameters have changed since our last render, schedule an update with its current value.
  if (
    state.getCurrentValue !== getCurrentValue ||
    state.subscribe !== subscribe
  ) {
    // If the subscription has been updated, we'll schedule another update with React.
    // React will process this update immediately, so the old subscription value won't be committed.
    // It is still nice to avoid returning a mismatched value though, so let's override the return value.
    valueToReturn = getCurrentValue();

    setState({
      getCurrentValue,
      subscribe,
      value: valueToReturn,
    });
  }

  // It is important not to subscribe while rendering because this can lead to memory leaks.
  // (Learn more at reactjs.org/docs/strict-mode.html#detecting-unexpected-side-effects)
  // Instead, we wait until the commit phase to attach our handler.
  //
  // We intentionally use a passive effect (useEffect) rather than a synchronous one (useLayoutEffect)
  // so that we don't stretch the commit phase.
  // This also has an added benefit when multiple components are subscribed to the same source:
  // It allows each of the event handlers to safely schedule work without potentially removing an another handler.
  // (Learn more at https://codesandbox.io/s/k0yvr5970o)
  useEffect(
    () => {
      let didUnsubscribe = false;

      const checkForUpdates = () => {
        // It's possible that this callback will be invoked even after being unsubscribed,
        // if it's removed as a result of a subscription event/update.
        // In this case, React will log a DEV warning about an update from an unmounted component.
        // We can avoid triggering that warning with this check.
        if (didUnsubscribe) {
          return;
        }

        setState(prevState => {
          // Ignore values from stale sources!
          // Since we subscribe an unsubscribe in a passive effect,
          // it's possible that this callback will be invoked for a stale (previous) subscription.
          // This check avoids scheduling an update for that stale subscription.
          if (
            prevState.getCurrentValue !== getCurrentValue ||
            prevState.subscribe !== subscribe
          ) {
            return prevState;
          }

          // Some subscriptions will auto-invoke the handler, even if the value hasn't changed.
          // If the value hasn't changed, no update is needed.
          // Return state as-is so React can bail out and avoid an unnecessary render.
          const value = getCurrentValue();
          if (prevState.value === value) {
            return prevState;
          }

          return {...prevState, value};
        });
      };

      const unsubscribe = subscribe(checkForUpdates);

      // Because we're subscribing in a passive effect,
      // it's possible that an update has occurred between render and our effect handler.
      // Check for this and schedule an update if work has occurred.
      checkForUpdates();

      return () => {
        didUnsubscribe = true;
        unsubscribe();
      };
    },
    [getCurrentValue, subscribe],
  );

  // Return the current value for our caller to use while rendering.
  return valueToReturn;
}
```

### Level 2: <a id="level-2"></a>

> A trade-off: Do not tear, but take longer to render

Use the `useSyncExternalStore` hook which detects changes to state during rendering, to abandon rendering work that would lead to an inconsistent UI.

```ts
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

const useSyncMousePosition = () => {
  const ref = useRef(store);

  const getState = useCallback(() => ref.current.value.x, []);

  useDebugValue(
    ref.current,
    (store) => `useSyncMousePosition<x: ${store.value.x}>`
  );
  // `useSyncExternalStore` requires a subscription method and a way to read the state
  return useSyncExternalStore(ref.current.subscribe, getState);
};
```

### Level 3:

The last level of support is to simply use React managed state, which brings all of the benefits of concurrency.

## Caveats with `useRef`

Although, it has been said that using React managed state, brings level 3 support, one must be aware that hiding state inside a React `ref`, counts as using an external store.

```ts
const useRefStore = () => {
  const data = useRef({ x: 0 });

  useEffect(() => {
    const callback = (event: MouseEvent) => {
      data.current.x = event.clientX;
    };

    window.addEventListener("mousemove", callback);

    return () => {
      window.removeEventListener("mousemove", callback);
    };
  }, []);

  return data.current.x;
};
```

## Example

An application where we attempt to capture the `x` coordinate of the mouse right after a button is clicked.

- The Yarn button uses `startTransition` to trigger the mouse capture.
- The Camera button triggers the capture directly.

Right after clicking, move the mouse. The Camera shows always consistent `x` values in all views.

The Yarn, triggers tearing on the left column.

The right column uses `use-sync-external-store`, from the compatibility [npm package](https://www.npmjs.com/package/use-sync-external-store).

```tsx
function syncSleep() {
  const start = performance.now();
  while (performance.now() - start < 50) {
    // no-op
  }
}

// Left column
export const Coordinates = () => {
  const value = useMousePosition();

  syncSleep();

  return (
    <div>
      <pre>x: {value}</pre>
    </div>
  );
};

// Right column
export const SyncCoordinates = () => {
  const value = useSyncMousePosition();

  syncSleep();

  return (
    <div>
      <pre>x: {value}</pre>
    </div>
  );
};
```

Usign the store from [`level 2`](#level-2), define `useMousePosition` and `useSyncMousePosition`:

```ts
import { useSyncExternalStore } from "use-sync-external-store/shim";

const store = createExternalStore();

const useMousePosition = () => {
  const ref = useRef(store);

  useDebugValue(
    ref.current,
    (store) => `useMousePosition<x: ${store.value.x}>`
  );

  return ref.current.value.x;
};

const useSyncMousePosition = () => {
  const ref = useRef(store);

  const getState = useCallback(() => ref.current.value.x, []);

  useDebugValue(
    ref.current,
    (store) => `useSyncMousePosition<x: ${store.value.x}>`
  );

  return useSyncExternalStore(ref.current.subscribe, getState);
};
```
