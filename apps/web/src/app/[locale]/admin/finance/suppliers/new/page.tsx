'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import Link from 'next/link';

const CATEGORIES = [
  { value: 'FUEL_SUPPLY', label: 'Fuel Supply' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'UTILITIES', label: 'Utilities' },
  { value: 'EQUIPMENT', label: 'Equipment' },
  { value: 'OTHER', label: 'Other' },
];

interface FormData {
  name: string;
  taxId: string;
  category: string;
  email: string;
  phone: string;
  address: string;
}

export default function NewSupplierPage() {
  const t = useTranslations('Finance');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<FormData>({
    name: '',
    taxId: '',
    category: 'FUEL_SUPPLY',
    email: '',
    phone: '',
    address: '',
  });
  const [errors, setErrors] = useState<Partial<FormData>>({});

  const createSupplier = useMutation({
    mutationFn: (data: FormData) => api.post('/suppliers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      router.push(`/${locale}/admin/finance/suppliers`);
    },
    onError: (error: ApiError) => {
      if (error.code === 'DUPLICATE_TAX_ID') {
        setErrors({ taxId: t('suppliers.duplicateTaxId') });
      }
    },
  });

  const validate = (): boolean => {
    const newErrors: Partial<FormData> = {};

    if (!formData.name.trim()) {
      newErrors.name = t('suppliers.errors.nameRequired');
    }
    if (!formData.taxId.trim() || formData.taxId.length < 5) {
      newErrors.taxId = t('suppliers.errors.taxIdRequired');
    }
    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t('suppliers.errors.emailInvalid');
    }
    if (!formData.phone.trim() || formData.phone.length < 5) {
      newErrors.phone = t('suppliers.errors.phoneRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      createSupplier.mutate(formData);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/${locale}/admin/finance/suppliers`}
          className="rounded-lg p-2 hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{t('suppliers.newSupplier')}</h1>
          <p className="text-muted-foreground">{t('suppliers.newSupplierSubtitle')}</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="font-semibold">{t('suppliers.basicInfo')}</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('suppliers.name')} *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
                  errors.name ? 'border-red-500' : ''
                }`}
                placeholder={t('suppliers.namePlaceholder')}
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-500">{errors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t('suppliers.taxId')} *
              </label>
              <input
                type="text"
                name="taxId"
                value={formData.taxId}
                onChange={handleChange}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
                  errors.taxId ? 'border-red-500' : ''
                }`}
                placeholder={t('suppliers.taxIdPlaceholder')}
              />
              {errors.taxId && (
                <p className="mt-1 text-xs text-red-500">{errors.taxId}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('suppliers.category')} *
            </label>
            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="font-semibold">{t('suppliers.contactInfo')}</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('suppliers.email')} *
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
                  errors.email ? 'border-red-500' : ''
                }`}
                placeholder={t('suppliers.emailPlaceholder')}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-500">{errors.email}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t('suppliers.phone')} *
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
                  errors.phone ? 'border-red-500' : ''
                }`}
                placeholder={t('suppliers.phonePlaceholder')}
              />
              {errors.phone && (
                <p className="mt-1 text-xs text-red-500">{errors.phone}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('suppliers.address')}
            </label>
            <textarea
              name="address"
              value={formData.address}
              onChange={handleChange}
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={t('suppliers.addressPlaceholder')}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <Link
            href={`/${locale}/admin/finance/suppliers`}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            {t('common.cancel')}
          </Link>
          <button
            type="submit"
            disabled={createSupplier.isPending}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createSupplier.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
