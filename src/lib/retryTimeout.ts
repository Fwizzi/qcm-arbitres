import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Exécute une opération Supabase (insert/update/delete...) et la relance
 * automatiquement une fois si elle échoue avec un timeout ponctuel
 * (code Postgres 57014 : "canceling statement due to statement timeout").
 * Invisible pour la personne : elle ne voit jamais cette erreur passagère,
 * seulement un échec si la deuxième tentative échoue aussi.
 */
export async function avecRetriesTimeout<T>(
  operation: () => PromiseLike<{ data: T; error: PostgrestError | null }>,
  tentativesMax = 2
): Promise<{ data: T; error: PostgrestError | null }> {
  let derniereReponse: { data: T; error: PostgrestError | null };
  for (let tentative = 1; tentative <= tentativesMax; tentative++) {
    derniereReponse = await operation();
    if (!derniereReponse.error || derniereReponse.error.code !== '57014') {
      return derniereReponse;
    }
  }
  return derniereReponse!;
}
