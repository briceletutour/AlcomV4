'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createUserSchema, CreateUserInput } from '@alcom/shared/src/schemas/user.schema';
import { api } from '@/lib/api-client';
import { useRouter } from 'next/navigation';

import { toast } from 'sonner';

export default function NewUserPage() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
  });

  const onSubmit = async (data: CreateUserInput) => {
    try {
      await api.post('/users', data);
      toast.success('Utilisateur créé avec succès');
      router.push('/admin/users');
    } catch (err: any) {
      toast.error('Erreur lors de la création', {
        description: err.message,
      });
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow">
      <h1 className="text-2xl font-bold mb-6">Nouvel utilisateur</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input {...register('email')} className="w-full border rounded p-2" />
          {errors.email && <p className="text-red-500 text-sm">{errors.email.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Nom complet</label>
          <input {...register('fullName')} className="w-full border rounded p-2" />
          {errors.fullName && <p className="text-red-500 text-sm">{errors.fullName.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Rôle</label>
          <select {...register('role')} className="w-full border rounded p-2">
            <option value="POMPISTE">Pompiste</option>
            <option value="CHEF_PISTE">Chef de Piste</option>
            <option value="STATION_MANAGER">Manager Station</option>
            <option value="FINANCE_DIR">Directeur Financier</option>
            <option value="SUPER_ADMIN">Admin</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Langue</label>
          <select {...register('language')} className="w-full border rounded p-2">
            <option value="FR">Français</option>
            <option value="EN">Anglais</option>
          </select>
        </div>



        <div className="flex justify-end gap-2 pt-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 border rounded hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Création...' : 'Créer'}
          </button>
        </div>
      </form>
    </div>
  );
}
