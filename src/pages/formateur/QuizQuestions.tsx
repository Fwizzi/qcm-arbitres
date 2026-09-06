import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppLayout from '../../components/AppLayout';
import { supabase } from '../../lib/supabaseClient';
import { extraireErreurFonction } from '../../lib/functionsError';

type QuestionType = 'video' | 'image' | 'text';

interface AnswerOption {
  id: string;
  text: string;
  is_correct: boolean;
}

interface QuestionRow {
  id: string;
  type: QuestionType;
  text: string;
  media_url: string | null;
  explanation: string | null;
  answer_options: AnswerOption[];
}

const TYPE_LABELS: Record<QuestionType, string> = {
  video: 'Vidéo',
  image: 'Image',
  text: 'Texte',
};

function nouvelleOption(): AnswerOption {
  return { id: crypto.randomUUID(), text: '', is_correct: false };
}

export default function QuizQuestions() {
  const { id: quizId } = useParams();

  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreurListe, setErreurListe] = useState<string | null>(null);

  const [questionEnEditionId, setQuestionEnEditionId] = useState<string | null>(null);
  const [type, setType] = useState<QuestionType>('text');
  const [texte, setTexte] = useState('');
  const [explication, setExplication] = useState('');
  const [options, setOptions] = useState<AnswerOption[]>([nouvelleOption(), nouvelleOption()]);
  const [fichier, setFichier] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [mediaKeyExistant, setMediaKeyExistant] = useState<string | null>(null);
  const [chargementApercu, setChargementApercu] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreurForm, setErreurForm] = useState<string | null>(null);

  async function charger() {
    if (!quizId) return;
    setLoading(true);
    setErreurListe(null);

    const { data, error } = await supabase
      .from('questions')
      .select('id, type, text, media_url, explanation, answer_options(id, text, is_correct)')
      .eq('quiz_id', quizId)
      .order('order_index');

    if (error) {
      setErreurListe('Impossible de charger les questions. Réessaie dans un instant.');
    } else {
      setQuestions((data ?? []) as unknown as QuestionRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  function choisirFichier(f: File | null) {
    setFichier(f);
    setApercu(f ? URL.createObjectURL(f) : null);
  }

  function modifierOption(id: string, champs: Partial<AnswerOption>) {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, ...champs } : o)));
  }

  function ajouterOption() {
    setOptions((prev) => [...prev, nouvelleOption()]);
  }

  function retirerOption(id: string) {
    setOptions((prev) => (prev.length > 2 ? prev.filter((o) => o.id !== id) : prev));
  }

  function reinitialiserFormulaire() {
    setQuestionEnEditionId(null);
    setType('text');
    setTexte('');
    setExplication('');
    setOptions([nouvelleOption(), nouvelleOption()]);
    setMediaKeyExistant(null);
    choisirFichier(null);
  }

  async function commencerEdition(q: QuestionRow) {
    setErreurForm(null);
    setQuestionEnEditionId(q.id);
    setType(q.type);
    setTexte(q.text);
    setExplication(q.explanation ?? '');
    setOptions(
      q.answer_options.length > 0
        ? q.answer_options.map((o) => ({ id: o.id, text: o.text, is_correct: o.is_correct }))
        : [nouvelleOption(), nouvelleOption()]
    );
    setFichier(null);
    setApercu(null);
    setMediaKeyExistant(q.media_url);

    if (q.media_url) {
      setChargementApercu(true);
      const { data, error } = await supabase.functions.invoke('r2-upload-url', {
        body: { action: 'read', key: q.media_url },
      });
      if (error || !data?.readUrl) {
        setErreurForm(await extraireErreurFonction(error, data));
      } else {
        setApercu(data.readUrl);
      }
      setChargementApercu(false);
    }

    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  async function televerserMedia(): Promise<string> {
    if (!fichier) throw new Error('Aucun fichier sélectionné.');
    const extension = fichier.name.split('.').pop() ?? 'bin';

    const { data, error } = await supabase.functions.invoke('r2-upload-url', {
      body: { action: 'upload', fileType: fichier.type, fileExtension: extension, fileSize: fichier.size },
    });
    if (error || !data?.uploadUrl) {
      throw new Error(await extraireErreurFonction(error, data));
    }

    const reponse = await fetch(data.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': fichier.type },
      body: fichier,
    });
    if (!reponse.ok) {
      throw new Error("L'envoi du fichier vers le stockage a échoué.");
    }

    return data.key as string;
  }

  async function enregistrerQuestion(e: FormEvent) {
    e.preventDefault();
    setErreurForm(null);

    if (!quizId) return;
    if (type !== 'text' && !fichier && !mediaKeyExistant) {
      setErreurForm('Ajoute un fichier avant d’enregistrer.');
      return;
    }
    const optionsRemplies = options.filter((o) => o.text.trim() !== '');
    if (optionsRemplies.length < 2) {
      setErreurForm('Ajoute au moins deux propositions de réponse.');
      return;
    }
    if (!optionsRemplies.some((o) => o.is_correct)) {
      setErreurForm('Coche au moins une bonne réponse.');
      return;
    }

    setEnregistrement(true);
    try {
      // Un nouveau fichier remplace l'ancien ; sinon, on garde le média existant
      // (utile en modification si on ne veut changer que le texte ou les réponses).
      let mediaKey: string | null = type === 'text' ? null : mediaKeyExistant;
      if (fichier) {
        mediaKey = await televerserMedia();
      }

      let questionId = questionEnEditionId;

      if (questionEnEditionId) {
        const { error: errUpdate } = await supabase
          .from('questions')
          .update({ type, media_url: mediaKey, text: texte, explanation: explication || null })
          .eq('id', questionEnEditionId);
        if (errUpdate) throw new Error("La modification de la question a échoué.");

        // Les réponses sont peu nombreuses : on efface puis on réinsère,
        // plus simple et plus sûr qu'un diff précis.
        await supabase.from('answer_options').delete().eq('question_id', questionEnEditionId);
      } else {
        const { data: question, error: errQuestion } = await supabase
          .from('questions')
          .insert({
            quiz_id: quizId,
            type,
            media_url: mediaKey,
            text: texte,
            explanation: explication || null,
            order_index: questions.length,
          })
          .select('id')
          .single();

        if (errQuestion || !question) throw new Error("L'enregistrement de la question a échoué.");
        questionId = question.id;
      }

      const { error: errOptions } = await supabase.from('answer_options').insert(
        optionsRemplies.map((o) => ({
          question_id: questionId,
          text: o.text,
          is_correct: o.is_correct,
        }))
      );
      if (errOptions) throw new Error("L'enregistrement des réponses a échoué.");

      reinitialiserFormulaire();
      await charger();
    } catch (err) {
      setErreurForm(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setEnregistrement(false);
    }
  }

  async function supprimerQuestion(questionId: string) {
    await supabase.from('questions').delete().eq('id', questionId);
    if (questionEnEditionId === questionId) reinitialiserFormulaire();
    await charger();
  }

  return (
    <AppLayout>
      <Link to={`/formateur/qcm/${quizId}`} className="text-sm text-muted underline mb-3 inline-block">
        ← Paramètres du QCM
      </Link>
      <h1 className="text-lg font-semibold mb-4">Questions</h1>

      {loading && <p className="text-sm text-muted">Chargement…</p>}
      {erreurListe && <p className="text-sm text-card-red mb-4">{erreurListe}</p>}

      {!loading && questions.length > 0 && (
        <ul className="flex flex-col gap-2 mb-6">
          {questions.map((q, i) => (
            <li
              key={q.id}
              className={
                'bg-surface border rounded p-3 ' +
                (questionEnEditionId === q.id ? 'border-pitch' : 'border-border')
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted mb-1">
                    Question {i + 1} · {TYPE_LABELS[q.type]}
                  </p>
                  <p className="text-sm font-medium">{q.text}</p>
                  <p className="text-xs text-muted mt-1">
                    {q.answer_options.filter((o) => o.is_correct).length} bonne(s) réponse(s) sur{' '}
                    {q.answer_options.length}
                  </p>
                </div>
                <div className="flex gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => commencerEdition(q)}
                    className="text-xs text-pitch font-medium"
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => supprimerQuestion(q.id)}
                    className="text-xs text-card-red"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={enregistrerQuestion} className="bg-surface border border-border rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">
            {questionEnEditionId ? 'Modifier la question' : 'Nouvelle question'}
          </p>
          {questionEnEditionId && (
            <button type="button" onClick={reinitialiserFormulaire} className="text-xs text-muted underline">
              Annuler
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-4">
          {(['video', 'image', 'text'] as QuestionType[]).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => {
                setType(t);
                choisirFichier(null);
                setMediaKeyExistant(null);
              }}
              className={
                'flex-1 text-sm rounded py-1.5 border ' +
                (type === t ? 'bg-pitch text-white border-pitch' : 'border-border text-muted')
              }
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        {type !== 'text' && (
          <div className="mb-4">
            <label className="block text-sm text-muted mb-1">
              {type === 'video' ? 'Vidéo' : 'Image'}
              {mediaKeyExistant && !fichier && ' (fichier actuel conservé si tu n’en choisis pas un nouveau)'}
            </label>
            <input
              type="file"
              accept={type === 'video' ? 'video/*' : 'image/*'}
              onChange={(e) => choisirFichier(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
            {chargementApercu && <p className="text-xs text-muted mt-2">Chargement de l’aperçu…</p>}
            {apercu && type === 'image' && (
              <img src={apercu} alt="Aperçu" className="mt-2 rounded max-h-40" />
            )}
            {apercu && type === 'video' && (
              <video src={apercu} controls className="mt-2 rounded max-h-40 w-full" />
            )}
          </div>
        )}

        <label className="block text-sm text-muted mb-1">Question</label>
        <textarea
          required
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          className="w-full border border-border rounded px-3 py-2 mb-4 min-h-[3rem]"
        />

        <label className="block text-sm text-muted mb-2">
          Réponses — coche la ou les bonnes
        </label>
        <div className="flex flex-col gap-2 mb-2">
          {options.map((o) => (
            <div key={o.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={o.is_correct}
                onChange={(e) => modifierOption(o.id, { is_correct: e.target.checked })}
              />
              <input
                type="text"
                value={o.text}
                onChange={(e) => modifierOption(o.id, { text: e.target.value })}
                className="flex-1 border border-border rounded px-3 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => retirerOption(o.id)}
                className="text-xs text-muted"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={ajouterOption} className="text-sm text-muted mb-4">
          + Ajouter une réponse
        </button>

        <p className="text-xs text-muted mb-1">
          L'arbitre pourra cocher autant de cases que de bonnes réponses cochées ci-dessus.
        </p>

        <label className="block text-sm text-muted mb-1 mt-3">Explication (optionnelle)</label>
        <textarea
          value={explication}
          onChange={(e) => setExplication(e.target.value)}
          className="w-full border border-border rounded px-3 py-2 mb-4 min-h-[2.5rem]"
        />

        {erreurForm && (
          <p role="alert" className="text-sm text-card-red bg-card-red-bg rounded px-3 py-2 mb-3">
            {erreurForm}
          </p>
        )}

        <button
          type="submit"
          disabled={enregistrement}
          className="w-full bg-pitch text-white font-medium rounded py-2 disabled:opacity-60"
        >
          {enregistrement
            ? 'Enregistrement…'
            : questionEnEditionId
              ? 'Enregistrer les modifications'
              : 'Enregistrer la question'}
        </button>
      </form>
    </AppLayout>
  );
}
