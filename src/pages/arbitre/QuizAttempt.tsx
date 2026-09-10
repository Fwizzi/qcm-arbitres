import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppLayout from '../../components/AppLayout';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

interface QuestionExamen {
  id: string;
  type: 'video' | 'image' | 'text';
  media_url: string | null;
  text: string;
  order_index: number;
  max_selectable: number;
  options: { id: string; text: string }[];
}

export default function QuizAttempt() {
  const { id: quizId } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();

  const [titre, setTitre] = useState('');
  const [afficherNombreAttendu, setAfficherNombreAttendu] = useState(true);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [dateLimite, setDateLimite] = useState<number | null>(null);
  const [questions, setQuestions] = useState<QuestionExamen[]>([]);
  const [indexActuel, setIndexActuel] = useState(0);
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [tempsRestant, setTempsRestant] = useState(0);
  const [soumission, setSoumission] = useState(false);

  const soumettre = useCallback(
    async (id: string) => {
      setSoumission(true);
      await supabase.rpc('submit_exam_attempt', { p_attempt_id: id });
      navigate(`/arbitre/qcm/${quizId}/resultat/${id}`, { replace: true });
    },
    [navigate, quizId]
  );

  useEffect(() => {
    async function charger() {
      if (!quizId || !session) return;
      setLoading(true);
      setErreur(null);

      const { data: quiz, error: errQuiz } = await supabase
        .from('quizzes')
        .select('title, time_limit_minutes, show_expected_count')
        .eq('id', quizId)
        .single();
      if (errQuiz || !quiz) {
        setErreur('Impossible de charger ce QCM.');
        setLoading(false);
        return;
      }
      setTitre(quiz.title);
      setAfficherNombreAttendu(quiz.show_expected_count);

      const { data: attempt, error: errAttempt } = await supabase
        .from('quiz_attempts')
        .select('id, status, started_at')
        .eq('quiz_id', quizId)
        .eq('user_id', session.user.id)
        .single();

      if (errAttempt || !attempt) {
        setErreur('Aucune tentative en cours pour ce QCM.');
        setLoading(false);
        return;
      }

      if (attempt.status !== 'in_progress') {
        navigate(`/arbitre/qcm/${quizId}/resultat/${attempt.id}`, { replace: true });
        return;
      }

      const limite = new Date(attempt.started_at).getTime() + quiz.time_limit_minutes * 60_000;
      if (Date.now() >= limite) {
        await soumettre(attempt.id);
        return;
      }
      setAttemptId(attempt.id);
      setDateLimite(limite);

      const { data: questionsData, error: errQuestions } = await supabase.rpc('get_exam_questions', {
        p_quiz_id: quizId,
      });
      if (errQuestions || !questionsData) {
        setErreur("Impossible de charger les questions. Réessaie dans un instant.");
        setLoading(false);
        return;
      }
      setQuestions(questionsData as QuestionExamen[]);

      const { data: reponsesExistantes } = await supabase
        .from('selected_answers')
        .select('question_id, option_id')
        .eq('attempt_id', attempt.id);

      const initial: Record<string, Set<string>> = {};
      for (const r of reponsesExistantes ?? []) {
        if (!initial[r.question_id]) initial[r.question_id] = new Set();
        initial[r.question_id].add(r.option_id);
      }
      setSelections(initial);
      setLoading(false);
    }
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId, session]);

  // Minuteur : mise à jour chaque seconde, soumission automatique à zéro.
  useEffect(() => {
    if (!dateLimite || !attemptId || soumission) return;
    const tick = () => {
      const restant = Math.max(0, Math.round((dateLimite - Date.now()) / 1000));
      setTempsRestant(restant);
      if (restant <= 0) {
        soumettre(attemptId);
      }
    };
    tick();
    const intervalle = setInterval(tick, 1000);
    return () => clearInterval(intervalle);
  }, [dateLimite, attemptId, soumission, soumettre]);

  const questionActuelle = questions[indexActuel];

  useEffect(() => {
    async function chargerMedia() {
      if (!questionActuelle || questionActuelle.type === 'text' || !questionActuelle.media_url) return;
      if (mediaUrls[questionActuelle.id]) return;
      const { data } = await supabase.functions.invoke('r2-upload-url', {
        body: { action: 'read', key: questionActuelle.media_url },
      });
      if (data?.readUrl) {
        setMediaUrls((prev) => ({ ...prev, [questionActuelle.id]: data.readUrl }));
      }
    }
    chargerMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionActuelle]);

  async function basculerOption(questionId: string, optionId: string, max: number) {
    if (!attemptId) return;
    const actuel = new Set(selections[questionId] ?? []);
    if (actuel.has(optionId)) {
      actuel.delete(optionId);
    } else {
      if (afficherNombreAttendu && actuel.size >= max) return; // limite atteinte, on ignore le clic
      actuel.add(optionId);
    }
    setSelections((prev) => ({ ...prev, [questionId]: actuel }));
    await enregistrerSelection(questionId, actuel);
  }

  async function enregistrerSelection(questionId: string, choix: Set<string>) {
    if (!attemptId) return;
    await supabase.from('selected_answers').delete().eq('attempt_id', attemptId).eq('question_id', questionId);
    if (choix.size > 0) {
      await supabase
        .from('selected_answers')
        .insert(Array.from(choix).map((optionId) => ({ attempt_id: attemptId, question_id: questionId, option_id: optionId })));
    }
  }

  function formatTemps(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  if (loading) {
    return (
      <AppLayout>
        <p className="text-sm text-muted">Chargement…</p>
      </AppLayout>
    );
  }

  if (erreur) {
    return (
      <AppLayout>
        <p className="text-sm text-card-red">{erreur}</p>
      </AppLayout>
    );
  }

  if (!questionActuelle) {
    return (
      <AppLayout>
        <p className="text-sm text-muted">Ce QCM ne contient aucune question pour l'instant.</p>
      </AppLayout>
    );
  }

  const choixActuels = selections[questionActuelle.id] ?? new Set<string>();
  const dernierQuestion = indexActuel === questions.length - 1;

  return (
    <AppLayout>
      <p className="text-xs text-muted mb-2">{titre}</p>
      <div className="flex items-center justify-between mb-1 text-xs text-muted">
        <span>
          Question {indexActuel + 1} / {questions.length}
        </span>
        <span>{formatTemps(tempsRestant)} restantes</span>
      </div>
      <div className="h-1 bg-canvas rounded overflow-hidden mb-4">
        <div
          className="h-full bg-pitch"
          style={{ width: `${((indexActuel + 1) / questions.length) * 100}%` }}
        />
      </div>

      {questionActuelle.type !== 'text' && (
        <div className="bg-canvas rounded aspect-video flex items-center justify-center mb-4 overflow-hidden">
          {mediaUrls[questionActuelle.id] ? (
            questionActuelle.type === 'video' ? (
              <video src={mediaUrls[questionActuelle.id]} controls className="w-full h-full" />
            ) : (
              <img src={mediaUrls[questionActuelle.id]} alt="" className="w-full h-full object-contain" />
            )
          ) : (
            <span className="text-xs text-muted">Chargement du média…</span>
          )}
        </div>
      )}

      <p className="text-base font-medium mb-1">{questionActuelle.text}</p>
      {afficherNombreAttendu && (
        <p className="text-xs text-muted mb-4">
          Choisis jusqu'à {questionActuelle.max_selectable} réponse(s)
        </p>
      )}

      <div className="flex flex-col gap-2 mb-6">
        {questionActuelle.options.map((o) => (
          <label
            key={o.id}
            className="flex items-center gap-3 border border-border rounded px-3 py-2.5 text-sm"
          >
            <input
              type="checkbox"
              checked={choixActuels.has(o.id)}
              onChange={() => basculerOption(questionActuelle.id, o.id, questionActuelle.max_selectable)}
            />
            {o.text}
          </label>
        ))}
      </div>

      <div className="flex gap-2">
        {indexActuel > 0 && (
          <button
            type="button"
            onClick={() => setIndexActuel((i) => i - 1)}
            className="flex-1 border border-border rounded py-2 text-sm"
          >
            Précédent
          </button>
        )}
        {!dernierQuestion ? (
          <button
            type="button"
            onClick={() => setIndexActuel((i) => i + 1)}
            className="flex-1 bg-pitch text-white font-medium rounded py-2 text-sm"
          >
            Question suivante
          </button>
        ) : (
          <button
            type="button"
            onClick={() => attemptId && soumettre(attemptId)}
            disabled={soumission}
            className="flex-1 bg-pitch text-white font-medium rounded py-2 text-sm disabled:opacity-60"
          >
            {soumission ? 'Envoi…' : 'Terminer le QCM'}
          </button>
        )}
      </div>
    </AppLayout>
  );
}
