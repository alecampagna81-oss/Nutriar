import { useAuth } from '../../lib/auth';
import { Alert } from '../../components/ui';
import { Chat } from '../../components/Chat';

export function PatientMessages() {
  const { me } = useAuth();
  return (
    <>
      <h1>Mensajes</h1>
      <Alert tone="warn">
        <span>
          <strong>No es un canal de urgencias.</strong> Ante una urgencia llamá al 107 (SAME) o acudí a la guardia más cercana.
          {me?.response_hours ? <><br />Horario de respuesta de {me.professional_name}: {me.response_hours}</> : null}
        </span>
      </Alert>
      <div className="card">
        <Chat url="/api/me/messages" extract={(d) => d.messages} emptyText="Escribile a tu nutricionista. Solo ella o él puede leer esta conversación." />
      </div>
    </>
  );
}
