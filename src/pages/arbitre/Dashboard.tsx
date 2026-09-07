import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/AppLayout';
import ArbitreNav from '../../components/ArbitreNav';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

interface QuizDispo {
  id: string;
  title: string;
  time_limit_minutes: number;
  attempt: { statut: 'a_commencer' | 'en_cours'; started_at: string | null };
}

export default function ArbitreAccueil() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizDispo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [demarrage, setDemarrage] = useState<string | null>(null);

  async function charger() {
    if (!session) return;
    setLoading(true);
    setErreur(null);

    // RLS ne renvoie déjà que les QCM publiés, dans leur période, et ciblant
    // les groupes de cet arbitre — pas besoin de refiltrer manuellement.
    const { data: quizzesData, error: err1 } = await supabase
      .from('quizzes')
      .select('id, title, time_limit_minutes');
    const { data: attemptsData } = await supabase
      .from('quiz_attempts')
      .select('quiz_id, status, started_at')
      .eq('user_id', session.user.id);

    if (err1) {
      setErreur('Impossible de charger tes QCM. Réessaie dans un instant.');
      setLoading(false);
      return;
    }

    const liste: QuizDispo[] = [];
    for (const q of quizzesData ?? []) {
      const tentative = attemptsData?.find((a) => a.quiz_id === q.id);
      if (tentative && tentative.status !== 'in_progress') continue; // déjà soumis : disparaît
      liste.push({
        id: q.id,
        title: q.title,
        time_limit_minutes: q.time_limit_minutes,
        attempt: {
          statut: tentative ? 'en_cours' : 'a_commencer',
          started_at: tentative?.started_at ?? null,
        },
      });
    }
    setQuizzes(liste);
    setLoading(false);
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function commencer(quizId: string) {
    if (!session) return;
    setDemarrage(quizId);
    const { error } = await supabase
      .from('quiz_attempts')
      .insert({ quiz_id: quizId, user_id: session.user.id, status: 'in_progress' });
    setDemarrage(null);
    if (!error) navigate(`/arbitre/qcm/${quizId}`);
  }

  if (loading) {
    return (
      <AppLayout>
        <p className="text-sm text-muted">Chargement…</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <ArbitreNav />
      <h1 className="text-lg font-semibold mb-4">Mes QCM à faire</h1>
      {erreur && <p className="text-sm text-card-red mb-4">{erreur}</p>}

      {quizzes.length === 0 && (
        <p className="text-sm text-muted">Aucun QCM en attente pour le moment.</p>
      )}

      <ul className="flex flex-col gap-2">
        {quizzes.map((q) => (
          <li key={q.id} className="bg-surface border border-border rounded p-3">
            <p className="text-sm font-medium mb-1">{q.title}</p>
            <p className="text-xs text-muted mb-3">{q.time_limit_minutes} minutes</p>
            {q.attempt.statut === 'a_commencer' ? (
              <button
                type="button"
                onClick={() => commencer(q.id)}
                disabled={demarrage === q.id}
                className="w-full bg-pitch text-white font-medium rounded py-2 text-sm disabled:opacity-60"
              >
                {demarrage === q.id ? 'Démarrage…' : 'Commencer'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate(`/arbitre/qcm/${q.id}`)}
                className="w-full border border-pitch text-pitch font-medium rounded py-2 text-sm"
              >
                Reprendre
              </button>
            )}
          </li>
        ))}
      </ul>
    </AppLayout>
  );
}
