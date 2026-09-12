-- =========================================================
-- Un QCM publié ne peut plus être modifié par le formateur
-- =========================================================
-- Nouvelle règle (remplace la précédente qui autorisait la modification
-- tant qu'aucun arbitre n'avait répondu) : dès qu'un QCM est publié, ses
-- paramètres et ses questions sont figés pour le formateur. L'admin
-- garde la possibilité de tout modifier, en cas de besoin exceptionnel.
-- Appliqué ici au niveau base de données (déclencheur), pas seulement
-- dans l'écran, pour que la règle soit réellement infranchissable.

create or replace function public.empecher_modif_qcm_publie()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.status = 'published' and not public.has_role('admin') then
    raise exception 'Un QCM publié ne peut plus être modifié.';
  end if;
  return new;
end;
$$;

create trigger trg_empecher_modif_qcm_publie
before update on public.quizzes
for each row execute function public.empecher_modif_qcm_publie();

-- Même règle pour les questions et leurs réponses (rattachées à un QCM) :
-- pas de modification/suppression une fois le QCM publié.
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
    v_quiz_id := OLD.quiz_id;
  else
    select quiz_id into v_quiz_id from public.questions where id = OLD.question_id;
  end if;

  select status into v_status from public.quizzes where id = v_quiz_id;

  if v_status = 'published' and not public.has_role('admin') then
    raise exception 'Les questions d''un QCM publié ne peuvent plus être modifiées.';
  end if;
  return old;
end;
$$;

create trigger trg_empecher_modif_questions_qcm_publie
before update or delete on public.questions
for each row execute function public.empecher_modif_questions_qcm_publie();

create trigger trg_empecher_modif_options_qcm_publie
before update or delete on public.answer_options
for each row execute function public.empecher_modif_questions_qcm_publie();
