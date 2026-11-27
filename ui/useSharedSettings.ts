// Shared browser-persisted settings hook used by both Jigsaw and Sandbox
// (stored under penrose-puzzle.jigsaw-settings so settings persist seamlessly
// across modes and updates).
import { useEffect, useState } from 'react';
import { parseSettings, serializeSettings, SETTINGS_KEY, type AppSettings } from '../settings';

export const useSharedSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      return parseSettings(window.localStorage.getItem(SETTINGS_KEY));
    } catch {
      return parseSettings(null);
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, serializeSettings(settings));
    } catch {
      // Storage blocked: settings still apply until the page is reloaded
    }
  }, [settings]);
  return [settings, setSettings] as const;
};
