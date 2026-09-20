-- =========================================================
-- Correction de performance : index manquant sur selected_answers
-- =========================================================
-- Supprimer une ligne de "answer_options" oblige PostgreSQL à vérifier
-- s'il existe des lignes de "selected_answers" qui la référencent (pour
-- appliquer la suppression en cascade). Sans index sur cette colonne,
-- cette vérification doit parcourir TOUTE la table à chaque suppression
-- — de plus en plus lent à mesure que les arbitres répondent aux QCM,
-- jusqu'à provoquer un timeout (erreur Postgres 57014) lors de la
-- modification d'une question par le formateur.

create index if not exists selected_answers_option_id_idx on public.selected_answers (option_id);

-- Même constat pour question_id, utile ailleurs (ex. lecture des
-- réponses d'une question précise) : ajouté par la même occasion.
create index if not exists selected_answers_question_id_idx on public.selected_answers (question_id);
