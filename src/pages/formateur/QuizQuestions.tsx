import { Link, useParams } from 'react-router-dom';
import AppLayout from '../../components/AppLayout';

export default function QuizQuestions() {
  const { id } = useParams();
  return (
    <AppLayout>
      <Link to={`/formateur/qcm/${id}`} className="text-sm text-muted underline mb-3 inline-block">
        ← Paramètres du QCM
      </Link>
      <h1 className="text-lg font-semibold mb-1">Questions</h1>
      <p className="text-sm text-muted">Cet écran sera complété à la prochaine étape.</p>
    </AppLayout>
  );
}
