import AppLayout from '../../components/AppLayout';
import { useAuth } from '../../hooks/useAuth';

export default function AdminDashboard() {
  const { profile } = useAuth();

  return (
    <AppLayout>
      <h1 className="text-lg font-semibold mb-1">Vue d'ensemble</h1>
      <p className="text-sm text-muted">
        Bonjour {profile?.full_name}. Cet écran sera complété avec les chiffres clés, le journal
        d'activité et les réglages, comme validé sur les maquettes.
      </p>
    </AppLayout>
  );
}
