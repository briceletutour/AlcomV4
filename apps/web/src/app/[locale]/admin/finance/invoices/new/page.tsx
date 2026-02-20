'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, apiFetch } from '@/lib/api-client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { ArrowLeft, Save, Loader2, Upload, FileText, X } from 'lucide-react';
import Link from 'next/link';

interface Supplier {
  id: string;
  name: string;
  taxId: string;
}

interface UploadResponse {
  id: string;
  fileUrl: string;
  fileName: string;
}

interface FormData {
  supplierId: string;
  invoiceNumber: string;
  amount: string;
  dueDate: string;
  fileUrl: string;
}

export default function NewInvoicePage() {
  const t = useTranslations('Finance');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const preselectedSupplierId = searchParams.get('supplierId') || '';

  const [formData, setFormData] = useState<FormData>({
    supplierId: preselectedSupplierId,
    invoiceNumber: '',
    amount: '',
    dueDate: '',
    fileUrl: '',
  });
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [uploadedFile, setUploadedFile] = useState<{ name: string; url: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Fetch suppliers for dropdown
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers', 'active'],
    queryFn: () => api.get<Supplier[]>('/suppliers?isActive=true&limit=100'),
  });

  const suppliers = Array.isArray(suppliersData) ? suppliersData : [];

  const createInvoice = useMutation({
    mutationFn: (data: { supplierId: string; invoiceNumber: string; amount: number; dueDate: string; fileUrl: string }) =>
      api.post('/invoices', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      router.push(`/${locale}/admin/finance/invoices`);
    },
    onError: (error: ApiError) => {
      if (error.code === 'SUPPLIER_NOT_FOUND') {
        setErrors({ supplierId: t('invoices.errors.supplierNotFound') });
      }
    },
  });

  const validate = (): boolean => {
    const newErrors: Partial<FormData> = {};

    if (!formData.supplierId) {
      newErrors.supplierId = t('invoices.errors.supplierRequired');
    }
    if (!formData.invoiceNumber.trim()) {
      newErrors.invoiceNumber = t('invoices.errors.invoiceNumberRequired');
    }
    const amount = parseFloat(formData.amount);
    if (!formData.amount || isNaN(amount) || amount <= 0) {
      newErrors.amount = t('invoices.errors.amountRequired');
    }
    if (!formData.dueDate) {
      newErrors.dueDate = t('invoices.errors.dueDateRequired');
    }
    if (!formData.fileUrl) {
      newErrors.fileUrl = t('invoices.errors.fileRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      createInvoice.mutate({
        supplierId: formData.supplierId,
        invoiceNumber: formData.invoiceNumber,
        amount: parseFloat(formData.amount),
        dueDate: formData.dueDate,
        fileUrl: formData.fileUrl,
      });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      setErrors({ fileUrl: t('invoices.errors.invalidFileType') });
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setErrors({ fileUrl: t('invoices.errors.fileTooLarge') });
      return;
    }

    setIsUploading(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);

      const token = localStorage.getItem('access_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/files/upload?module=invoices`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formDataUpload,
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error?.message || 'Upload failed');
      }

      setUploadedFile({ name: file.name, url: json.data.fileUrl });
      setFormData((prev) => ({ ...prev, fileUrl: json.data.fileUrl }));
      setErrors((prev) => ({ ...prev, fileUrl: undefined }));
    } catch (error) {
      setErrors({ fileUrl: t('invoices.errors.uploadFailed') });
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = () => {
    setUploadedFile(null);
    setFormData((prev) => ({ ...prev, fileUrl: '' }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/${locale}/admin/finance/invoices`}
          className="rounded-lg p-2 hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{t('invoices.newInvoice')}</h1>
          <p className="text-muted-foreground">{t('invoices.newInvoiceSubtitle')}</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="font-semibold">{t('invoices.invoiceDetails')}</h2>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('invoices.supplier')} *
            </label>
            <select
              name="supplierId"
              value={formData.supplierId}
              onChange={handleChange}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
                errors.supplierId ? 'border-red-500' : ''
              }`}
            >
              <option value="">{t('invoices.selectSupplier')}</option>
              {suppliers.map((sup: Supplier) => (
                <option key={sup.id} value={sup.id}>
                  {sup.name} ({sup.taxId})
                </option>
              ))}
            </select>
            {errors.supplierId && (
              <p className="mt-1 text-xs text-red-500">{errors.supplierId}</p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('invoices.invoiceNumber')} *
              </label>
              <input
                type="text"
                name="invoiceNumber"
                value={formData.invoiceNumber}
                onChange={handleChange}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
                  errors.invoiceNumber ? 'border-red-500' : ''
                }`}
                placeholder={t('invoices.invoiceNumberPlaceholder')}
              />
              {errors.invoiceNumber && (
                <p className="mt-1 text-xs text-red-500">{errors.invoiceNumber}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t('invoices.amount')} (XAF) *
              </label>
              <input
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                min="0"
                step="1"
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
                  errors.amount ? 'border-red-500' : ''
                }`}
                placeholder={t('invoices.amountPlaceholder')}
              />
              {errors.amount && (
                <p className="mt-1 text-xs text-red-500">{errors.amount}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('invoices.dueDate')} *
            </label>
            <input
              type="date"
              name="dueDate"
              value={formData.dueDate}
              onChange={handleChange}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
                errors.dueDate ? 'border-red-500' : ''
              }`}
            />
            {errors.dueDate && (
              <p className="mt-1 text-xs text-red-500">{errors.dueDate}</p>
            )}
          </div>
        </div>

        {/* File Upload */}
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="font-semibold">{t('invoices.invoiceDocument')}</h2>

          {uploadedFile ? (
            <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-green-600" />
                <div>
                  <p className="font-medium">{uploadedFile.name}</p>
                  <p className="text-sm text-muted-foreground">{t('invoices.fileUploaded')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={removeFile}
                className="rounded-lg p-2 hover:bg-green-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors hover:bg-muted/50 ${
                errors.fileUrl ? 'border-red-500' : 'border-muted-foreground/25'
              }`}
            >
              {isUploading ? (
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              ) : (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium">{t('invoices.uploadFile')}</p>
                  <p className="text-xs text-muted-foreground">{t('invoices.supportedFormats')}</p>
                </>
              )}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileUpload}
            className="hidden"
          />
          {errors.fileUrl && (
            <p className="text-xs text-red-500">{errors.fileUrl}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <Link
            href={`/${locale}/admin/finance/invoices`}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            {t('common.cancel')}
          </Link>
          <button
            type="submit"
            disabled={createInvoice.isPending || isUploading}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createInvoice.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t('invoices.submitForApproval')}
          </button>
        </div>
      </form>
    </div>
  );
}
