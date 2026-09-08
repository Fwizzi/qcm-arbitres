// Fonction Supabase Edge Function : crée un compte (e-mail + mot de passe),
// réservée à l'administrateur. La clé secrète (SERVICE_ROLE) reste ici,
// côté serveur, et n'est jamais envoyée au navigateur.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Non authentifié.' }, 401);
    }

    // Client "au nom de l'appelant" : sert uniquement à vérifier qui il est
    // et s'il est administrateur, en respectant les règles RLS normales.
    const supabaseCaller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabaseCaller.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: 'Session invalide.' }, 401);
    }

    const { data: roleRows } = await supabaseCaller
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin');

    if (!roleRows || roleRows.length === 0) {
      return json({ error: "Réservé à l'administrateur." }, 403);
    }

    const { email, password, full_name } = await req.json();
    if (!email || !password || !full_name) {
      return json({ error: 'E-mail, mot de passe et nom complet requis.' }, 400);
    }
    if (password.length < 8) {
      return json({ error: 'Le mot de passe doit faire au moins 8 caractères.' }, 400);
    }

    // Client "admin" : utilise la clé secrète, disponible uniquement ici,
    // jamais transmise au navigateur.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createErr) {
      return json({ error: traduireErreurCreation(createErr.message) }, 400);
    }

    return json({ id: created.user?.id }, 200);
  } catch (_e) {
    return json({ error: 'Erreur inattendue côté serveur.' }, 500);
  }
});

function traduireErreurCreation(message: string): string {
  if (message.toLowerCase().includes('already') || message.toLowerCase().includes('registered')) {
    return 'Un compte existe déjà avec cet e-mail.';
  }
  return message;
}
