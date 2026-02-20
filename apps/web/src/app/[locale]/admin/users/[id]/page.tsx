'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updateUserSchema, UpdateUserInput } from '@alcom/shared/src/schemas/user.schema';
import { Modal } from '@/components/shared/Modal';

export default function EditUserPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: () => api.get<any>(`/users/${id}`),
  });

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema),
    values: user, // Check if this populates correctly
  });

  const mutation = useMutation({
    mutationFn: (data: UpdateUserInput) => api.put(`/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      router.push('/admin/users');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowDeleteModal(false);
      router.push('/admin/users');
    },
  });

  if (isLoading) return <div>Chargement...</div>;

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Modifier Utilisateur</h1>
        <button
          type="button"
          onClick={() => setShowDeleteModal(true)}
          className="text-red-600 hover:bg-red-50 px-3 py-1 rounded"
        >
          Supprimer
        </button>
      </div>

      <Modal
        open={showDeleteModal}
        title="Supprimer Utilisateur"
        description="Êtes-vous sûr de vouloir supprimer cet utilisateur ?"
        confirmLabel="Supprimer"
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setShowDeleteModal(false)}
      />

      <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Nom complet</label>
          <input {...register('fullName')} className="w-full border rounded p-2" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Rôle</label>
          <select {...register('role')} className="w-full border rounded p-2">
            <option value="POMPISTE">Pompiste</option>
            <option value="CHEF_PISTE">Chef de Piste</option>
            <option value="STATION_MANAGER">Manager Station</option>
            <option value="SUPER_ADMIN">Admin</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" {...register('isActive')} id="isActive" />
          <label htmlFor="isActive">Compte Actif</label>
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
            {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  );
}
