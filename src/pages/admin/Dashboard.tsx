import { useEffect, useState } from 'react';
import AppLayout from '../../components/AppLayout';
import AdminNav from '../../components/AdminNav';
import { supabase } from '../../lib/supabaseClient';

interface QuizVue {
  id: string;
  title: string;
  computed_status: 'draft' | 'a_venir' | 'actif' | 'expire';
  formateur_nom: string;
  repondus: number;
  cibles: number;
}

const STATUT: Record<QuizVue['computed_status'], { label: string; className: string }> = {
  draft: { label: 'Brouillon', className: 'bg-canvas text-muted' },
  a_venir: { label: 'À venir', className: 'bg-card-yellow-bg text-card-yellow' },
  actif: { label: 'Actif', className: 'bg-pitch-light text-pitch-dark' },
  expire: { label: 'Expiré', className: 'bg-canvas text-muted' },
};

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nbFormateurs, setNbFormateurs] = useState(0);
  const [nbArbitres, setNbArbitres] = useState(0);
  const [nbActifs, setNbActifs] = useState(0);
  const [nbNonRepondants, setNbNonRepondants] = useState(0);
  const [quizzes, setQuizzes] = useState<QuizVue[]>([]);

  useEffect(() => {
    async function charger() {
      setLoading(true);
      setErreur(null);

      const [
        { data: roles },
        { data: quizzesData, error: err1 },
        { data: profils },
        { data: quizGroups },
        { data: groupMembers },
        { data: attempts },
      ] = await Promise.all([
        supabase.from('user_roles').select('user_id, role'),
        supabase.from('quizzes_with_computed_status').select('id, title, formateur_id, computed_status'),
        supabase.from('profiles').select('id, full_name'),
        supabase.from('quiz_groups').select('quiz_id, group_id'),
        supabase.from('group_members').select('group_id, user_id'),
        supabase.from('quiz_attempts').select('quiz_id, user_id, status'),
      ]);

      if (err1) {
        setErreur('Impossible de charger la vue d’ensemble. Réessaie dans un instant.');
        setLoading(false);
        return;
      }

      setNbFormateurs((roles ?? []).filter((r) => r.role === 'formateur').length);
      setNbArbitres((roles ?? []).filter((r) => r.role === 'arbitre').length);

      const nomsFormateurs = Object.fromEntries((profils ?? []).map((p) => [p.id, p.full_name]));

      let totalNonRepondants = 0;
      let totalActifs = 0;

      const liste: QuizVue[] = (quizzesData ?? []).map((q) => {
        const groupIds = (quizGroups ?? []).filter((qg) => qg.quiz_id === q.id).map((qg) => qg.group_id);
        const cibleIds = new Set(
          (groupMembers ?? []).filter((gm) => groupIds.includes(gm.group_id)).map((gm) => gm.user_id)
        );
        const repondusIds = new Set(
          (attempts ?? [])
            .filter((a) => a.quiz_id === q.id && a.status !== 'in_progress' && cibleIds.has(a.user_id))
            .map((a) => a.user_id)
        );

        if (q.computed_status === 'actif') {
          totalActifs++;
          totalNonRepondants += Math.max(0, cibleIds.size - repondusIds.size);
        }

        return {
          id: q.id,
          title: q.title,
          computed_status: q.computed_status,
          formateur_nom: nomsFormateurs[q.formateur_id] ?? '—',
          repondus: repondusIds.size,
          cibles: cibleIds.size,
        };
      });

      setNbActifs(totalActifs);
      setNbNonRepondants(totalNonRepondants);
      setQuizzes(liste);
      setLoading(false);
    }
    charger();
  }, []);

  if (loading) {
    return (
      <AppLayout>
        <AdminNav />
        <p className="text-sm text-muted">Chargement…</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AdminNav />
      <h1 className="text-lg font-semibold mb-4">Vue d'ensemble</h1>
      {erreur && <p className="text-sm text-card-red mb-4">{erreur}</p>}

      <div className="grid grid-cols-2 gap-2.5 mb-6">
        <div className="bg-surface border border-border rounded p-3">
          <p className="text-2xl font-semibold">{nbFormateurs}</p>
          <p className="text-xs text-muted mt-0.5">Formateurs</p>
        </div>
        <div className="bg-surface border border-border rounded p-3">
          <p className="text-2xl font-semibold">{nbArbitres}</p>
          <p className="text-xs text-muted mt-0.5">Arbitres</p>
        </div>
        <div className="bg-surface border border-border rounded p-3">
          <p className="text-2xl font-semibold">{nbActifs}</p>
          <p className="text-xs text-muted mt-0.5">QCM actifs</p>
        </div>
        <div className="bg-surface border border-border rounded p-3">
          <p className="text-2xl font-semibold">{nbNonRepondants}</p>
          <p className="text-xs text-muted mt-0.5">Non-répondants</p>
        </div>
      </div>

      <p className="text-sm font-medium mb-2">Tous les QCM de la plateforme</p>
      {quizzes.length === 0 && <p className="text-sm text-muted">Aucun QCM pour le moment.</p>}
      <ul className="flex flex-col gap-2">
        {quizzes.map((q) => {
          const statut = STATUT[q.computed_status];
          return (
            <li key={q.id} className="bg-surface border border-border rounded p-3">
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className="text-sm font-medium">{q.title}</span>
                <span className={`text-xs rounded px-2 py-0.5 shrink-0 ${statut.className}`}>
                  {statut.label}
                </span>
              </div>
              <p className="text-xs text-muted">
                {q.formateur_nom} · {q.repondus}/{q.cibles} répondus
              </p>
            </li>
          );
        })}
      </ul>
    </AppLayout>
  );
}
