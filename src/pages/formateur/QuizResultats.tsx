import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppLayout from '../../components/AppLayout';
import { supabase } from '../../lib/supabaseClient';
import { logActivity } from '../../lib/activityLog';

interface LigneResultat {
  id: string;
  full_name: string;
  email: string;
  statut: 'non_repondu' | 'en_cours' | 'soumis';
  score: number | null;
}

export default function QuizResultats() {
  const { id: quizId } = useParams();
  const navigate = useNavigate();

  const [titre, setTitre] = useState('');
  const [nombreQuestions, setNombreQuestions] = useState(0);
  const [lignes, setLignes] = useState<LigneResultat[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmationSuppression, setConfirmationSuppression] = useState(false);
  const [suppression, setSuppression] = useState(false);

  async function charger() {
    if (!quizId) return;
    setLoading(true);
    setErreur(null);

    const { data: quiz, error: errQuiz } = await supabase
      .from('quizzes')
      .select('title')
      .eq('id', quizId)
      .single();
    if (errQuiz || !quiz) {
      setErreur('Impossible de charger ce QCM.');
      setLoading(false);
      return;
    }
    setTitre(quiz.title);

    const { count } = await supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('quiz_id', quizId);
    setNombreQuestions(count ?? 0);

    const { data: quizGroups } = await supabase.from('quiz_groups').select('group_id').eq('quiz_id', quizId);
    const groupIds = (quizGroups ?? []).map((g) => g.group_id);

    let arbitreIds: string[] = [];
    if (groupIds.length > 0) {
      const { data: membres } = await supabase
        .from('group_members')
        .select('user_id')
        .in('group_id', groupIds);
      arbitreIds = Array.from(new Set((membres ?? []).map((m) => m.user_id)));
    }

    let profils: { id: string; full_name: string; email: string }[] = [];
    if (arbitreIds.length > 0) {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', arbitreIds)
        .order('full_name');
      profils = data ?? [];
    }

    const { data: tentatives } = await supabase
      .from('quiz_attempts')
      .select('user_id, status, score')
      .eq('quiz_id', quizId);

    const resultat: LigneResultat[] = profils.map((p) => {
      const tentative = tentatives?.find((t) => t.user_id === p.id);
      let statut: LigneResultat['statut'] = 'non_repondu';
      if (tentative) {
        statut = tentative.status === 'in_progress' ? 'en_cours' : 'soumis';
      }
      return { id: p.id, full_name: p.full_name, email: p.email, statut, score: tentative?.score ?? null };
    });

    setLignes(resultat);
    setLoading(false);
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const repondus = lignes.filter((l) => l.statut === 'soumis');
  const scoreMoyen =
    repondus.length > 0
      ? (repondus.reduce((s, l) => s + (l.score ?? 0), 0) / repondus.length).toFixed(1)
      : null;

  function donneesExport() {
    return lignes.map((l) => ({
      Nom: l.full_name,
      'E-mail': l.email,
      Statut: l.statut === 'soumis' ? 'Répondu' : l.statut === 'en_cours' ? 'En cours' : 'Non répondu',
      Score: l.score !== null ? `${l.score} / ${nombreQuestions}` : '',
    }));
  }

  function exporterCsv() {
    const donnees = donneesExport();
    const entetes = Object.keys(donnees[0] ?? { Nom: '', 'E-mail': '', Statut: '', Score: '' });
    const lignesCsv = [
      entetes.join(';'),
      ...donnees.map((d) => entetes.map((e) => `"${String(d[e as keyof typeof d]).replace(/"/g, '""')}"`).join(';')),
    ];
    const blob = new Blob([lignesCsv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    telecharger(blob, `${titre}.csv`);
  }

  async function exporterExcel() {
    const XLSX = await import('xlsx');
    const feuille = XLSX.utils.json_to_sheet(donneesExport());
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Résultats');
    XLSX.writeFile(classeur, `${titre}.xlsx`);
  }

  function telecharger(blob: Blob, nomFichier: string) {
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nomFichier;
    lien.click();
    URL.revokeObjectURL(url);
  }

  async function supprimerDefinitivement() {
    if (!quizId) return;
    setSuppression(true);
    const { error } = await supabase.from('quizzes').delete().eq('id', quizId);
    setSuppression(false);
    if (!error) {
      await logActivity(`a supprimé le QCM « ${titre} »`, 'quiz', quizId);
      navigate('/formateur');
    } else {
      setErreur('La suppression a échoué. Réessaie dans un instant.');
    }
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
      <Link to={`/formateur/qcm/${quizId}`} className="text-sm text-muted underline mb-3 inline-block">
        ← Paramètres du QCM
      </Link>
      <h1 className="text-lg font-semibold mb-1">{titre}</h1>
      <p className="text-sm text-muted mb-4">
        {repondus.length}/{lignes.length} répondus
        {scoreMoyen !== null && ` · Score moyen ${scoreMoyen}/${nombreQuestions}`}
      </p>

      {erreur && <p className="text-sm text-card-red mb-4">{erreur}</p>}

      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={exporterExcel}
          disabled={lignes.length === 0}
          className="flex-1 text-sm border border-border rounded py-1.5 disabled:opacity-50"
        >
          Export Excel
        </button>
        <button
          type="button"
          onClick={exporterCsv}
          disabled={lignes.length === 0}
          className="flex-1 text-sm border border-border rounded py-1.5 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      {lignes.length === 0 && (
        <p className="text-sm text-muted mb-6">
          Aucun arbitre ciblé pour l'instant (ce QCM n'a pas encore de groupe destinataire).
        </p>
      )}

      <ul className="mb-6">
        {lignes.map((l) => (
          <li key={l.id} className="flex items-center justify-between py-2.5 border-b border-border">
            <span className={`text-sm ${l.statut === 'non_repondu' ? 'text-muted' : ''}`}>
              {l.full_name}
            </span>
            {l.statut === 'soumis' && (
              <span className="text-sm font-medium">
                {l.score} / {nombreQuestions}
              </span>
            )}
            {l.statut === 'en_cours' && <span className="text-xs text-card-yellow">En cours</span>}
            {l.statut === 'non_repondu' && <span className="text-xs text-muted">{l.email}</span>}
          </li>
        ))}
      </ul>

      {!confirmationSuppression ? (
        <button
          type="button"
          onClick={() => setConfirmationSuppression(true)}
          className="w-full border border-border rounded py-2 text-sm text-card-red"
        >
          Supprimer ce QCM
        </button>
      ) : (
        <div className="border border-card-red rounded p-3">
          <p className="text-sm font-medium mb-3">
            Confirmer la suppression ? Cette action est définitive.
          </p>
          {lignes.some((l) => l.statut !== 'non_repondu') && (
            <p className="text-xs text-muted mb-3">
              Des réponses ont déjà été reçues — pense à exporter les résultats ci-dessus avant de
              continuer si tu veux les garder.
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmationSuppression(false)}
              className="flex-1 border border-border rounded py-2 text-sm"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={supprimerDefinitivement}
              disabled={suppression}
              className="flex-1 bg-card-red text-white rounded py-2 text-sm disabled:opacity-60"
            >
              {suppression ? 'Suppression…' : 'Supprimer définitivement'}
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
