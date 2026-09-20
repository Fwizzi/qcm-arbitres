// Fonction Supabase Edge Function déclenchée automatiquement toutes les
// 30 minutes (voir README de ce dossier pour la mise en place du
// déclencheur planifié). Envoie UNE SEULE invitation en attente à
// chaque exécution : avec un envoi toutes les 30 minutes, cela reste
// sous la limite gratuite de Supabase (2 e-mails par heure).
//
// Protégée par un secret (pas par une session utilisateur, puisque
// personne n'est connecté quand le déclencheur planifié s'exécute) :
// l'appelant doit fournir le même secret que celui stocké dans la
// variable d'environnement CRON_SECRET de cette fonction.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://fwizzi.github.io/qcm-arbitres';

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  const secretAttendu = Deno.env.get('CRON_SECRET');
  const secretRecu = req.headers.get('x-cron-secret');
  if (!secretAttendu || secretRecu !== secretAttendu) {
    return json({ error: 'Non autorisé.' }, 401);
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: rows, error: selectErr } = await supabaseAdmin
      .from('invite_queue')
      .select('id, full_name, email, roles')
      .eq('status', 'en_attente')
      .order('created_at', { ascending: true })
      .limit(1);

    if (selectErr) {
      return json({ error: selectErr.message }, 500);
    }
    if (!rows || rows.length === 0) {
      return json({ sent: 0, message: "Aucune invitation en attente." }, 200);
    }

    const invite = rows[0];

    // "Réservation" de cette ligne avant l'envoi : si deux exécutions se
    // chevauchaient, seule la première obtiendrait cette mise à jour.
    const { data: claimed } = await supabaseAdmin
      .from('invite_queue')
      .update({ status: 'en_cours' })
      .eq('id', invite.id)
      .eq('status', 'en_attente')
      .select()
      .maybeSingle();

    if (!claimed) {
      return json({ sent: 0, message: 'Rien à envoyer (déjà pris en charge).' }, 200);
    }

    const { data: created, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      invite.email,
      {
        data: { full_name: invite.full_name },
        redirectTo: `${SITE_URL}/activer-mon-compte`,
      }
    );

    if (inviteErr || !created?.user) {
      await supabaseAdmin
        .from('invite_queue')
        .update({ status: 'echec', erreur: inviteErr?.message ?? 'Échec inconnu.' })
        .eq('id', invite.id);
      return json({ sent: 0, error: inviteErr?.message ?? 'Échec inconnu.' }, 200);
    }

    const { error: rolesErr } = await supabaseAdmin
      .from('user_roles')
      .insert((invite.roles as string[]).map((role) => ({ user_id: created.user!.id, role })));

    await supabaseAdmin
      .from('invite_queue')
      .update({
        status: 'envoye',
        sent_at: new Date().toISOString(),
        user_id: created.user.id,
        erreur: rolesErr
          ? "Compte créé et e-mail envoyé, mais les rôles n'ont pas pu être attribués : attribue-les manuellement dans Comptes."
          : null,
      })
      .eq('id', invite.id);

    return json({ sent: 1, email: invite.email }, 200);
  } catch (_e) {
    return json({ error: 'Erreur inattendue côté serveur.' }, 500);
  }
});
