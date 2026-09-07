import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../../components/AppLayout';
import ArbitreNav from '../../components/ArbitreNav';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

interface LigneHistorique {
  attempt_id: string;
  quiz_id: string;
  titre: string;
  submitted_at: string;
  score: number | null;
}

export default function Historique() {
  const { session } = useAuth();
  const [lignes, setLignes] = useState<LigneHistorique[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [retentionJours, setRetentionJours] = useState<number | null>(null);

  useEffect(() => {
    async function charger() {
      if (!session) return;
      setLoading(true);
      setErreur(null);

      const [{ data: attempts, error: err1 }, { data: reglage }] = await Promise.all([
        supabase
          .from('quiz_attempts')
          .select('id, quiz_id, submitted_at, score')
          .eq('user_id', session.user.id)
          .in('status', ['submitted', 'auto_submitted'])
          .order('submitted_at', { ascending: false }),
        supabase.from('app_settings').select('value').eq('key', 'arbitre_retention_days').maybeSingle(),
      ]);

      if (err1) {
        setErreur('Impossible de charger ton historique. Réessaie dans un instant.');
        setLoading(false);
        return;
      }
      setRetentionJours(reglage ? Number(reglage.value) : null);

      const quizIds = Array.from(new Set((attempts ?? []).map((a) => a.quiz_id)));
      let titres: Record<string, string> = {};
      if (quizIds.length > 0) {
        const { data: quizzesData } = await supabase.from('quizzes').select('id, title').in('id', quizIds);
        titres = Object.fromEntries((quizzesData ?? []).map((q) => [q.id, q.title]));
      }

      setLignes(
        (attempts ?? []).map((a) => ({
          attempt_id: a.id,
          quiz_id: a.quiz_id,
          titre: titres[a.quiz_id] ?? 'QCM',
          submitted_at: a.submitted_at,
          score: a.score,
        }))
      );
      setLoading(false);
    }
    charger();
  }, [session]);

  if (loading) {
    return (
      <AppLayout>
        <ArbitreNav />
        <p className="text-sm text-muted">Chargement…</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <ArbitreNav />
      <h1 className="text-lg font-semibold mb-1">Historique</h1>
      {retentionJours !== null && (
        <p className="text-xs text-muted mb-4">
          Consultable pendant {retentionJours} jours après chaque QCM.
        </p>
      )}

      {erreur && <p className="text-sm text-card-red mb-4">{erreur}</p>}
      {lignes.length === 0 && <p className="text-sm text-muted">Aucun QCM répondu pour le moment.</p>}

      <ul>
        {lignes.map((l) => (
          <li key={l.attempt_id} className="border-b border-border py-3">
            <Link
              to={`/arbitre/qcm/${l.quiz_id}/resultat/${l.attempt_id}`}
              className="flex items-center justify-between"
            >
              <div>
                <p className="text-sm">{l.titre}</p>
                <p className="text-xs text-muted">
                  Répondu le {new Date(l.submitted_at).toLocaleDateString('fr-FR')}
                </p>
              </div>
              {l.score !== null && <span className="text-sm font-medium">{l.score}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </AppLayout>
  );
}
