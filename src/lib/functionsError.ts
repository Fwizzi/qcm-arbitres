/**
 * supabase.functions.invoke() ne restitue pas le corps JSON d'une réponse
 * d'erreur (non-2xx) dans `data` — seulement un message générique dans
 * `error`. Cette fonction va chercher le vrai message que la fonction
 * serveur a renvoyé, pour l'afficher tel quel à la personne concernée.
 */
export async function extraireErreurFonction(
  error: unknown,
  dataFallback?: { error?: string } | null
): Promise<string> {
  if (!error) return dataFallback?.error ?? 'Une erreur est survenue.';

  const err = error as { context?: Response; message?: string };
  if (err.context && typeof err.context.json === 'function') {
    try {
      const corps = await err.context.json();
      if (corps?.error) return corps.error as string;
    } catch {
      // Corps non-JSON : on retombe sur le message générique ci-dessous.
    }
  }
  return dataFallback?.error ?? err.message ?? 'Une erreur est survenue.';
}
