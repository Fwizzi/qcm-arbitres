import AppLayout from '../../components/AppLayout';
import AdminNav from '../../components/AdminNav';

export default function Journal() {
  return (
    <AppLayout>
      <AdminNav />
      <h1 className="text-lg font-semibold mb-1">Journal d'activité</h1>
      <p className="text-sm text-muted">Cet écran sera complété prochainement.</p>
    </AppLayout>
  );
}
