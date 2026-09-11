import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppLayout from '../../components/AppLayout';
import { supabase } from '../../lib/supabaseClient';

interface LigneDetail {
  question_id: string;
  question_type: 'video' | 'image' | 'text';
  media_url: string | null;
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
  type: 'video' | 'image' | 'text';
  media_url: string | null;
  text: string;
  explanation: string | null;
  score: number;
}

function formatPourcentage(n: number) {
  return Number.isInteger(n) ? `${n} %` : `${n.toFixed(1)} %`;
}
function formatDate(d: string) {
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function QuizAttemptResult() {
  const { id: quizId, attemptId } = useParams();
  const [titre, setTitre] = useState('');
  const [showScore, setShowScore] = useState(false);
  const [periodeFin, setPeriodeFin] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [questions, setQuestions] = useState<QuestionGroupee[]>([]);
  const [correctionIndisponible, setCorrectionIndisponible] = useState<string | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [chargementMedia, setChargementMedia] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function charger() {
      if (!quizId || !attemptId) return;
      setLoading(true);

      const { data: quiz } = await supabase
        .from('quizzes')
        .select('title, show_score, period_end')
        .eq('id', quizId)
        .single();
      setTitre(quiz?.title ?? '');
      setShowScore(quiz?.show_score ?? false);
      setPeriodeFin(quiz?.period_end ?? null);

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
          setCorrectionIndisponible(error.message);
        } else {
          const parQuestion = new Map<string, LigneDetail[]>();
          for (const ligne of (detail ?? []) as LigneDetail[]) {
            if (!parQuestion.has(ligne.question_id)) parQuestion.set(ligne.question_id, []);
            parQuestion.get(ligne.question_id)!.push(ligne);
          }
          const groupees: QuestionGroupee[] = Array.from(parQuestion.entries()).map(([id, lignes]) => ({
            id,
            type: lignes[0].question_type,
            media_url: lignes[0].media_url,
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

  async function afficherMedia(question: QuestionGroupee) {
    if (!question.media_url || mediaUrls[question.id]) return;
    setChargementMedia(question.id);
    const { data } = await supabase.functions.invoke('r2-upload-url', {
      body: { action: 'read', key: question.media_url },
    });
    if (data?.readUrl) {
      setMediaUrls((prev) => ({ ...prev, [question.id]: data.readUrl }));
    }
    setChargementMedia(null);
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

          <p className="text-sm text-muted mb-2">Correction détaillée</p>

          {correctionIndisponible ? (
            <p className="text-sm text-muted bg-surface border border-border rounded px-3 py-3">
              {correctionIndisponible}
              {periodeFin && correctionIndisponible.includes('après la fin') && (
                <> ({formatDate(periodeFin)})</>
              )}
            </p>
          ) : (
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

                    {q.type !== 'text' && q.media_url && (
                      <div className="mb-2">
                        {mediaUrls[q.id] ? (
                          q.type === 'video' ? (
                            <video src={mediaUrls[q.id]} controls className="w-full rounded max-h-48" />
                          ) : (
                            <img src={mediaUrls[q.id]} alt="" className="w-full rounded max-h-48 object-contain" />
                          )
                        ) : (
                          <button
                            type="button"
                            onClick={() => afficherMedia(q)}
                            disabled={chargementMedia === q.id}
                            className="text-xs border border-border rounded px-3 py-1.5"
                          >
                            {chargementMedia === q.id
                              ? 'Chargement…'
                              : q.type === 'video'
                                ? 'Revoir la vidéo'
                                : "Revoir l'image"}
                          </button>
                        )}
                      </div>
                    )}

                    {!pleinementCorrecte && q.explanation && (
                      <p className="text-xs text-muted">Explication : {q.explanation}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
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
