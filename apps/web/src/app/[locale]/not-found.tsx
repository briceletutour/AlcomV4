'use client';

import { useTranslations, useLocale } from 'next-intl';
import { FileQuestion, Home, ArrowLeft, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function NotFound() {
  const t = useTranslations('Errors');
  const locale = useLocale();
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100">
          <FileQuestion className="h-10 w-10 text-blue-600" />
        </div>
        
        <h1 className="mb-2 text-4xl font-bold text-gray-900">
          404
        </h1>
        
        <h2 className="mb-4 text-xl font-semibold text-gray-700">
          {t('notFound')}
        </h2>
        
        <p className="mb-8 text-gray-600">
          {t('pageNotFoundDescription') || 'The page you are looking for does not exist or has been moved.'}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('goBack') || 'Go back'}
          </button>
          
          <Link
            href={`/${locale}/admin/dashboard`}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-primary/90"
          >
            <Home className="h-4 w-4" />
            {t('goHome') || 'Go to dashboard'}
          </Link>
        </div>

        <div className="mt-12 border-t pt-8">
          <p className="mb-4 text-sm text-gray-500">
            {t('lookingForSomething') || 'Looking for something specific?'}
          </p>
          <div className="flex flex-wrap justify-center gap-2 text-sm">
            <Link
              href={`/${locale}/admin/stations`}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Search className="h-3 w-3" />
              Stations
            </Link>
            <span className="text-gray-300">•</span>
            <Link
              href={`/${locale}/admin/shifts`}
              className="text-primary hover:underline"
            >
              Shifts
            </Link>
            <span className="text-gray-300">•</span>
            <Link
              href={`/${locale}/admin/finance/expenses`}
              className="text-primary hover:underline"
            >
              Expenses
            </Link>
            <span className="text-gray-300">•</span>
            <Link
              href={`/${locale}/admin/users`}
              className="text-primary hover:underline"
            >
              Users
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
