import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppLayout from '../../components/AppLayout';
import { supabase } from '../../lib/supabaseClient';

interface LigneDetail {
  question_id: string;
  question_text: string;
  explanation: string | null;
  question_score: number;
  option_id: string;
  option_text: string;
  is_correct: boolean;
  was_selected: boolean;
}
interface QuestionGroupee {
  id: string;
  text: string;
  explanation: string | null;
  score: number;
}

function formatPourcentage(n: number) {
  return Number.isInteger(n) ? `${n} %` : `${n.toFixed(1)} %`;
}

export default function QuizAttemptResult() {
  const { id: quizId, attemptId } = useParams();
  const [titre, setTitre] = useState('');
  const [showScore, setShowScore] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [questions, setQuestions] = useState<QuestionGroupee[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    async function charger() {
      if (!quizId || !attemptId) return;
      setLoading(true);
      setErreur(null);

      const { data: quiz } = await supabase
        .from('quizzes')
        .select('title, show_score')
        .eq('id', quizId)
        .single();
      setTitre(quiz?.title ?? '');
      setShowScore(quiz?.show_score ?? false);

      const { data: attempt } = await supabase
        .from('quiz_attempts')
        .select('score')
        .eq('id', attemptId)
        .single();
      setScore(attempt?.score ?? null);

      if (quiz?.show_score) {
        const { data: detail, error } = await supabase.rpc('get_exam_results', {
          p_attempt_id: attemptId,
        });
        if (error) {
          setErreur('Impossible de charger le détail des réponses.');
        } else {
          const parQuestion = new Map<string, LigneDetail[]>();
          for (const ligne of (detail ?? []) as LigneDetail[]) {
            if (!parQuestion.has(ligne.question_id)) parQuestion.set(ligne.question_id, []);
            parQuestion.get(ligne.question_id)!.push(ligne);
          }
          const groupees: QuestionGroupee[] = Array.from(parQuestion.entries()).map(([id, lignes]) => ({
            id,
            text: lignes[0].question_text,
            explanation: lignes[0].explanation,
            score: lignes[0].question_score,
          }));
          setQuestions(groupees);
        }
      }
      setLoading(false);
    }
    charger();
  }, [quizId, attemptId]);

  if (loading) {
    return (
      <AppLayout>
        <p className="text-sm text-muted">Chargement…</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="text-center mb-5">
        <p className="text-lg font-semibold mb-1">QCM terminé</p>
        <p className="text-sm text-muted">{titre}</p>
      </div>

      {showScore ? (
        <>
          <div className="bg-surface border border-border rounded p-5 text-center mb-6">
            <p className="text-sm text-muted mb-1">Ton score</p>
            <p className="text-3xl font-semibold">{score !== null ? formatPourcentage(score) : '—'}</p>
          </div>

          {erreur && <p className="text-sm text-card-red mb-4">{erreur}</p>}

          <p className="text-sm text-muted mb-2">Détail des réponses</p>
          <ul className="flex flex-col gap-2">
            {questions.map((q) => {
              const pleinementCorrecte = q.score >= 100;
              return (
                <li
                  key={q.id}
                  className={`border rounded p-3 ${pleinementCorrecte ? 'border-pitch' : 'border-card-red'}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm">
                      <span className={pleinementCorrecte ? 'text-pitch-dark' : 'text-card-red'}>
                        {pleinementCorrecte ? '✓' : '✕'}
                      </span>{' '}
                      {q.text}
                    </p>
                    <span className="text-xs font-medium shrink-0">{formatPourcentage(q.score)}</span>
                  </div>
                  {!pleinementCorrecte && q.explanation && (
                    <p className="text-xs text-muted pl-4">Explication : {q.explanation}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className="bg-surface border border-border rounded p-5 text-center">
          <p className="text-sm">Ta réponse a bien été enregistrée et soumise.</p>
        </div>
      )}

      <Link
        to="/arbitre"
        className="block w-full text-center border border-border rounded py-2 text-sm mt-6"
      >
        Retour à mes QCM
      </Link>
    </AppLayout>
  );
}
