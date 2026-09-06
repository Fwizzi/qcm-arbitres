import { useEffect, useState, type FormEvent } from 'react';
import AppLayout from '../../components/AppLayout';
import AdminNav from '../../components/AdminNav';
import { supabase } from '../../lib/supabaseClient';

function premierJourDuMoisLocal(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export default function Reglages() {
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [confirmation, setConfirmation] = useState(false);

  const [retentionArbitre, setRetentionArbitre] = useState(30);
  const [retentionFormateurIllimitee, setRetentionFormateurIllimitee] = useState(true);
  const [retentionFormateurJours, setRetentionFormateurJours] = useState(365);
  const [retentionVideo, setRetentionVideo] = useState(90);

  const [quotaClasseA, setQuotaClasseA] = useState(900000);
  const [quotaClasseB, setQuotaClasseB] = useState(9000000);
  const [quotaGo, setQuotaGo] = useState(9);

  const [usage, setUsage] = useState({ class_a_count: 0, class_b_count: 0, bytes_uploaded: 0 });

  useEffect(() => {
    async function charger() {
      setLoading(true);
      setErreur(null);

      const { data: reglages, error: err1 } = await supabase.from('app_settings').select('key, value');
      const { data: usageData } = await supabase
        .from('r2_usage_monthly')
        .select('class_a_count, class_b_count, bytes_uploaded')
        .eq('month', premierJourDuMoisLocal())
        .maybeSingle();

      if (err1) {
        setErreur('Impossible de charger les réglages. Réessaie dans un instant.');
        setLoading(false);
        return;
      }

      const val = (cle: string) => reglages?.find((r) => r.key === cle)?.value;

      setRetentionArbitre(Number(val('arbitre_retention_days') ?? 30));
      const formVal = val('formateur_retention_days') ?? 'unlimited';
      if (formVal === 'unlimited') {
        setRetentionFormateurIllimitee(true);
      } else {
        setRetentionFormateurIllimitee(false);
        setRetentionFormateurJours(Number(formVal));
      }
      setRetentionVideo(Number(val('video_retention_days') ?? 90));
      setQuotaClasseA(Number(val('r2_quota_class_a_per_month') ?? 900000));
      setQuotaClasseB(Number(val('r2_quota_class_b_per_month') ?? 9000000));
      setQuotaGo(Number(val('r2_quota_gb_uploaded_per_month') ?? 9));

      setUsage(usageData ?? { class_a_count: 0, class_b_count: 0, bytes_uploaded: 0 });
      setLoading(false);
    }
    charger();
  }, []);

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    setEnregistrement(true);
    setConfirmation(false);
    setErreur(null);

    const lignes = [
      { key: 'arbitre_retention_days', value: String(retentionArbitre) },
      {
        key: 'formateur_retention_days',
        value: retentionFormateurIllimitee ? 'unlimited' : String(retentionFormateurJours),
      },
      { key: 'video_retention_days', value: String(retentionVideo) },
      { key: 'r2_quota_class_a_per_month', value: String(quotaClasseA) },
      { key: 'r2_quota_class_b_per_month', value: String(quotaClasseB) },
      { key: 'r2_quota_gb_uploaded_per_month', value: String(quotaGo) },
    ];

    // Ces lignes existent déjà toutes (créées par les migrations) : on les
    // met à jour une par une plutôt qu'un upsert, pour rester strictement
    // dans le cadre de la règle de sécurité "UPDATE réservé à l'admin".
    const resultats = await Promise.all(
      lignes.map((l) => supabase.from('app_settings').update({ value: l.value }).eq('key', l.key))
    );
    const error = resultats.find((r) => r.error)?.error ?? null;
    setEnregistrement(false);
    if (error) {
      setErreur("L'enregistrement a échoué. Réessaie dans un instant.");
    } else {
      setConfirmation(true);
    }
  }

  function barre(valeur: number, quota: number) {
    const pourcentage = Math.min(100, Math.round((valeur / quota) * 100));
    const couleur = pourcentage >= 90 ? 'bg-card-red' : pourcentage >= 70 ? 'bg-card-yellow' : 'bg-pitch';
    return (
      <div className="h-1.5 bg-canvas rounded overflow-hidden mt-1">
        <div className={`h-full ${couleur}`} style={{ width: `${pourcentage}%` }} />
      </div>
    );
  }

  if (loading) {
    return (
      <AppLayout>
        <AdminNav />
        <p className="text-sm text-muted">Chargement…</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AdminNav />
      <h1 className="text-lg font-semibold mb-4">Réglages</h1>

      <p className="text-sm font-medium mb-2">Usage Cloudflare R2 ce mois-ci</p>
      <div className="bg-surface border border-border rounded p-3 mb-6 text-sm">
        <div className="mb-3">
          <div className="flex justify-between text-xs text-muted mb-0.5">
            <span>Requêtes d'envoi (Classe A)</span>
            <span>
              {usage.class_a_count.toLocaleString('fr-FR')} / {quotaClasseA.toLocaleString('fr-FR')}
            </span>
          </div>
          {barre(usage.class_a_count, quotaClasseA)}
        </div>
        <div className="mb-3">
          <div className="flex justify-between text-xs text-muted mb-0.5">
            <span>Requêtes de lecture (Classe B)</span>
            <span>
              {usage.class_b_count.toLocaleString('fr-FR')} / {quotaClasseB.toLocaleString('fr-FR')}
            </span>
          </div>
          {barre(usage.class_b_count, quotaClasseB)}
        </div>
        <div>
          <div className="flex justify-between text-xs text-muted mb-0.5">
            <span>Volume envoyé</span>
            <span>
              {(usage.bytes_uploaded / 1_000_000_000).toFixed(2)} / {quotaGo} Go
            </span>
          </div>
          {barre(usage.bytes_uploaded / 1_000_000_000, quotaGo)}
        </div>
        <p className="text-xs text-muted mt-3">
          Estimation basée sur les opérations déclenchées par l'application (pas une donnée
          officielle Cloudflare). Remise à zéro chaque mois.
        </p>
      </div>

      <form onSubmit={enregistrer}>
        <p className="text-sm font-medium mb-2">Seuils R2 (marge de sécurité sous l'offre gratuite)</p>
        <div className="grid grid-cols-1 gap-3 mb-6">
          <label className="text-sm">
            Quota requêtes Classe A / mois
            <input
              type="number"
              value={quotaClasseA}
              onChange={(e) => setQuotaClasseA(Number(e.target.value))}
              className="w-full border border-border rounded px-3 py-2 mt-1"
            />
          </label>
          <label className="text-sm">
            Quota requêtes Classe B / mois
            <input
              type="number"
              value={quotaClasseB}
              onChange={(e) => setQuotaClasseB(Number(e.target.value))}
              className="w-full border border-border rounded px-3 py-2 mt-1"
            />
          </label>
          <label className="text-sm">
            Quota Go envoyés / mois
            <input
              type="number"
              value={quotaGo}
              onChange={(e) => setQuotaGo(Number(e.target.value))}
              className="w-full border border-border rounded px-3 py-2 mt-1"
            />
          </label>
        </div>

        <p className="text-sm font-medium mb-2">Durées de conservation</p>
        <div className="grid grid-cols-1 gap-3 mb-6">
          <label className="text-sm">
            Historique arbitre (jours après la fin du QCM)
            <input
              type="number"
              value={retentionArbitre}
              onChange={(e) => setRetentionArbitre(Number(e.target.value))}
              className="w-full border border-border rounded px-3 py-2 mt-1"
            />
          </label>

          <div className="text-sm">
            <span className="block mb-1">Historique formateur/admin</span>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={retentionFormateurIllimitee}
                onChange={(e) => setRetentionFormateurIllimitee(e.target.checked)}
              />
              Illimitée (jusqu'à suppression manuelle)
            </label>
            {!retentionFormateurIllimitee && (
              <input
                type="number"
                value={retentionFormateurJours}
                onChange={(e) => setRetentionFormateurJours(Number(e.target.value))}
                className="w-full border border-border rounded px-3 py-2"
              />
            )}
          </div>

          <label className="text-sm">
            Vidéos des QCM expirés (jours avant suppression)
            <input
              type="number"
              value={retentionVideo}
              onChange={(e) => setRetentionVideo(Number(e.target.value))}
              className="w-full border border-border rounded px-3 py-2 mt-1"
            />
          </label>
        </div>

        {erreur && <p className="text-sm text-card-red bg-card-red-bg rounded px-3 py-2 mb-3">{erreur}</p>}
        {confirmation && (
          <p className="text-sm text-pitch-dark bg-pitch-light rounded px-3 py-2 mb-3">
            Réglages enregistrés.
          </p>
        )}

        <button
          type="submit"
          disabled={enregistrement}
          className="w-full bg-pitch text-white font-medium rounded py-2 disabled:opacity-60"
        >
          {enregistrement ? 'Enregistrement…' : 'Enregistrer les réglages'}
        </button>
      </form>
    </AppLayout>
  );
}
