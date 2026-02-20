'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Plus } from 'lucide-react';

interface User {
  id: string;
  fullName: string;
  email: string;
  role: string;
  assignedStation: { name: string } | null;
  isActive: boolean;
  lastLogin: string | null;
}

export default function UsersPage() {
  const t = useTranslations('Users'); // We'll need to add this namespace
  const locale = useLocale();
  
  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ data: User[], meta: any }>('/users').then((r) => r.data),
  });

  const columns = [
    { key: 'fullName', header: 'Nom complet' },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Rôle' },
    { 
      key: 'station', 
      header: 'Station',
      render: (u: User) => u.assignedStation?.name || '-'
    },
    { 
      key: 'status', 
      header: 'Statut',
      render: (u: User) => (
        <StatusBadge
          status={u.isActive ? 'success' : 'neutral'}
          label={u.isActive ? 'Actif' : 'Inactif'}
        />
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (u: User) => (
        <Link href={`/${locale}/admin/users/${u.id}`} className="text-blue-600 hover:underline">
          Modifier
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Utilisateurs</h1>
        <Link
          href={`/${locale}/admin/users/new`}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Nouvel utilisateur
        </Link>
      </div>

      <DataTable
        columns={columns}
        data={data || []}
        keyExtractor={(p) => p.id}
        isLoading={isLoading}
      />
    </div>
  );
}
