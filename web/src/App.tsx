import { useEffect, useState } from "react";
import { api, ApiError, type AppState } from "./api";

type Action = "load" | "refresh" | "increment" | "decrement" | "reset";
type TrackProperties = Record<string, string | number | boolean>;

// Pendo Track Event fired when each action succeeds (after the server responds).
// Names must match the track types registered in Pendo exactly (case-sensitive),
// so they are spelled out in full.
const ACTION_EVENTS: Record<Action, string> = {
  load: "demo-load",
  refresh: "demo-refresh",
  increment: "demo-increment",
  decrement: "demo-decrement",
  reset: "demo-reset",
};

// Fired when any action fails. One event with an `action` property (rather than
// one per action) so failure rates line up with the demo-<action> events above.
const ACTION_FAILED_EVENT = "demo-action-failed";

// Pendo limits a Track Event's properties to 512 bytes of JSON.
const MAX_ERROR_MESSAGE_LENGTH = 100;

// Seam for Pendo. Novus installs the Pendo agent, which provides window.pendo
// at runtime; this fires a Track Event for each action. No-op when the agent
// isn't present (local dev), so the app and Playwright mocks both stay simple.
function trackEvent(name: string, properties: TrackProperties) {
  if (typeof window !== "undefined") {
    try {
      window.pendo?.track?.(name, properties);
    } catch {
      // Tracking must never break an action or get it reported as a failure.
    }
  }
}

// Properties for each action's success event. `previous` is the state shown
// when the action started; `next` is the state the server returned.
function successProperties(action: Action, previous: AppState, next: AppState): TrackProperties {
  switch (action) {
    case "load":
      return { counter: next.counter, lastAction: next.lastAction };
    case "refresh":
      return {
        counter: next.counter,
        lastAction: next.lastAction,
        previousCounter: previous.counter,
        counterChanged: previous.counter !== next.counter,
      };
    case "increment":
    case "decrement":
      return { counter: next.counter, previousCounter: previous.counter };
    case "reset":
      return {
        counter: next.counter,
        previousCounter: previous.counter,
        previousLastAction: previous.lastAction,
      };
  }
}

// React StrictMode runs mount effects twice in development. This module-level
// flag survives that remount, so the initial load (and the demo-load or
// demo-action-failed event it fires) happens once per page load.
let initialLoadStarted = false;

export default function App() {
  const [state, setState] = useState<AppState>({ counter: 0, lastAction: "none" });
  const [error, setError] = useState<string | null>(null);

  const run = async (action: Action, fn: () => Promise<AppState>) => {
    const previous = state;
    try {
      setError(null);
      const next = await fn();
      setState(next);
      trackEvent(ACTION_EVENTS[action], successProperties(action, previous, next));
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      trackEvent(ACTION_FAILED_EVENT, {
        action,
        errorMessage: message.slice(0, MAX_ERROR_MESSAGE_LENGTH),
        // Set only for HTTP error responses; a network failure has no status.
        ...(e instanceof ApiError ? { httpStatus: e.status } : {}),
      });
    }
  };

  useEffect(() => {
    if (initialLoadStarted) return;
    initialLoadStarted = true;
    run("load", api.getState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 480, margin: "4rem auto", textAlign: "center" }}>
      <h1>QAWolf Demo</h1>

      <p data-testid="counter-value" style={{ fontSize: "3rem", margin: "1rem 0" }}>
        {state.counter}
      </p>
      <p data-testid="last-action" style={{ color: "#666" }}>
        Last action: {state.lastAction}
      </p>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <button data-testid="btn-increment" onClick={() => run("increment", api.increment)}>
          Increment
        </button>
        <button data-testid="btn-decrement" onClick={() => run("decrement", api.decrement)}>
          Decrement
        </button>
        <button data-testid="btn-reset" onClick={() => run("reset", api.reset)}>
          Reset
        </button>
        <button data-testid="btn-refresh" onClick={() => run("refresh", api.getState)}>
          Refresh
        </button>
      </div>

      {error && (
        <p data-testid="error" style={{ color: "crimson", marginTop: 16 }}>
          {error}
        </p>
      )}
    </main>
  );
}
