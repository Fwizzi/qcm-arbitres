import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom';
import AppLayout from '../../components/AppLayout';
import { supabase } from '../../lib/supabaseClient';
import { logActivity } from '../../lib/activityLog';
import { useAuth } from '../../hooks/useAuth';

interface GroupRow {
  id: string;
  name: string;
}

function traduireErreur(message?: string): string {
  if (message?.includes('quizzes_period_valid')) {
    return 'La date de fin doit être après (ou égale à) la date de début.';
  }
  return "L'enregistrement a échoué. Vérifie les champs et réessaie.";
}

export default function QuizForm() {
  const { id } = useParams();
  const estNouveau = !id || id === 'nouveau';
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();

  const [confirmation, setConfirmation] = useState(false);

  const [titre, setTitre] = useState('');
  const [dureeMinutes, setDureeMinutes] = useState(20);
  const [afficherScore, setAfficherScore] = useState(true);
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [groupes, setGroupes] = useState<GroupRow[]>([]);
  const [groupesSelectionnes, setGroupesSelectionnes] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(!estNouveau);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);

  useEffect(() => {
    if ((location.state as { justSaved?: boolean } | null)?.justSaved) {
      setConfirmation(true);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  useEffect(() => {
    if (!confirmation) return;
    const t = setTimeout(() => setConfirmation(false), 4000);
    return () => clearTimeout(t);
  }, [confirmation]);

  useEffect(() => {
    async function charger() {
      const { data: groupesData } = await supabase.from('groups').select('id, name').order('name');
      setGroupes(groupesData ?? []);

      if (!estNouveau && id) {
        const { data: quiz, error } = await supabase
          .from('quizzes')
          .select('title, time_limit_minutes, show_score, period_start, period_end')
          .eq('id', id)
          .single();

        if (error || !quiz) {
          setErreur('Impossible de charger ce QCM.');
          setLoading(false);
          return;
        }

        setTitre(quiz.title);
        setDureeMinutes(quiz.time_limit_minutes);
        setAfficherScore(quiz.show_score);
        setDateDebut(quiz.period_start);
        setDateFin(quiz.period_end);

        const { data: qg } = await supabase.from('quiz_groups').select('group_id').eq('quiz_id', id);
        setGroupesSelectionnes(new Set((qg ?? []).map((r) => r.group_id)));
      }
      setLoading(false);
    }
    charger();
  }, [id, estNouveau]);

  function basculerGroupe(groupId: string) {
    setGroupesSelectionnes((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  async function enregistrer(nouveauStatut: 'draft' | 'published') {
    if (!session) return;
    setErreur(null);
    setEnregistrement(true);

    const payload: Record<string, unknown> = {
      formateur_id: session.user.id,
      title: titre,
      time_limit_minutes: dureeMinutes,
      show_score: afficherScore,
      period_start: dateDebut,
      period_end: dateFin,
      status: nouveauStatut,
    };
    if (nouveauStatut === 'published') {
      payload.published_at = new Date().toISOString();
    }

    let quizId = id;

    if (estNouveau) {
      const { data, error } = await supabase.from('quizzes').insert(payload).select('id').single();
      if (error || !data) {
        setErreur(traduireErreur(error?.message));
        setEnregistrement(false);
        return;
      }
      quizId = data.id;
      await logActivity(`a créé le QCM « ${titre} »`, 'quiz', quizId);
    } else {
      const { error } = await supabase.from('quizzes').update(payload).eq('id', id);
      if (error) {
        setErreur(traduireErreur(error.message));
        setEnregistrement(false);
        return;
      }
      await logActivity(`a modifié le QCM « ${titre} »`, 'quiz', id);
    }

    // Resynchronise les groupes cibles : on efface puis on réinsère,
    // plus simple et plus sûr qu'un diff précis pour un petit nombre de lignes.
    await supabase.from('quiz_groups').delete().eq('quiz_id', quizId as string);
    if (groupesSelectionnes.size > 0) {
      await supabase
        .from('quiz_groups')
        .insert(Array.from(groupesSelectionnes).map((groupId) => ({ quiz_id: quizId, group_id: groupId })));
    }

    setEnregistrement(false);
    navigate(`/formateur/qcm/${quizId}`, { replace: true, state: { justSaved: true } });
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
      <Link to="/formateur" className="text-sm text-muted underline mb-3 inline-block">
        ← Mes QCM
      </Link>
      <h1 className="text-lg font-semibold mb-4">Paramètres du QCM</h1>

      {confirmation && (
        <p className="text-sm text-pitch-dark bg-pitch-light rounded px-3 py-2 mb-4">
          QCM enregistré avec succès.
        </p>
      )}

      <label className="block text-sm text-muted mb-1">Titre</label>
      <input
        type="text"
        value={titre}
        onChange={(e) => setTitre(e.target.value)}
        className="w-full border border-border rounded px-3 py-2 mb-4"
      />

      <label className="block text-sm text-muted mb-1">Limite de temps (minutes)</label>
      <input
        type="number"
        min={1}
        value={dureeMinutes}
        onChange={(e) => setDureeMinutes(Number(e.target.value))}
        className="w-28 border border-border rounded px-3 py-2 mb-4"
      />

      <label className="flex items-center gap-2 text-sm mb-4 py-2 border-y border-border">
        <input type="checkbox" checked={afficherScore} onChange={(e) => setAfficherScore(e.target.checked)} />
        Afficher le score à l'arbitre
      </label>

      <label className="block text-sm text-muted mb-1">Période d'accessibilité</label>
      <div className="flex gap-2 mb-4">
        <div className="flex-1">
          <span className="text-xs text-muted">Du</span>
          <input
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>
        <div className="flex-1">
          <span className="text-xs text-muted">Au</span>
          <input
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>
      </div>

      <label className="block text-sm text-muted mb-2">Groupes destinataires</label>
      {groupes.length === 0 && (
        <p className="text-xs text-muted mb-4">
          Aucun groupe créé pour l'instant (prochaine étape à construire).
        </p>
      )}
      <div className="flex flex-col gap-1 mb-4">
        {groupes.map((g) => (
          <label key={g.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={groupesSelectionnes.has(g.id)}
              onChange={() => basculerGroupe(g.id)}
            />
            {g.name}
          </label>
        ))}
      </div>

      {!estNouveau && (
        <>
          <Link
            to={`/formateur/qcm/${id}/questions`}
            className="block w-full text-center border border-border rounded py-2 mb-2 text-sm"
          >
            Gérer les questions
          </Link>
          <Link
            to={`/formateur/qcm/${id}/resultats`}
            className="block w-full text-center border border-border rounded py-2 mb-3 text-sm"
          >
            Voir les résultats
          </Link>
        </>
      )}

      {erreur && (
        <p role="alert" className="text-sm text-card-red bg-card-red-bg rounded px-3 py-2 mb-3">
          {erreur}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={enregistrement || !titre || !dateDebut || !dateFin}
          onClick={() => enregistrer('draft')}
          className="flex-1 border border-border rounded py-2 text-sm disabled:opacity-60"
        >
          Enregistrer le brouillon
        </button>
        <button
          type="button"
          disabled={enregistrement || !titre || !dateDebut || !dateFin}
          onClick={() => enregistrer('published')}
          className="flex-1 bg-pitch text-white font-medium rounded py-2 text-sm disabled:opacity-60"
        >
          Publier
        </button>
      </div>
    </AppLayout>
  );
}
