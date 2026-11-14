import React from 'react';
import { Languages } from 'lucide-react';
import { LANGUAGES, useLang, useT } from '../i18n';
import type { LangCode } from '../i18n';

/** Language picker. The choice is saved in the browser and used for the PDF and CSV too. */
export const LanguageSelect: React.FC<{ className?: string }> = ({ className = '' }) => {
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const t = useT();
  return (
    <label className={`flex items-center gap-2 text-slate-300 ${className}`}>
      <Languages className="w-4 h-4 shrink-0" aria-hidden />
      <span className="sr-only">{t('lang')}</span>
      <select
        id="language-select"
        aria-label={t('lang')}
        value={lang}
        onChange={(e) => setLang(e.target.value as LangCode)}
        className="bg-slate-900 text-white border border-slate-600 rounded px-2 py-1 text-sm outline-none cursor-pointer"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>{l.name}</option>
        ))}
      </select>
    </label>
  );
};
