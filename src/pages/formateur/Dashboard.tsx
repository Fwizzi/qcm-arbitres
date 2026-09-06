import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../../components/AppLayout';
import FormateurNav from '../../components/FormateurNav';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

interface QuizRow {
  id: string;
  title: string;
  computed_status: 'draft' | 'a_venir' | 'actif' | 'expire';
  period_start: string;
  period_end: string;
}

const STATUT: Record<QuizRow['computed_status'], { label: string; className: string }> = {
  draft: { label: 'Brouillon', className: 'bg-canvas text-muted' },
  a_venir: { label: 'À venir', className: 'bg-card-yellow-bg text-card-yellow' },
  actif: { label: 'Actif', className: 'bg-pitch-light text-pitch-dark' },
  expire: { label: 'Expiré', className: 'bg-canvas text-muted' },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function FormateurDashboard() {
  const { session } = useAuth();
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function charger() {
      if (!session) return;
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('quizzes_with_computed_status')
        .select('id, title, computed_status, period_start, period_end')
        .eq('formateur_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) {
        setError('Impossible de charger tes QCM. Réessaie dans un instant.');
      } else {
        setQuizzes((data ?? []) as QuizRow[]);
      }
      setLoading(false);
    }
    charger();
  }, [session]);

  return (
    <AppLayout>
      <FormateurNav />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Mes QCM</h1>
        <Link
          to="/formateur/qcm/nouveau"
          className="text-sm border border-border rounded px-3 py-1.5"
        >
          + Nouveau
        </Link>
      </div>

      {loading && <p className="text-sm text-muted">Chargement…</p>}
      {error && <p className="text-sm text-card-red">{error}</p>}
      {!loading && !error && quizzes.length === 0 && (
        <p className="text-sm text-muted">Aucun QCM pour le moment.</p>
      )}

      <ul className="flex flex-col gap-2">
        {quizzes.map((q) => {
          const statut = STATUT[q.computed_status];
          return (
            <li key={q.id}>
              <Link
                to={`/formateur/qcm/${q.id}`}
                className="block bg-surface border border-border rounded p-3"
              >
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className="text-sm font-medium">{q.title}</span>
                  <span className={`text-xs rounded px-2 py-0.5 shrink-0 ${statut.className}`}>
                    {statut.label}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {formatDate(q.period_start)} → {formatDate(q.period_end)}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </AppLayout>
  );
}
