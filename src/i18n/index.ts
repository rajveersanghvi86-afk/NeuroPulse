import { create } from 'zustand';
import type { Dict, TKey } from './en';
import en from './en';
export type { TKey } from './en';

export const LANGUAGES = [
  { code: 'en', name: 'English', locale: 'en-GB' },
  { code: 'hi', name: 'हिन्दी', locale: 'hi-IN' },
  { code: 'es', name: 'Español', locale: 'es-ES' },
  { code: 'fr', name: 'Français', locale: 'fr-FR' },
  { code: 'de', name: 'Deutsch', locale: 'de-DE' },
  { code: 'pt', name: 'Português', locale: 'pt-BR' },
  { code: 'ru', name: 'Русский', locale: 'ru-RU' },
  { code: 'zh', name: '中文', locale: 'zh-CN' },
  { code: 'ja', name: '日本語', locale: 'ja-JP' },
  { code: 'ar', name: 'العربية', locale: 'ar' },
] as const;

export type LangCode = (typeof LANGUAGES)[number]['code'];

// English ships with the app; every other language is downloaded the first time it is selected.
const DICTS: Partial<Record<LangCode, Dict>> = { en };
const LOADERS: Record<Exclude<LangCode, 'en'>, () => Promise<{ default: Dict }>> = {
  hi: () => import('./hi'),
  es: () => import('./es'),
  fr: () => import('./fr'),
  de: () => import('./de'),
  pt: () => import('./pt'),
  ru: () => import('./ru'),
  zh: () => import('./zh'),
  ja: () => import('./ja'),
  ar: () => import('./ar'),
};

async function loadDict(lang: LangCode): Promise<boolean> {
  if (DICTS[lang]) return true;
  try {
    DICTS[lang] = (await LOADERS[lang as Exclude<LangCode, 'en'>]()).default;
    return true;
  } catch (e) {
    console.error('Could not load language', lang, e);
    return false;
  }
}
const STORAGE_KEY = 'neuropulse.lang';
const isLang = (c: string | null | undefined): c is LangCode => !!c && LANGUAGES.some((l) => l.code === c);

/** Saved choice first, then the browser's language, then English. */
function initialLang(): LangCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language?.slice(0, 2).toLowerCase() : null;
  return isLang(nav) ? nav : 'en';
}

function applyToDocument(lang: LangCode) {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export const useLang = create<{ lang: LangCode; setLang: (l: LangCode) => Promise<void> }>((set) => ({
  // Starts in English and switches as soon as the saved language has loaded (see initLanguage).
  lang: 'en',
  setLang: async (lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* keep it for this visit only */
    }
    if (!(await loadDict(lang))) return;
    applyToDocument(lang);
    set({ lang });
  },
}));

/** Call once before the first render: loads the remembered (or browser) language. */
export async function initLanguage() {
  const lang = initialLang();
  if (lang !== 'en' && (await loadDict(lang))) useLang.setState({ lang });
  applyToDocument(useLang.getState().lang);
}

export type TParams = Record<string, string | number>;

function translate(lang: LangCode, key: TKey, params?: TParams): string {
  let s = DICTS[lang]?.[key] ?? en[key] ?? key;
  if (params) for (const k in params) s = s.split(`{${k}}`).join(String(params[k]));
  return s;
}

/** Translate outside React (engines, PDF, CSV). Uses the language selected right now. */
export const t = (key: TKey, params?: TParams) => translate(useLang.getState().lang, key, params);

/** Translate inside React: the component re-renders when the language changes. */
export function useT() {
  const lang = useLang((s) => s.lang);
  return (key: TKey, params?: TParams) => translate(lang, key, params);
}

export const currentLocale = () => LANGUAGES.find((l) => l.code === useLang.getState().lang)!.locale;
export const isRtl = () => useLang.getState().lang === 'ar';
