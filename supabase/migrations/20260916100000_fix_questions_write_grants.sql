-- =========================================================
-- Correction : droits d'écriture manquants sur questions/answer_options
-- =========================================================
-- Lors du verrouillage des colonnes sensibles (is_correct, explanation),
-- seul SELECT avait été explicitement retiré puis regranté colonne par
-- colonne. Les droits d'écriture (INSERT/UPDATE/DELETE) doivent être
-- garantis séparément, sans quoi certaines opérations (ex. remplacer les
-- réponses d'une question modifiée) échouent silencieusement.
-- Cette migration ne touche PAS à la restriction de lecture déjà en
-- place : SELECT reste limité aux colonnes non sensibles pour ces deux
-- tables.

grant insert, update, delete on public.questions to authenticated;
grant insert, update, delete on public.answer_options to authenticated;
