import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../../components/AppLayout';
import FormateurNav from '../../components/FormateurNav';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

interface GroupRow {
  id: string;
  name: string;
  formateur_id: string;
}
interface ProfilLeger {
  id: string;
  full_name: string;
}

export default function Groupes() {
  const { session } = useAuth();
  const [groupes, setGroupes] = useState<GroupRow[]>([]);
  const [membres, setMembres] = useState<{ group_id: string; user_id: string }[]>([]);
  const [formateurs, setFormateurs] = useState<ProfilLeger[]>([]);
  const [partages, setPartages] = useState<{ group_id: string; shared_with_user_id: string }[]>([]);

  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nomNouveauGroupe, setNomNouveauGroupe] = useState('');
  const [creation, setCreation] = useState(false);
  const [panneauPartageOuvert, setPanneauPartageOuvert] = useState<string | null>(null);

  async function charger() {
    setLoading(true);
    setErreur(null);

    const [
      { data: groupesData, error: err1 },
      { data: membresData },
      { data: partagesData },
      { data: rolesFormateurs },
    ] = await Promise.all([
      supabase.from('groups').select('id, name, formateur_id').order('name'),
      supabase.from('group_members').select('group_id, user_id'),
      supabase.from('group_shares').select('group_id, shared_with_user_id'),
      supabase.from('user_roles').select('user_id').eq('role', 'formateur'),
    ]);

    if (err1) {
      setErreur('Impossible de charger les groupes. Réessaie dans un instant.');
      setLoading(false);
      return;
    }

    setGroupes(groupesData ?? []);
    setMembres(membresData ?? []);
    setPartages(partagesData ?? []);

    const idsFormateurs = (rolesFormateurs ?? [])
      .map((r) => r.user_id)
      .filter((id) => id !== session?.user.id);
    if (idsFormateurs.length > 0) {
      const { data: profils } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', idsFormateurs);
      setFormateurs(profils ?? []);
    } else {
      setFormateurs([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function nombreMembres(groupId: string) {
    return membres.filter((m) => m.group_id === groupId).length;
  }

  function estPartageAvec(groupId: string, formateurId: string) {
    return partages.some((p) => p.group_id === groupId && p.shared_with_user_id === formateurId);
  }

  async function creerGroupe(e: FormEvent) {
    e.preventDefault();
    if (!session || !nomNouveauGroupe.trim()) return;
    setCreation(true);
    const { error } = await supabase
      .from('groups')
      .insert({ name: nomNouveauGroupe.trim(), formateur_id: session.user.id });
    setCreation(false);
    if (!error) {
      setNomNouveauGroupe('');
      await charger();
    }
  }

  async function basculerPartage(groupId: string, formateurId: string, actif: boolean) {
    if (actif) {
      await supabase
        .from('group_shares')
        .delete()
        .eq('group_id', groupId)
        .eq('shared_with_user_id', formateurId);
    } else {
      await supabase.from('group_shares').insert({ group_id: groupId, shared_with_user_id: formateurId });
    }
    await charger();
  }

  async function dupliquerGroupe(groupe: GroupRow) {
    if (!session) return;
    const { data: nouveauGroupe, error } = await supabase
      .from('groups')
      .insert({ name: `${groupe.name} (copie)`, formateur_id: session.user.id })
      .select('id')
      .single();
    if (error || !nouveauGroupe) return;

    const membresACopier = membres.filter((m) => m.group_id === groupe.id);
    if (membresACopier.length > 0) {
      await supabase.from('group_members').insert(
        membresACopier.map((m) => ({ group_id: nouveauGroupe.id, user_id: m.user_id }))
      );
    }
    await charger();
  }

  if (loading) {
    return (
      <AppLayout>
        <FormateurNav />
        <p className="text-sm text-muted">Chargement…</p>
      </AppLayout>
    );
  }

  const mesGroupes = groupes.filter((g) => g.formateur_id === session?.user.id);
  const groupesPartages = groupes.filter((g) => g.formateur_id !== session?.user.id);

  return (
    <AppLayout>
      <FormateurNav />
      <h1 className="text-lg font-semibold mb-4">Mes groupes</h1>
      {erreur && <p className="text-sm text-card-red mb-4">{erreur}</p>}

      <form onSubmit={creerGroupe} className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="Nom du nouveau groupe"
          value={nomNouveauGroupe}
          onChange={(e) => setNomNouveauGroupe(e.target.value)}
          className="flex-1 border border-border rounded px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={creation || !nomNouveauGroupe.trim()}
          className="bg-pitch text-white text-sm font-medium rounded px-4 disabled:opacity-60"
        >
          Créer
        </button>
      </form>

      {mesGroupes.length === 0 && groupesPartages.length === 0 && (
        <p className="text-sm text-muted">Aucun groupe pour le moment.</p>
      )}

      <ul className="flex flex-col gap-2 mb-6">
        {mesGroupes.map((g) => (
          <li key={g.id} className="bg-surface border border-border rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{g.name}</span>
              <span className="text-xs text-muted">{nombreMembres(g.id)} arbitre(s)</span>
            </div>
            <div className="flex gap-2">
              <Link
                to={`/formateur/groupes/${g.id}`}
                className="flex-1 text-center text-xs border border-border rounded py-1.5"
              >
                Modifier
              </Link>
              <button
                type="button"
                onClick={() => setPanneauPartageOuvert(panneauPartageOuvert === g.id ? null : g.id)}
                className="flex-1 text-xs border border-border rounded py-1.5"
              >
                Partager
              </button>
            </div>

            {panneauPartageOuvert === g.id && (
              <div className="mt-3 pt-3 border-t border-border">
                {formateurs.length === 0 && (
                  <p className="text-xs text-muted">Aucun autre formateur pour le moment.</p>
                )}
                {formateurs.map((f) => {
                  const actif = estPartageAvec(g.id, f.id);
                  return (
                    <label key={f.id} className="flex items-center gap-2 text-sm py-1">
                      <input
                        type="checkbox"
                        checked={actif}
                        onChange={() => basculerPartage(g.id, f.id, actif)}
                      />
                      {f.full_name}
                    </label>
                  );
                })}
              </div>
            )}
          </li>
        ))}
      </ul>

      {groupesPartages.length > 0 && (
        <>
          <p className="text-sm font-medium mb-2">Partagés avec toi</p>
          <ul className="flex flex-col gap-2">
            {groupesPartages.map((g) => (
              <li key={g.id} className="bg-surface border border-border rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{g.name}</span>
                  <span className="text-xs text-muted">
                    {nombreMembres(g.id)} arbitre(s) · lecture seule
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => dupliquerGroupe(g)}
                  className="w-full text-xs border border-border rounded py-1.5"
                >
                  Dupliquer pour modifier
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </AppLayout>
  );
}
