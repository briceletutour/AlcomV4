'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, ForgotPasswordInput } from '@alcom/shared/src/schemas/auth.schema';
import { api } from '@/lib/api-client';
import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [success, setSuccess] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordInput) => {
    try {
      await api.post('/auth/forgot-password', data);
      setSuccess(true);
    } catch (err) {
      // Typically we don't show error to avoid enumeration, but for dev we might log it
      setSuccess(true); 
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md bg-white p-8 rounded shadow text-center">
          <h2 className="text-xl font-bold mb-4">Email Envoyé</h2>
          <p className="text-gray-600 mb-6">
            Si un compte existe avec cette adresse, vous recevrez un lien de réinitialisation.
          </p>
          <Link href="/auth/login" className="text-blue-600 hover:underline">
            Retour à la connexion
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded shadow">
        <h2 className="text-xl font-bold mb-6 text-center">Mot de passe oublié</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" {...register('email')} className="w-full border rounded p-2" />
            {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Envoi...' : 'Envoyer le lien'}
          </button>
           <div className="text-center text-sm">
            <Link href="/auth/login" className="text-blue-600 hover:underline">
              Annuler
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
