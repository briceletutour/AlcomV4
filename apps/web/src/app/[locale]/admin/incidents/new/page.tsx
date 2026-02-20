'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { ArrowLeft, Camera } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

interface Station {
  id: string;
  name: string;
  code: string;
}

const CATEGORIES = [
  'EQUIPMENT',
  'SAFETY',
  'BRANDING',
  'MAINTENANCE',
  'OTHER',
];

export default function NewIncidentPage() {
  const t = useTranslations('Incidents');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [stationId, setStationId] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch stations
  const { data: stationsData } = useQuery({
    queryKey: ['stations'],
    queryFn: () => api.get<{ data: Station[] }>('/stations?limit=100'),
  });

  const stations = (stationsData as unknown as { data: Station[] })?.data || [];

  const submitMutation = useMutation({
    mutationFn: (data: { stationId: string; category: string; description: string; photoUrl?: string }) =>
      api.post('/incidents', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      router.push(`/${locale}/admin/incidents`);
    },
    onError: (error: ApiError) => {
      toast.error(error.message);
    },
  });

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!stationId) newErrors.stationId = 'Station is required';
    if (!category) newErrors.category = t('errors.categoryRequired');
    if (description.length < 5) newErrors.description = t('errors.descriptionRequired');

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    submitMutation.mutate({
      stationId,
      category,
      description,
      ...(photoUrl && { photoUrl }),
    });
  };

  const getCategoryLabel = (cat: string) => {
    const key = `category${cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase()}` as keyof typeof t;
    return t(key as any) || cat;
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/${locale}/admin/incidents`} className="rounded-md p-2 hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{t('newIncident')}</h1>
          <p className="text-sm text-muted-foreground">{t('newIncidentSubtitle')}</p>
        </div>
      </div>



      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border p-6">
        {/* Station */}
        <div>
          <label className="mb-1 block text-sm font-medium">{t('station')} *</label>
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            className={`w-full rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${errors.stationId ? 'border-red-500' : ''
              }`}
          >
            <option value="">Select station...</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} - {s.name}
              </option>
            ))}
          </select>
          {errors.stationId && <p className="mt-1 text-xs text-red-500">{errors.stationId}</p>}
        </div>

        {/* Category */}
        <div>
          <label className="mb-1 block text-sm font-medium">{t('category')} *</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={`w-full rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${errors.category ? 'border-red-500' : ''
              }`}
          >
            <option value="">Select category...</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {getCategoryLabel(cat)}
              </option>
            ))}
          </select>
          {errors.category && <p className="mt-1 text-xs text-red-500">{errors.category}</p>}
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-sm font-medium">{t('description')} *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('descriptionPlaceholder')}
            rows={4}
            className={`w-full rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${errors.description ? 'border-red-500' : ''
              }`}
          />
          {errors.description && <p className="mt-1 text-xs text-red-500">{errors.description}</p>}
        </div>

        {/* Photo */}
        <div>
          <label className="mb-1 block text-sm font-medium">
            {t('photo')} <span className="text-muted-foreground">({t('photoOptional')})</span>
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                // In a real app, this would open camera or file picker
                const mockUrl = `/uploads/incidents/manual-${Date.now()}.jpg`;
                setPhotoUrl(mockUrl);
              }}
              className="flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm hover:bg-muted"
            >
              <Camera className="h-4 w-4" />
              {t('takePhoto')}
            </button>
            {photoUrl && <span className="text-sm text-green-600">✓ Photo added</span>}
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitMutation.isPending}
          className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitMutation.isPending ? 'Submitting...' : t('submit')}
        </button>
      </form>
    </div>
  );
}
