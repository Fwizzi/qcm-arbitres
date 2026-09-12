-- =========================================================
-- Ajout : nombre de réponses cochables, visible de l'arbitre
-- =========================================================
-- L'arbitre doit savoir COMBIEN de cases il peut cocher au maximum sur
-- une question, sans jamais savoir LESQUELLES sont les bonnes. On ajoute
-- ce compte (max_selectable) à la fonction d'examen : connaître un
-- nombre ne permet pas de deviner l'identité des bonnes réponses.

drop function if exists public.get_exam_questions(uuid);

create function public.get_exam_questions(p_quiz_id uuid)
returns table (
  id uuid,
  type public.question_type,
  media_url text,
  text text,
  order_index integer,
  max_selectable integer,
  options jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.quizzes q
    join public.quiz_groups qg on qg.quiz_id = q.id
    join public.group_members gm on gm.group_id = qg.group_id
    where q.id = p_quiz_id
      and q.status = 'published'
      and current_date between q.period_start and q.period_end
      and gm.user_id = auth.uid()
  ) then
    raise exception 'Non autorisé.';
  end if;

  -- Empêche de repasser un QCM déjà soumis (même en accédant directement à l'URL).
  if exists (
    select 1 from public.quiz_attempts qa
    where qa.quiz_id = p_quiz_id and qa.user_id = auth.uid()
      and qa.status in ('submitted', 'auto_submitted')
  ) then
    raise exception 'Ce QCM a déjà été soumis.';
  end if;

  return query
  select
    qu.id, qu.type, qu.media_url, qu.text, qu.order_index,
    (select count(*)::integer from public.answer_options ao where ao.question_id = qu.id and ao.is_correct) as max_selectable,
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', ao.id, 'text', ao.text) order by ao.id)
       from public.answer_options ao where ao.question_id = qu.id),
      '[]'::jsonb
    ) as options
  from public.questions qu
  where qu.quiz_id = p_quiz_id
  order by qu.order_index;
end;
$$;

grant execute on function public.get_exam_questions(uuid) to authenticated;
