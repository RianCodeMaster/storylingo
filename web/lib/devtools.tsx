"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n";
import { supabase } from "./supabase";

/**
 * Test tools: a small 🧪 button that jumps anywhere (a scene, the questions, shadowing, a new visitor) so testing
 * never means playing everything again. Only while developing: Next removes it from the production build, so
 * learners never get it. Pages offer their jumps with useDevActions; the panel lives in the edition layout.
 */
export const DEV = process.env.NODE_ENV === "development";

export type DevAction = { label: string; run: () => void | Promise<void> };

type Getter = () => DevAction[];
const Registry = createContext<((get: Getter | null) => void) | null>(null);

/**
 * Offer this page's jumps in the test panel while the page is shown. A no-op outside development.
 * The page registers once a way to read its current jumps, so its renders never re-render the panel.
 */
export function useDevActions(actions: DevAction[]) {
  const register = useContext(Registry);
  const latest = useRef(actions);
  useEffect(() => {
    latest.current = actions;
  });
  useEffect(() => {
    if (!register) return;
    register(() => latest.current);
    return () => register(null);
  }, [register]);
}

function Panel({ get }: { get: Getter | null }) {
  const { edition, home } = useI18n();
  const [open, setOpen] = useState(false);
  // Always there: start over as someone who never saw this edition.
  const global: DevAction[] = [
    {
      label: "Welkomstscherm (uitschrijven uit deze editie)",
      run: async () => {
        await supabase().from("enrollments").delete().eq("edition", edition.slug);
        window.location.href = home;
      },
    },
    {
      label: "Nieuwe anonieme bezoeker",
      run: async () => {
        await supabase().auth.signOut({ scope: "local" });
        window.location.href = home;
      },
    },
  ];
  return (
    <div className="devtools">
      {open && (
        <div className="devtools-panel">
          {[...(get?.() ?? []), ...global].map((a) => (
            <button
              key={a.label}
              onClick={async () => {
                await a.run();
                setOpen(false);
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      <button className="devtools-toggle" onClick={() => setOpen(!open)} aria-label="Test tools">
        🧪
      </button>
    </div>
  );
}

export function DevToolsProvider({ children }: { children: React.ReactNode }) {
  const [get, setGet] = useState<Getter | null>(null);
  // One function for good: a new one per render would make every page register again. A function in state is set
  // through an updater, or React would call it.
  const register = useCallback((g: Getter | null) => setGet(() => g), []);
  if (!DEV) return children;
  return (
    <Registry.Provider value={register}>
      {children}
      <Panel get={get} />
    </Registry.Provider>
  );
}
