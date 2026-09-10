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

// Convertit un instant ISO (venant de la base) vers le format attendu par
// <input type="datetime-local">, en heure locale du navigateur.
function versDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function QuizForm() {
  const { id } = useParams();
  const estNouveau = !id || id === 'nouveau';
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();

  const [confirmation, setConfirmation] = useState(false);

  const [titre, setTitre] = useState('');
  const [statut, setStatut] = useState<'draft' | 'published' | null>(null);
  const [dureeMinutes, setDureeMinutes] = useState(20);
  const [afficherScore, setAfficherScore] = useState(true);
  const [afficherNombreAttendu, setAfficherNombreAttendu] = useState(true);
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [groupes, setGroupes] = useState<GroupRow[]>([]);
  const [groupesSelectionnes, setGroupesSelectionnes] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(!estNouveau);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [confirmationSuppression, setConfirmationSuppression] = useState(false);
  const [suppression, setSuppression] = useState(false);

  const estPublie = statut === 'published';

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
          .select('title, status, time_limit_minutes, show_score, show_expected_count, period_start, period_end')
          .eq('id', id)
          .single();

        if (error || !quiz) {
          setErreur('Impossible de charger ce QCM.');
          setLoading(false);
          return;
        }

        setTitre(quiz.title);
        setStatut(quiz.status);
        setDureeMinutes(quiz.time_limit_minutes);
        setAfficherScore(quiz.show_score);
        setAfficherNombreAttendu(quiz.show_expected_count);
        setDateDebut(versDatetimeLocal(quiz.period_start));
        setDateFin(versDatetimeLocal(quiz.period_end));

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
      show_expected_count: afficherNombreAttendu,
      period_start: new Date(dateDebut).toISOString(),
      period_end: new Date(dateFin).toISOString(),
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

  async function supprimerBrouillon() {
    if (!id) return;
    setSuppression(true);
    const { error } = await supabase.from('quizzes').delete().eq('id', id);
    setSuppression(false);
    if (!error) {
      await logActivity(`a supprimé le brouillon « ${titre} »`, 'quiz', id);
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
      <Link to="/formateur" className="text-sm text-muted underline mb-3 inline-block">
        ← Mes QCM
      </Link>
      <h1 className="text-lg font-semibold mb-4">Paramètres du QCM</h1>

      {confirmation && (
        <p className="text-sm text-pitch-dark bg-pitch-light rounded px-3 py-2 mb-4">
          QCM enregistré avec succès.
        </p>
      )}

      {estPublie && (
        <p className="text-sm text-card-yellow bg-card-yellow-bg rounded px-3 py-2 mb-4">
          Ce QCM est publié : ses paramètres et ses questions ne peuvent plus être modifiés.
        </p>
      )}

      <label className="block text-sm text-muted mb-1">Titre</label>
      <input
        type="text"
        value={titre}
        disabled={estPublie}
        onChange={(e) => setTitre(e.target.value)}
        className="w-full border border-border rounded px-3 py-2 mb-4 disabled:bg-canvas disabled:text-muted"
      />

      <label className="block text-sm text-muted mb-1">Limite de temps (minutes)</label>
      <input
        type="number"
        min={1}
        value={dureeMinutes}
        disabled={estPublie}
        onChange={(e) => setDureeMinutes(Number(e.target.value))}
        className="w-28 border border-border rounded px-3 py-2 mb-4 disabled:bg-canvas disabled:text-muted"
      />

      <label className="flex items-center gap-2 text-sm mb-4 py-2 border-t border-border">
        <input type="checkbox" checked={afficherScore} disabled={estPublie} onChange={(e) => setAfficherScore(e.target.checked)} />
        Afficher le score à l'arbitre
      </label>

      <label className="flex items-center gap-2 text-sm mb-4 py-2 border-y border-border">
        <input
          type="checkbox"
          checked={afficherNombreAttendu}
          disabled={estPublie}
          onChange={(e) => setAfficherNombreAttendu(e.target.checked)}
        />
        Afficher à l'arbitre le nombre de réponses attendues (limite alors sa sélection à ce nombre)
      </label>

      <label className="block text-sm text-muted mb-1">Période d'accessibilité (date et heure)</label>
      <div className="flex flex-col gap-3 mb-4">
        <div>
          <span className="text-xs text-muted">Du</span>
          <input
            type="datetime-local"
            value={dateDebut}
            disabled={estPublie}
            onChange={(e) => setDateDebut(e.target.value)}
            className="w-full border border-border rounded px-3 py-2 disabled:bg-canvas disabled:text-muted"
          />
        </div>
        <div>
          <span className="text-xs text-muted">Au</span>
          <input
            type="datetime-local"
            value={dateFin}
            disabled={estPublie}
            onChange={(e) => setDateFin(e.target.value)}
            className="w-full border border-border rounded px-3 py-2 disabled:bg-canvas disabled:text-muted"
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
              disabled={estPublie}
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

      {!estPublie && (
        <div className="flex gap-2 mb-3">
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
      )}

      {!estNouveau && !estPublie && (
        <>
          {!confirmationSuppression ? (
            <button
              type="button"
              onClick={() => setConfirmationSuppression(true)}
              className="w-full border border-border rounded py-2 text-sm text-card-red"
            >
              Supprimer ce brouillon
            </button>
          ) : (
            <div className="border border-card-red rounded p-3">
              <p className="text-sm font-medium mb-3">Confirmer la suppression du brouillon ?</p>
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
                  onClick={supprimerBrouillon}
                  disabled={suppression}
                  className="flex-1 bg-card-red text-white rounded py-2 text-sm disabled:opacity-60"
                >
                  {suppression ? 'Suppression…' : 'Supprimer'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}
