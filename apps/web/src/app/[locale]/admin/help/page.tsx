'use client';

import { useState, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { BookOpen, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { HelpAccordion } from '@/components/help/help-accordion';
import { HelpSearch } from '@/components/help/help-search';
import { CalculationExample } from '@/components/help/calculation-example';
import { helpSections } from '@/lib/help-content';

export default function HelpPage() {
  const t = useTranslations('Help');
  const locale = useLocale();
  const [searchQuery, setSearchQuery] = useState('');

  // Filter sections based on search query
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) {
      return helpSections;
    }

    const normalized = searchQuery.toLowerCase().trim();

    return helpSections.filter((section) => {
      // Search in module title
      const titleMatch = t(`modules.${section.moduleKey}.title`)
        .toLowerCase()
        .includes(normalized);

      // Search in keywords
      const keywordMatch = section.keywords.some((k) =>
        k.toLowerCase().includes(normalized)
      );

      // Search in step titles and descriptions
      const contentMatch = section.steps.some(
        (step) =>
          t(step.titleKey).toLowerCase().includes(normalized) ||
          t(step.descriptionKey).toLowerCase().includes(normalized)
      );

      return titleMatch || keywordMatch || contentMatch;
    });
  }, [searchQuery, t]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <BookOpen className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
          </div>
          <p className="text-gray-600">{t('subtitle')}</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Quick Navigation - Desktop */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky top-8 bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">
                {t('quickNav')}
              </h2>
              <nav className="space-y-1">
                {helpSections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors flex items-center gap-2"
                  >
                    <section.icon className="w-4 h-4 text-gray-500" />
                    {t(`modules.${section.moduleKey}.title`)}
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 space-y-6">
            {/* Search */}
            <div className="no-print">
              <HelpSearch
                onSearch={handleSearch}
                resultCount={filteredSections.length}
              />
            </div>

            {/* No Results */}
            {filteredSections.length === 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                <p className="text-gray-500">{t('noResults')}</p>
              </div>
            )}

            {/* Help Sections */}
            <div className="space-y-4">
              {filteredSections.map((section) => (
                <div key={section.id} id={section.id}>
                  <HelpAccordion
                    title={t(`modules.${section.moduleKey}.title`)}
                    icon={<section.icon className="w-6 h-6" />}
                    defaultOpen={filteredSections.length === 1}
                    isOpen={
                      searchQuery.trim() && filteredSections.length <= 3
                        ? true
                        : undefined
                    }
                  >
                    <div className="space-y-6">
                      {/* 4-Step Workflow */}
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                          {t('workflowTitle')}
                        </h4>
                        <div className="space-y-3">
                          {section.steps.map((step) => (
                            <div
                              key={step.stepNumber}
                              className="flex gap-4 p-4 bg-white rounded-lg border border-gray-200"
                            >
                              <div className="flex-shrink-0">
                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center">
                                  {step.stepNumber}
                                </div>
                              </div>
                              <div className="flex-1">
                                <h5 className="font-semibold text-gray-900 mb-1">
                                  {t(step.titleKey)}
                                </h5>
                                <p className="text-sm text-gray-600">
                                  {t(step.descriptionKey)}
                                </p>
                                {step.roles && step.roles.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {step.roles.map((role) => (
                                      <span
                                        key={role}
                                        className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded"
                                      >
                                        {role}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Calculations */}
                      {section.calculations && section.calculations.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                            {t('calculationsTitle')}
                          </h4>
                          <div className="space-y-3">
                            {section.calculations.map((calc) => (
                              <CalculationExample
                                key={calc.nameKey}
                                title={t(calc.nameKey)}
                                formula={t(calc.formulaKey)}
                                example={
                                  calc.exampleKey
                                    ? JSON.parse(t(calc.exampleKey))
                                    : undefined
                                }
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Routes */}
                      {section.routes && section.routes.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                            {t('relatedRoutesTitle')}
                          </h4>
                          <div className="space-y-2">
                            {section.routes.map((route) => (
                              <Link
                                key={route.path}
                                href={`/${locale}${route.path}`}
                                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
                              >
                                <code className="text-sm font-mono text-blue-600">
                                  {route.path}
                                </code>
                                <span className="text-sm text-gray-600 flex-1">
                                  {t(route.descriptionKey)}
                                </span>
                                <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </HelpAccordion>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="text-center text-sm text-gray-500 pt-8 border-t border-gray-200 no-print">
              <p>{t('footer')}</p>
            </div>
          </main>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          details {
            display: block !important;
          }
          details > summary {
            display: none !important;
          }
          .help-section {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
