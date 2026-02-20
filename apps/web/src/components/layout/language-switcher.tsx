'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { Globe } from 'lucide-react';

const locales = [
  { code: 'fr', label: 'FR', fullLabel: 'Français' },
  { code: 'en', label: 'EN', fullLabel: 'English' },
];

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const handleLocaleChange = (newLocale: string) => {
    // Replace the current locale in the pathname with the new one
    const segments = pathname.split('/');
    segments[1] = newLocale; // The locale is always the first segment after /
    const newPath = segments.join('/');
    router.push(newPath);
  };

  return (
    <div className="flex items-center gap-1">
      <Globe className="h-4 w-4 text-muted-foreground" />
      <div className="flex rounded-md border bg-muted/30">
        {locales.map((loc) => (
          <button
            key={loc.code}
            onClick={() => handleLocaleChange(loc.code)}
            className={`px-2 py-1 text-xs font-medium transition-colors ${
              locale === loc.code
                ? 'bg-primary text-primary-foreground rounded-md'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title={loc.fullLabel}
          >
            {loc.label}
          </button>
        ))}
      </div>
    </div>
  );
}
