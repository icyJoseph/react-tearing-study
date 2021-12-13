import { useState, startTransition } from "react";

import { Coordinates, SyncCoordinates } from "./components/Coordinates";

import logo from "./logo.svg";
import "./App.css";

const Yarn = () => (
  <span className="emoji" role="img" aria-label="Yarn">
    🧶
  </span>
);

const Snapshot = () => (
  <span className="emoji" role="img" aria-label="Snapshot">
    📸
  </span>
);

function App() {
  const [, setCapture] = useState(false);

  const toggle = () => setCapture((x) => !x);

  function transitionHandler() {
    return startTransition(toggle);
  }

  return (
    <div className="App">
      <header>
        <div>
          <img src={logo} className="App-logo" alt="logo" />
          <h1>Hello! Vite + React</h1>

          <p>
            Click <Yarn /> or <Snapshot />, and move the mouse away, as fast as
            you can.
          </p>

          <button onClick={transitionHandler}>
            <Yarn />
          </button>

          <button onClick={toggle}>
            <Snapshot />
          </button>
        </div>
      </header>

      <main>
        <section>
          <h2>Regular</h2>

          <Coordinates />
          <Coordinates />
          <Coordinates />
        </section>

        <section>
          <h2>Sync</h2>

          <SyncCoordinates />
          <SyncCoordinates />
          <SyncCoordinates />
        </section>
      </main>
    </div>
  );
}

export default App;
