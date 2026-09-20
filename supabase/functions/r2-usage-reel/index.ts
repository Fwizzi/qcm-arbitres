// Fonction Supabase Edge Function : interroge directement l'API GraphQL
// Analytics de Cloudflare pour obtenir les VRAIES valeurs d'usage R2
// (stockage réel, nombre exact d'opérations Classe A/B ce mois-ci),
// au lieu de l'estimation approximative que l'application maintenait
// elle-même jusqu'ici (compteurs qui pouvaient dériver de la réalité :
// envois annulés comptés quand même, suppressions jamais soustraites...).
//
// Classification officielle Cloudflare (developers.cloudflare.com/r2/pricing) :
//   Classe A (payante) : PutObject, ListObjects, CreateMultipartUpload...
//   Classe B (payante) : GetObject, HeadObject...
//   Gratuit            : DeleteObject, DeleteBucket, AbortMultipartUpload
// Cette application ne fait jamais que PutObject (envoi), GetObject
// (lecture) et DeleteObject (suppression, gratuite, donc ignorée ici).
//
// Réservée à l'administrateur. Nécessite un jeton Cloudflare séparé
// (secret CF_API_TOKEN), avec la permission "Account Analytics: Read".
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

const REQUETE_OPERATIONS = `
  query Operations($accountTag: string!, $start: Time, $end: Time, $bucketName: string) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        r2OperationsAdaptiveGroups(
          limit: 10000
          filter: { datetime_geq: $start, datetime_leq: $end, bucketName: $bucketName }
        ) {
          sum { requests }
          dimensions { actionType }
        }
      }
    }
  }
`;

const REQUETE_STOCKAGE = `
  query Storage($accountTag: string!, $start: Time, $end: Time, $bucketName: string) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        r2StorageAdaptiveGroups(
          limit: 1
          filter: { datetime_geq: $start, datetime_leq: $end, bucketName: $bucketName }
          orderBy: [datetime_DESC]
        ) {
          max { objectCount payloadSize metadataSize }
          dimensions { datetime }
        }
      }
    }
  }
`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Non authentifié.' }, 401);
    }

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
      return json({ error: 'Réservé à l’administrateur.' }, 403);
    }

    const cfApiToken = Deno.env.get('CF_API_TOKEN');
    if (!cfApiToken) {
      return json(
        { error: 'Le jeton Cloudflare (CF_API_TOKEN) n’est pas configuré côté serveur.' },
        500
      );
    }

    const accountTag = Deno.env.get('R2_ACCOUNT_ID')!;
    const bucketName = Deno.env.get('R2_BUCKET_NAME')!;

    const maintenant = new Date();
    const debutMois = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1));

    async function appelGraphQL(query: string) {
      const reponse = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: {
            accountTag,
            bucketName,
            start: debutMois.toISOString(),
            end: maintenant.toISOString(),
          },
        }),
      });
      const donnees = await reponse.json();
      if (!reponse.ok || donnees.errors) {
        throw new Error(donnees.errors?.[0]?.message ?? 'Erreur de l’API Cloudflare.');
      }
      return donnees;
    }

    const [operationsData, storageData] = await Promise.all([
      appelGraphQL(REQUETE_OPERATIONS),
      appelGraphQL(REQUETE_STOCKAGE),
    ]);

    const lignesOperations =
      operationsData?.data?.viewer?.accounts?.[0]?.r2OperationsAdaptiveGroups ?? [];

    const CLASSE_A = new Set([
      'ListBuckets', 'PutBucket', 'ListObjects', 'PutObject', 'CopyObject',
      'CompleteMultipartUpload', 'CreateMultipartUpload', 'LifecycleStorageTierTransition',
      'ListMultipartUploads', 'UploadPart', 'UploadPartCopy', 'ListParts',
      'PutBucketEncryption', 'PutBucketCors', 'PutBucketLifecycleConfiguration',
    ]);
    const CLASSE_B = new Set([
      'HeadBucket', 'HeadObject', 'GetObject', 'UsageSummary',
      'GetBucketEncryption', 'GetBucketLocation', 'GetBucketCors', 'GetBucketLifecycleConfiguration',
    ]);

    let classA = 0;
    let classB = 0;
    for (const ligne of lignesOperations) {
      const type = ligne?.dimensions?.actionType;
      const n = ligne?.sum?.requests ?? 0;
      if (CLASSE_A.has(type)) classA += n;
      else if (CLASSE_B.has(type)) classB += n;
      // DeleteObject et les autres opérations gratuites sont ignorées ici.
    }

    const ligneStockage =
      storageData?.data?.viewer?.accounts?.[0]?.r2StorageAdaptiveGroups?.[0]?.max ?? null;

    return json(
      {
        periode: { debut: debutMois.toISOString(), fin: maintenant.toISOString() },
        classA,
        classB,
        objectCount: ligneStockage?.objectCount ?? null,
        payloadSizeOctets: ligneStockage?.payloadSize ?? null,
      },
      200
    );
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erreur inattendue côté serveur.' }, 500);
  }
});
