import { NavLink } from 'react-router-dom';

const liens = [
  { to: '/formateur', label: 'Mes QCM', end: true },
  { to: '/formateur/groupes', label: 'Mes groupes' },
];

export default function FormateurNav() {
  return (
    <nav className="flex gap-4 border-b border-border mb-5 text-sm">
      {liens.map((lien) => (
        <NavLink
          key={lien.to}
          to={lien.to}
          end={lien.end}
          className={({ isActive }) =>
            'pb-2 -mb-px border-b-2 ' +
            (isActive ? 'border-pitch text-pitch font-medium' : 'border-transparent text-muted')
          }
        >
          {lien.label}
        </NavLink>
      ))}
    </nav>
  );
}
