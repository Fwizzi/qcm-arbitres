import { type ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import RoleSwitcher from './RoleSwitcher';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between gap-3">
        <RoleSwitcher />
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-sm text-muted hidden sm:inline">{profile?.full_name}</span>
          <button onClick={() => signOut()} className="text-sm text-muted underline">
            Déconnexion
          </button>
        </div>
      </header>
      <main className="max-w-md mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
