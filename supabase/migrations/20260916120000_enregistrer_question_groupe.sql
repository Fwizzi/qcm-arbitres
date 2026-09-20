-- =========================================================
-- Regroupement en un seul appel : question + ses réponses
-- =========================================================
-- Jusqu'ici, enregistrer une question modifiée demandait 3 allers-retours
-- séparés au serveur (UPDATE question, DELETE anciennes réponses, INSERT
-- nouvelles réponses) — une création en demandait 2. Chaque aller-retour
-- ayant un coût fixe incompressible (réseau, authentification, sécurité),
-- les regrouper en UN SEUL appel réduit d'autant le temps total, et
-- réduit aussi le nombre d'occasions de tomber sur un ralentissement
-- ponctuel.

create function public.enregistrer_question(
  p_quiz_id uuid,
  p_question_id uuid,      -- null pour une création, rempli pour une modification
  p_type public.question_type,
  p_media_url text,
  p_text text,
  p_explanation text,
  p_order_index integer,
  p_options jsonb          -- tableau [{"text": "...", "is_correct": true}, ...]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question_id uuid;
begin
  if not exists (
    select 1 from public.quizzes q
    where q.id = p_quiz_id and (q.formateur_id = auth.uid() or public.has_role('admin'))
  ) then
    raise exception 'Non autorisé.';
  end if;

  if p_question_id is not null then
    update public.questions
    set type = p_type, media_url = p_media_url, text = p_text, explanation = p_explanation
    where id = p_question_id and quiz_id = p_quiz_id;

    if not found then
      raise exception 'Question introuvable.';
    end if;

    delete from public.answer_options where question_id = p_question_id;
    v_question_id := p_question_id;
  else
    insert into public.questions (quiz_id, type, media_url, text, explanation, order_index)
    values (p_quiz_id, p_type, p_media_url, p_text, p_explanation, p_order_index)
    returning id into v_question_id;
  end if;

  insert into public.answer_options (question_id, text, is_correct)
  select v_question_id, (opt->>'text')::text, (opt->>'is_correct')::boolean
  from jsonb_array_elements(p_options) as opt;

  return v_question_id;
end;
$$;

grant execute on function public.enregistrer_question(uuid, uuid, public.question_type, text, text, text, integer, jsonb) to authenticated;
