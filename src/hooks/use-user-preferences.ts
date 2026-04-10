"use client";

import { useEffect, useState, useCallback, useRef } from "react";

export function useUserPreferences<T>(scope: string, defaultValue: T) {
  const [preferences, setPreferences] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    const cached = localStorage.getItem(`pref:${scope}`);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        return defaultValue;
      }
    }
    return defaultValue;
  });
  const [loaded, setLoaded] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carregar do servidor na montagem
  useEffect(() => {
    fetch(`/api/user-preferences?scope=${encodeURIComponent(scope)}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.preferences) {
          setPreferences(data.preferences as T);
          try {
            localStorage.setItem(
              `pref:${scope}`,
              JSON.stringify(data.preferences)
            );
          } catch {
            /* ignore */
          }
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [scope]);

  // Salvar com debounce
  const updatePreferences = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setPreferences((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (p: T) => T)(prev)
            : updater;

        try {
          localStorage.setItem(`pref:${scope}`, JSON.stringify(next));
        } catch {
          /* ignore */
        }

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
          fetch("/api/user-preferences", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scope, preferences: next }),
          }).catch(() => {});
        }, 800);

        return next;
      });
    },
    [scope]
  );

  return { preferences, setPreferences: updatePreferences, loaded };
}
