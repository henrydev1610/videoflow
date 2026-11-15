import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { z } from 'zod';
export const preferencesSchema = z.object({
  version: z.literal(1),
  theme: z.enum(['system', 'light', 'dark']),
  format: z.enum(['mp4', 'mp3']),
  quality: z.enum(['low', 'medium', 'high']),
  density: z.enum(['comfortable', 'compact']),
  pageSize: z.union([z.literal(10), z.literal(20), z.literal(50)]),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const defaults: Preferences = {
  version: 1,
  theme: 'system',
  format: 'mp4',
  quality: 'medium',
  density: 'comfortable',
  pageSize: 20,
};
export const preferenceKey = 'videoflow.preferences.v1';
export function readPreferences(
  storage: Pick<Storage, 'getItem'>,
): Preferences {
  try {
    const parsed = preferencesSchema.safeParse(
      JSON.parse(storage.getItem(preferenceKey) ?? 'null'),
    );
    return parsed.success ? parsed.data : defaults;
  } catch {
    return defaults;
  }
}
const Context = createContext<{
  preferences: Preferences;
  set: (patch: Partial<Preferences>) => void;
  temporary: boolean;
}>({ preferences: defaults, set: () => {}, temporary: false });
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, update] = useState(() => {
    try {
      return readPreferences(localStorage);
    } catch {
      return defaults;
    }
  });
  const [temporary, setTemporary] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(preferences));
    } catch {
      setTemporary(true);
    }
  }, [preferences]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.classList.toggle(
        'dark',
        preferences.theme === 'dark' ||
          (preferences.theme === 'system' && media.matches),
      );
      document.documentElement.dataset.density = preferences.density;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preferences]);
  return (
    <Context.Provider
      value={{
        preferences,
        set: (patch) =>
          update((p) => preferencesSchema.parse({ ...p, ...patch })),
        temporary,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const usePreferences = () => useContext(Context);
