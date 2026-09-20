-- =========================================================
-- Correction : bloquer aussi l'AJOUT de questions à un QCM publié
-- =========================================================
-- Le verrou précédent (empecher_modif_questions_qcm_publie) ne
-- s'appliquait qu'aux modifications et suppressions (UPDATE/DELETE),
-- pas aux AJOUTS (INSERT). Un envoi de vidéo en arrière-plan qui se
-- termine après que le formateur ait publié le QCM pouvait donc encore
-- ajouter une question — faussant la note globale de quiconque aurait
-- déjà répondu (moyenne calculée sur un nombre de questions différent
-- de celui vu par l'arbitre).

drop trigger trg_empecher_modif_questions_qcm_publie on public.questions;
drop trigger trg_empecher_modif_options_qcm_publie on public.answer_options;

create or replace function public.empecher_modif_questions_qcm_publie()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz_id uuid;
  v_status public.quiz_status;
begin
  if TG_TABLE_NAME = 'questions' then
    v_quiz_id := case when TG_OP = 'DELETE' then OLD.quiz_id else NEW.quiz_id end;
  else
    v_quiz_id := (
      select quiz_id from public.questions
      where id = (case when TG_OP = 'DELETE' then OLD.question_id else NEW.question_id end)
    );
  end if;

  select status into v_status from public.quizzes where id = v_quiz_id;

  if v_status = 'published' and not public.has_role('admin') then
    raise exception 'Les questions d''un QCM publié ne peuvent plus être modifiées.';
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

-- INSERT ajouté à la liste des événements surveillés (en plus de
-- UPDATE et DELETE déjà en place).
create trigger trg_empecher_modif_questions_qcm_publie
before insert or update or delete on public.questions
for each row execute function public.empecher_modif_questions_qcm_publie();

create trigger trg_empecher_modif_options_qcm_publie
before insert or update or delete on public.answer_options
for each row execute function public.empecher_modif_questions_qcm_publie();

-- Correction d'une faille distincte, découverte en testant celle-ci :
-- l'admin n'a jamais pu créer/modifier de questions ou de réponses sur
-- les QCM des formateurs (règle de sécurité incomplète depuis l'origine).
alter policy "Le créateur du QCM gère ses questions"
  on public.questions
  using (
    exists (select 1 from public.quizzes q where q.id = questions.quiz_id and q.formateur_id = auth.uid())
    or public.has_role('admin')
  )
  with check (
    exists (select 1 from public.quizzes q where q.id = questions.quiz_id and q.formateur_id = auth.uid())
    or public.has_role('admin')
  );

alter policy "Le créateur du QCM gère les réponses de ses questions"
  on public.answer_options
  using (
    exists (
      select 1 from public.questions qu
      join public.quizzes q on q.id = qu.quiz_id
      where qu.id = answer_options.question_id and q.formateur_id = auth.uid()
    ) or public.has_role('admin')
  )
  with check (
    exists (
      select 1 from public.questions qu
      join public.quizzes q on q.id = qu.quiz_id
      where qu.id = answer_options.question_id and q.formateur_id = auth.uid()
    ) or public.has_role('admin')
  );
