'use client';

import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Users, LogOut, LayoutDashboard, Fuel, CalendarClock, DollarSign, Truck, Package, Bell, Mail, Receipt, ClipboardCheck, AlertTriangle, HelpCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { LanguageSwitcher } from '@/components/layout/language-switcher';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('Auth');
  const tNav = useTranslations('Nav');
  const locale = useLocale();
  const pathname = usePathname();
  const logout = useAuthStore((state) => state.logout);

  const navItems = [
    { href: '/admin/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
    { href: '/admin/stations', labelKey: 'stations', icon: Fuel },
    { href: '/admin/users', labelKey: 'users', icon: Users },
    { href: '/admin/shifts', labelKey: 'shifts', icon: CalendarClock },
    { href: '/admin/prices', labelKey: 'prices', icon: DollarSign },
    { href: '/admin/finance/invoices', labelKey: 'invoices', icon: Receipt },
    { href: '/admin/finance/expenses', labelKey: 'expenses', icon: DollarSign },
    { href: '/admin/checklists', labelKey: 'checklists', icon: ClipboardCheck },
    { href: '/admin/incidents', labelKey: 'incidents', icon: AlertTriangle },
    { href: '/admin/mails', labelKey: 'mails', icon: Mail },
    { href: '/admin/supply/replenishment', labelKey: 'replenishment', icon: Package },
    { href: '/admin/supply/deliveries', labelKey: 'deliveries', icon: Truck },
    { href: '/admin/notifications', labelKey: 'notifications', icon: Bell },
    { href: '/admin/help', labelKey: 'help', icon: HelpCircle },
  ];

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-md flex flex-col">
        <div className="p-6 border-b">
          <h1 className="text-xl font-bold text-blue-600">Alcom V4</h1>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const localizedHref = `/${locale}${item.href}`;
            const isActive = pathname.startsWith(localizedHref);
            return (
              <Link
                key={item.href}
                href={localizedHref}
                className={cn(
                  "flex items-center gap-3 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <item.icon className="h-5 w-5" />
                {tNav(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md"
          >
            <LogOut className="h-5 w-5" />
            {t('logout')}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <header className="sticky top-0 z-20 flex items-center justify-end gap-4 border-b bg-white px-8 py-3">
          <LanguageSwitcher />
          <NotificationBell />
        </header>
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
