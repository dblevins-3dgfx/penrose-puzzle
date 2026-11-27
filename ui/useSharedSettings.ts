// Shared browser-persisted settings hook used by both Jigsaw and Sandbox
// (stored under penrose-puzzle.jigsaw-settings so Visual effects and Sound
// effects stay in sync across modes).
import { useEffect, useState } from 'react';
import { parseSettings, serializeSettings, SETTINGS_KEY, type JigsawSettings } from '../settings';

export const useSharedSettings = () => {
  const [settings, setSettings] = useState<JigsawSettings>(() => {
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
