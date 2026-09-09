import { supabase } from './supabaseClient';

/**
 * Inscrit une action importante dans le journal d'activité, consultable
 * ensuite par l'administrateur. Volontairement silencieux en cas d'échec
 * (un journal qui ne s'écrit pas ne doit jamais bloquer l'action
 * elle-même, ex. la création d'un QCM doit réussir même si le journal
 * a un souci).
 */
export async function logActivity(
  action: string,
  targetType?: string,
  targetId?: string
): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from('activity_log').insert({
      user_id: data.user.id,
      action,
      target_type: targetType ?? null,
      target_id: targetId ?? null,
    });
  } catch {
    // Volontairement ignoré, voir commentaire ci-dessus.
  }
}
