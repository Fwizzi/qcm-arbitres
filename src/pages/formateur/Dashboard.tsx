import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  created_at: string;
}

const STATUT: Record<QuizRow['computed_status'], { label: string; className: string }> = {
  draft: { label: 'Brouillon', className: 'bg-canvas text-muted' },
  a_venir: { label: 'À venir', className: 'bg-card-yellow-bg text-card-yellow' },
  actif: { label: 'Actif', className: 'bg-pitch-light text-pitch-dark' },
  expire: { label: 'Expiré', className: 'bg-canvas text-muted' },
};

// Ordre d'affichage : ce qui se passe maintenant en premier, ce qui est
// terminé en dernier — plutôt que l'ordre de création.
const PRIORITE_STATUT: Record<QuizRow['computed_status'], number> = {
  actif: 0,
  draft: 1,
  a_venir: 2,
  expire: 3,
};

function formatDate(d: string) {
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function trierQuizzes(liste: QuizRow[]): QuizRow[] {
  return [...liste].sort((a, b) => {
    const diffPriorite = PRIORITE_STATUT[a.computed_status] - PRIORITE_STATUT[b.computed_status];
    if (diffPriorite !== 0) return diffPriorite;

    // À l'intérieur d'un même statut : le plus pertinent en premier.
    switch (a.computed_status) {
      case 'actif':
        // Celui qui se termine le plus tôt est le plus urgent à surveiller.
        return new Date(a.period_end).getTime() - new Date(b.period_end).getTime();
      case 'a_venir':
        // Celui qui démarre le plus tôt en premier.
        return new Date(a.period_start).getTime() - new Date(b.period_start).getTime();
      case 'draft':
        // Le brouillon le plus récemment créé en premier.
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'expire':
        // Le plus récemment expiré en premier (encore pertinent).
        return new Date(b.period_end).getTime() - new Date(a.period_end).getTime();
      default:
        return 0;
    }
  });
}

export default function FormateurDashboard() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);

  useEffect(() => {
    async function charger() {
      if (!session) return;
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('quizzes_with_computed_status')
        .select('id, title, computed_status, period_start, period_end, created_at')
        .eq('formateur_id', session.user.id);

      if (error) {
        setError('Impossible de charger tes QCM. Réessaie dans un instant.');
      } else {
        setQuizzes(trierQuizzes((data ?? []) as QuizRow[]));
      }
      setLoading(false);
    }
    charger();
  }, [session]);

  async function creerNouveauQcm() {
    if (!session) return;
    setCreation(true);
    setError(null);

    const maintenant = new Date();
    const dansUneSemaine = new Date(maintenant.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('quizzes')
      .insert({
        formateur_id: session.user.id,
        title: 'Nouveau QCM',
        status: 'draft',
        time_limit_minutes: 20,
        show_score: true,
        show_correction: true,
        show_expected_count: true,
        period_start: maintenant.toISOString(),
        period_end: dansUneSemaine.toISOString(),
      })
      .select('id')
      .single();

    setCreation(false);
    if (error || !data) {
      setError('La création du QCM a échoué. Réessaie dans un instant.');
      return;
    }
    navigate(`/formateur/qcm/${data.id}`);
  }

  return (
    <AppLayout>
      <FormateurNav />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Mes QCM</h1>
        <button
          type="button"
          onClick={creerNouveauQcm}
          disabled={creation}
          className="text-sm border border-border rounded px-3 py-1.5 disabled:opacity-60"
        >
          {creation ? 'Création…' : '+ Nouveau'}
        </button>
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
            <li key={q.id} className="bg-surface border border-border rounded p-3">
              <Link to={`/formateur/qcm/${q.id}`} className="block mb-2">
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
              <Link
                to={`/formateur/qcm/${q.id}/resultats`}
                className="block text-center text-xs border border-border rounded py-1.5"
              >
                Voir les résultats
              </Link>
            </li>
          );
        })}
      </ul>
    </AppLayout>
  );
}
