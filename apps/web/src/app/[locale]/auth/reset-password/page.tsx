'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema, ResetPasswordInput } from '@alcom/shared/src/schemas/auth.schema';
import { api } from '@/lib/api-client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token: token || '' }
  });

  const onSubmit = async (data: ResetPasswordInput) => {
    try {
      await api.post('/auth/reset-password', data);
      router.push('/auth/login?reset=success');
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la réinitialisation');
    }
  };

  if (!token) {
    return <div className="p-8 text-center text-red-600">Jeton invalide ou manquant.</div>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded shadow">
        <h2 className="text-xl font-bold mb-6 text-center">Nouveau mot de passe</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input type="hidden" {...register('token')} />
          
          <div>
            <label className="block text-sm font-medium mb-1">Nouveau mot de passe</label>
            <input type="password" {...register('password')} className="w-full border rounded p-2" />
            {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
          </div>

           <div>
            <label className="block text-sm font-medium mb-1">Confirmer</label>
            <input type="password" {...register('confirmPassword')} className="w-full border rounded p-2" />
            {errors.confirmPassword && <p className="text-sm text-red-600">{errors.confirmPassword.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Réinitialisation...' : 'Changer le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  );
}
