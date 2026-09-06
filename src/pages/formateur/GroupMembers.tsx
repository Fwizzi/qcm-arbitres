import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppLayout from '../../components/AppLayout';
import FormateurNav from '../../components/FormateurNav';
import { supabase } from '../../lib/supabaseClient';

interface ArbitreRow {
  id: string;
  full_name: string;
  email: string;
}

export default function GroupMembers() {
  const { id: groupId } = useParams();

  const [nomGroupe, setNomGroupe] = useState('');
  const [arbitres, setArbitres] = useState<ArbitreRow[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [recherche, setRecherche] = useState('');
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [confirmation, setConfirmation] = useState(false);

  useEffect(() => {
    async function charger() {
      if (!groupId) return;
      setLoading(true);
      setErreur(null);

      const [{ data: groupe, error: err1 }, { data: idsArbitres }, { data: membresActuels }] =
        await Promise.all([
          supabase.from('groups').select('name').eq('id', groupId).single(),
          supabase.from('user_roles').select('user_id').eq('role', 'arbitre'),
          supabase.from('group_members').select('user_id').eq('group_id', groupId),
        ]);

      if (err1 || !groupe) {
        setErreur('Impossible de charger ce groupe.');
        setLoading(false);
        return;
      }
      setNomGroupe(groupe.name);

      const ids = (idsArbitres ?? []).map((r) => r.user_id);
      if (ids.length > 0) {
        const { data: profils } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', ids)
          .order('full_name');
        setArbitres(profils ?? []);
      }

      setSelection(new Set((membresActuels ?? []).map((m) => m.user_id)));
      setLoading(false);
    }
    charger();
  }, [groupId]);

  function basculer(id: string) {
    setConfirmation(false);
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function enregistrer() {
    if (!groupId) return;
    setEnregistrement(true);
    setErreur(null);

    await supabase.from('group_members').delete().eq('group_id', groupId);
    if (selection.size > 0) {
      const { error } = await supabase
        .from('group_members')
        .insert(Array.from(selection).map((userId) => ({ group_id: groupId, user_id: userId })));
      if (error) {
        setErreur("L'enregistrement a échoué. Réessaie dans un instant.");
        setEnregistrement(false);
        return;
      }
    }
    setEnregistrement(false);
    setConfirmation(true);
  }

  const arbitresFiltres = arbitres.filter((a) =>
    a.full_name.toLowerCase().includes(recherche.toLowerCase())
  );

  if (loading) {
    return (
      <AppLayout>
        <FormateurNav />
        <p className="text-sm text-muted">Chargement…</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <FormateurNav />
      <Link to="/formateur/groupes" className="text-sm text-muted underline mb-3 inline-block">
        ← Mes groupes
      </Link>
      <h1 className="text-lg font-semibold mb-1">{nomGroupe}</h1>
      <p className="text-sm text-muted mb-4">Coche les arbitres à inclure ({selection.size} sélectionné(s))</p>

      {erreur && <p className="text-sm text-card-red mb-3">{erreur}</p>}

      <input
        type="text"
        placeholder="Rechercher un arbitre…"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        className="w-full border border-border rounded px-3 py-2 mb-4 text-sm"
      />

      {arbitresFiltres.length === 0 && <p className="text-sm text-muted">Aucun arbitre trouvé.</p>}

      <ul className="mb-6">
        {arbitresFiltres.map((a) => (
          <li key={a.id} className="border-b border-border py-2">
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={selection.has(a.id)} onChange={() => basculer(a.id)} />
              <span className="text-sm">{a.full_name}</span>
            </label>
          </li>
        ))}
      </ul>

      {confirmation && (
        <p className="text-sm text-pitch-dark bg-pitch-light rounded px-3 py-2 mb-3">Enregistré.</p>
      )}

      <button
        type="button"
        onClick={enregistrer}
        disabled={enregistrement}
        className="w-full bg-pitch text-white font-medium rounded py-2 disabled:opacity-60"
      >
        {enregistrement ? 'Enregistrement…' : `Enregistrer (${selection.size} arbitre(s))`}
      </button>
    </AppLayout>
  );
}
