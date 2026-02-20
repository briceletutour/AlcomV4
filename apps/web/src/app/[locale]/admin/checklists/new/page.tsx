'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { ArrowLeft, ArrowRight, Check, X, Camera, AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

interface ChecklistTemplate {
  id: string;
  name: string;
  version: number;
  categories: Array<{
    name: string;
    items: Array<{ id: string; label: string; labelFr?: string }>;
  }>;
}

interface Station {
  id: string;
  name: string;
  code: string;
}

interface ItemResponse {
  itemId: string;
  status: 'CONFORME' | 'NON_CONFORME';
  comment?: string;
  photoUrl?: string;
}

export default function NewChecklistPage() {
  const t = useTranslations('Checklists');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Wizard state
  const [step, setStep] = useState<'template' | 'inspection' | 'review'>('template');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedStationId, setSelectedStationId] = useState<string>('');
  const [shiftDate, setShiftDate] = useState(new Date().toISOString().split('T')[0]);
  const [shiftType, setShiftType] = useState<'MORNING' | 'EVENING'>('MORNING');
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, ItemResponse>>({});

  // Fetch templates
  const { data: templatesData } = useQuery({
    queryKey: ['checklist-templates'],
    queryFn: () => api.get<{ data: ChecklistTemplate[] }>('/checklist-templates'),
  });

  // Fetch stations
  const { data: stationsData } = useQuery({
    queryKey: ['stations'],
    queryFn: () => api.get<{ data: Station[] }>('/stations?limit=100'),
  });

  const templates = (templatesData as unknown as { data: ChecklistTemplate[] })?.data || [];
  const stations = (stationsData as unknown as { data: Station[] })?.data || [];
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  // Handle both nested { categories: [...] } and direct [...] structure
  const rawCategories = selectedTemplate?.categories;
  const categories = Array.isArray(rawCategories) 
    ? rawCategories 
    : (rawCategories as any)?.categories && Array.isArray((rawCategories as any).categories)
      ? (rawCategories as any).categories
      : [];
  const currentCategory = categories[currentCategoryIndex];

  // Get all items flat for review
  const allItems = categories.flatMap((cat) =>
    (Array.isArray(cat.items) ? cat.items : []).map((item) => ({ ...item, categoryName: cat.name }))
  );

  // Calculate stats
  const conformeCount = Object.values(responses).filter((r) => r.status === 'CONFORME').length;
  const nonConformeCount = Object.values(responses).filter((r) => r.status === 'NON_CONFORME').length;
  const score = allItems.length > 0 ? Math.round((conformeCount / allItems.length) * 100) : 0;

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: (data: {
      stationId: string;
      templateId: string;
      shiftDate: string;
      shiftType: string;
      items: ItemResponse[];
    }) => api.post('/checklists', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      router.push(`/${locale}/admin/checklists`);
    },
    onError: (error: ApiError) => {
      toast.error(error.message);
    },
  });

  const handleItemResponse = (itemId: string, status: 'CONFORME' | 'NON_CONFORME') => {
    setResponses((prev) => ({
      ...prev,
      [itemId]: {
        itemId,
        status,
        comment: prev[itemId]?.comment || '',
        photoUrl: prev[itemId]?.photoUrl || '',
      },
    }));
  };

  const handleItemComment = (itemId: string, comment: string) => {
    setResponses((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        comment,
      },
    }));
  };

  const handleItemPhoto = (itemId: string, photoUrl: string) => {
    setResponses((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        photoUrl,
      },
    }));
  };

  const canProceedToReview = () => {
    // All items must have a response
    return allItems.every((item) => responses[item.id]?.status);
  };

  const hasInvalidNonConforme = () => {
    // NON_CONFORME items need photo
    return Object.values(responses).some(
      (r) => r.status === 'NON_CONFORME' && !r.photoUrl
    );
  };

  const handleSubmit = () => {
    if (hasInvalidNonConforme()) {
      toast.error(t('wizard.requiredPhoto'));
      return;
    }

    submitMutation.mutate({
      stationId: selectedStationId,
      templateId: selectedTemplateId,
      shiftDate,
      shiftType,
      items: Object.values(responses),
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/${locale}/admin/checklists`}
          className="rounded-md p-2 hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{t('newChecklist')}</h1>
          <p className="text-sm text-muted-foreground">{t('newChecklistSubtitle')}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2">
        {['template', 'inspection', 'review'].map((s, idx) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                step === s
                  ? 'bg-primary text-primary-foreground'
                  : idx < ['template', 'inspection', 'review'].indexOf(step)
                  ? 'bg-green-500 text-white'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {idx + 1}
            </div>
            <span className={`text-sm ${step === s ? 'font-medium' : 'text-muted-foreground'}`}>
              {t(`wizard.step${idx + 1}`)}
            </span>
            {idx < 2 && <div className="h-0.5 flex-1 bg-muted" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1: Select Template */}
      {step === 'template' && (
        <div className="space-y-4 rounded-xl border p-6">
          <h2 className="text-lg font-semibold">{t('selectTemplate')}</h2>
          
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium">{t('station')}</span>
              <select
                value={selectedStationId}
                onChange={(e) => setSelectedStationId(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select station...</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium">{t('shiftDate')}</span>
                <input
                  type="date"
                  value={shiftDate}
                  onChange={(e) => setShiftDate(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">{t('shiftType')}</span>
                <select
                  value={shiftType}
                  onChange={(e) => setShiftType(e.target.value as 'MORNING' | 'EVENING')}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="MORNING">{t('morning')}</option>
                  <option value="EVENING">{t('evening')}</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium">{t('templates')}</span>
              <div className="mt-2 space-y-2">
                {templates.map((template) => (
                  <label
                    key={template.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition ${
                      selectedTemplateId === template.id
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="template"
                      value={template.id}
                      checked={selectedTemplateId === template.id}
                      onChange={() => setSelectedTemplateId(template.id)}
                      className="sr-only"
                    />
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                        selectedTemplateId === template.id
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground'
                      }`}
                    >
                      {selectedTemplateId === template.id && (
                        <Check className="h-3 w-3 text-white" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{template.name}</p>
                      <p className="text-sm text-muted-foreground">
                        v{template.version} • {Array.isArray(template.categories) 
                          ? template.categories.length 
                          : (template.categories as any)?.categories?.length || 0} categories
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </label>
          </div>

          <button
            onClick={() => {
              if (selectedTemplateId && selectedStationId) {
                setStep('inspection');
              }
            }}
            disabled={!selectedTemplateId || !selectedStationId}
            className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {t('wizard.next')}
            <ArrowRight className="ml-2 inline h-4 w-4" />
          </button>
        </div>
      )}

      {/* Step 2: Inspection Items */}
      {step === 'inspection' && currentCategory && (
        <div className="space-y-4">
          {/* Category progress */}
          <div className="flex items-center justify-between rounded-lg bg-muted p-3">
            <span className="font-medium">
              {currentCategory.name} ({currentCategoryIndex + 1}/{categories.length})
            </span>
            <div className="flex gap-1">
              {categories.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-2 w-6 rounded-full ${
                    idx < currentCategoryIndex
                      ? 'bg-green-500'
                      : idx === currentCategoryIndex
                      ? 'bg-primary'
                      : 'bg-muted-foreground/30'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Items */}
          <div className="space-y-3">
            {(Array.isArray(currentCategory?.items) ? currentCategory.items : []).map((item) => {
              const response = responses[item.id];
              const isNonConforme = response?.status === 'NON_CONFORME';

              return (
                <div key={item.id} className="rounded-xl border p-4">
                  <p className="mb-3 font-medium">
                    {locale === 'fr' ? (item.labelFr || item.label) : item.label}
                  </p>

                  {/* Big toggle buttons */}
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleItemResponse(item.id, 'CONFORME')}
                      className={`flex items-center justify-center gap-2 rounded-lg border-2 p-4 text-lg font-medium transition ${
                        response?.status === 'CONFORME'
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-muted hover:border-green-300'
                      }`}
                    >
                      <CheckCircle2 className="h-6 w-6" />
                      {t('wizard.itemOk')}
                    </button>
                    <button
                      onClick={() => handleItemResponse(item.id, 'NON_CONFORME')}
                      className={`flex items-center justify-center gap-2 rounded-lg border-2 p-4 text-lg font-medium transition ${
                        response?.status === 'NON_CONFORME'
                          ? 'border-red-500 bg-red-50 text-red-700'
                          : 'border-muted hover:border-red-300'
                      }`}
                    >
                      <X className="h-6 w-6" />
                      {t('wizard.itemNotOk')}
                    </button>
                  </div>

                  {/* Photo + Comment for NON_CONFORME */}
                  {isNonConforme && (
                    <div className="space-y-3 rounded-lg bg-red-50 p-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-red-700">
                          {t('wizard.takePhoto')} *
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              // In a real app, this would open camera
                              const mockUrl = `/uploads/evidence/${item.id}-${Date.now()}.jpg`;
                              handleItemPhoto(item.id, mockUrl);
                            }}
                            className="flex items-center gap-2 rounded-md border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-100"
                          >
                            <Camera className="h-4 w-4" />
                            {t('wizard.takePhoto')}
                          </button>
                          {response?.photoUrl && (
                            <span className="text-sm text-green-600">✓ Photo added</span>
                          )}
                        </div>
                        {!response?.photoUrl && (
                          <p className="mt-1 text-xs text-red-600">{t('wizard.requiredPhoto')}</p>
                        )}
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-red-700">
                          {t('wizard.comment')}
                        </label>
                        <textarea
                          value={response?.comment || ''}
                          onChange={(e) => handleItemComment(item.id, e.target.value)}
                          placeholder={t('wizard.commentPlaceholder')}
                          className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                          rows={2}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Navigation */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (currentCategoryIndex > 0) {
                  setCurrentCategoryIndex((i) => i - 1);
                } else {
                  setStep('template');
                }
              }}
              className="flex-1 rounded-md border px-4 py-3 text-sm font-medium hover:bg-muted"
            >
              <ArrowLeft className="mr-2 inline h-4 w-4" />
              {t('wizard.previous')}
            </button>
            <button
              onClick={() => {
                if (currentCategoryIndex < categories.length - 1) {
                  setCurrentCategoryIndex((i) => i + 1);
                } else if (canProceedToReview()) {
                  setStep('review');
                }
              }}
              disabled={
                currentCategoryIndex === categories.length - 1 && !canProceedToReview()
              }
              className="flex-1 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {currentCategoryIndex < categories.length - 1
                ? t('wizard.next')
                : t('wizard.review')}
              <ArrowRight className="ml-2 inline h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Submit */}
      {step === 'review' && (
        <div className="space-y-4">
          <div className="rounded-xl border p-6">
            <h2 className="mb-4 text-lg font-semibold">{t('wizard.summary')}</h2>

            {/* Score */}
            <div className="mb-6 text-center">
              <div
                className={`inline-flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold ${
                  score >= 90
                    ? 'bg-green-100 text-green-700'
                    : score >= 70
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {score}%
              </div>
            </div>

            {/* Stats */}
            <div className="mb-6 grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-green-50 p-4 text-center">
                <p className="text-2xl font-bold text-green-700">{conformeCount}</p>
                <p className="text-sm text-green-600">{t('wizard.itemsOk')}</p>
              </div>
              <div className="rounded-lg bg-red-50 p-4 text-center">
                <p className="text-2xl font-bold text-red-700">{nonConformeCount}</p>
                <p className="text-sm text-red-600">{t('wizard.itemsNotOk')}</p>
              </div>
            </div>

            {nonConformeCount > 0 && (
              <div className="mb-4 rounded-lg bg-amber-50 p-3 text-amber-700">
                <AlertCircle className="mr-2 inline h-5 w-5" />
                {t('wizard.incidentsWillBeCreated', { count: nonConformeCount })}
              </div>
            )}

            {/* Items summary */}
            <div className="max-h-60 space-y-2 overflow-auto">
              {allItems.map((item) => {
                const response = responses[item.id];
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <span className="text-sm">
                      {locale === 'fr' ? (item.labelFr || item.label) : item.label}
                    </span>
                    {response?.status === 'CONFORME' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <X className="h-5 w-5 text-red-500" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setStep('inspection');
                setCurrentCategoryIndex(categories.length - 1);
              }}
              className="flex-1 rounded-md border px-4 py-3 text-sm font-medium hover:bg-muted"
            >
              <ArrowLeft className="mr-2 inline h-4 w-4" />
              {t('wizard.previous')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitMutation.isPending || hasInvalidNonConforme()}
              className="flex-1 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitMutation.isPending ? 'Submitting...' : t('wizard.submit')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
