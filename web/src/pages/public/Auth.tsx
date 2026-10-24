import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorText } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Alert, Button, Field, FormError, Input, Loading } from '../../components/ui';

function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  const { appName } = useAuth();
  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/icon.svg" alt="" />
          {appName}
        </div>
        <div className="card">
          <h1 style={{ fontSize: '1.3rem' }}>{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}

function goHome(role: string, nav: ReturnType<typeof useNavigate>) {
  nav(role === 'professional' ? '/pro' : '/app', { replace: true });
}

export function Login() {
  const { refresh, demoMode } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const { signupEnabled } = useAuth();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post('/api/auth/login', { email, password });
      await refresh();
      goHome(r.user.role, nav);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout title="Ingresar">
      <form onSubmit={submit} noValidate>
        <FormError error={error} />
        <Field label="Correo electrónico">{(id) => <Input id={id} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}</Field>
        <Field label="Contraseña">{(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}</Field>
        <Button type="submit" busy={busy} className="w-full" style={{ width: '100%' }}>
          Ingresar
        </Button>
      </form>
      <hr className="divider" />
      <div className="stack small">
        <Link to="/recuperar">Olvidé mi contraseña</Link>
        <span className="muted">¿Sos paciente? Ingresá con el enlace de invitación que te envió tu nutricionista.</span>
        {signupEnabled ? <Link to="/registro">Soy nutricionista y quiero crear una cuenta</Link> : null}
      </div>
      {demoMode ? (
        <div className="demo-box alert alert-warn">
          <div>
            <strong>Entorno de demostración</strong> — datos ficticios.
            <br />
            Profesional: nutri@demo.nutriar.local
            <br />
            Paciente: paciente@demo.nutriar.local
            <br />
            Contraseña: Demo-NutriAR-2026
          </div>
        </div>
      ) : null}
    </AuthLayout>
  );
}

export function RegisterPro() {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '', license_number: '' });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/register-professional', f);
      await refresh();
      nav('/pro', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout title="Crear cuenta profesional">
      <form onSubmit={submit} noValidate>
        <FormError error={error} />
        <Field label="Nombre y apellido" required>{(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
        <Field label="Matrícula" hint="Opcional">{(id) => <Input id={id} value={f.license_number} onChange={(e) => setF({ ...f, license_number: e.target.value })} />}</Field>
        <Field label="Correo electrónico" required>{(id) => <Input id={id} type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
        <Field label="Contraseña" hint="Mínimo 10 caracteres" required>{(id) => <Input id={id} type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />}</Field>
        <Button type="submit" busy={busy} style={{ width: '100%' }}>Crear cuenta</Button>
      </form>
      <p className="small" style={{ marginTop: '1rem' }}>
        <Link to="/ingresar">Ya tengo cuenta</Link>
      </p>
    </AuthLayout>
  );
}

export function AcceptInvitation() {
  const { token = '' } = useParams();
  const { refresh, appName } = useAuth();
  const nav = useNavigate();
  const [info, setInfo] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [f, setF] = useState({ email: '', password: '', password2: '', accept: false });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .get(`/api/auth/invitation/${encodeURIComponent(token)}`)
      .then((r) => {
        setInfo(r);
        setF((x) => ({ ...x, email: r.email ?? '' }));
      })
      .catch((e) => setLoadError(errorText(e)));
  }, [token]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (f.password !== f.password2) return setError('Las contraseñas no coinciden');
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/accept-invitation', { token, email: f.email, password: f.password, accept_terms: f.accept || undefined });
      await refresh();
      nav('/app', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  if (loadError)
    return (
      <AuthLayout title="Invitación">
        <Alert tone="danger">{loadError}</Alert>
        <Link to="/ingresar">Ir a ingresar</Link>
      </AuthLayout>
    );
  if (!info) return <AuthLayout title="Invitación"><Loading /></AuthLayout>;
  return (
    <AuthLayout title={`Hola, ${info.first_name}`}>
      <p>
        <strong>{info.professional_name}</strong> te invitó a {appName}. Creá tu acceso para ver tu plan, registrar tus comidas y escribirle.
      </p>
      <form onSubmit={submit} noValidate>
        <FormError error={error} />
        <Field label="Tu correo electrónico" required>{(id) => <Input id={id} type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
        <Field label="Elegí una contraseña" hint="Mínimo 10 caracteres" required>{(id) => <Input id={id} type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />}</Field>
        <Field label="Repetí la contraseña" required>{(id) => <Input id={id} type="password" autoComplete="new-password" value={f.password2} onChange={(e) => setF({ ...f, password2: e.target.value })} />}</Field>
        <div className="toggle-row">
          <input id="acc" type="checkbox" checked={f.accept} onChange={(e) => setF({ ...f, accept: e.target.checked })} />
          <label htmlFor="acc" className="small">
            Entiendo que mis datos de salud, registros y fotos serán visibles solo para mí y para mi nutricionista, y que la mensajería no es un canal de urgencias.
          </label>
        </div>
        <Button type="submit" busy={busy} style={{ width: '100%', marginTop: '0.6rem' }}>
          Crear mi acceso
        </Button>
      </form>
    </AuthLayout>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setResult(await api.post('/api/auth/forgot', { email }));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout title="Recuperar el acceso">
      {result ? (
        result.emailConfigured ? (
          <Alert tone="ok">Si el correo está registrado, vas a recibir un enlace para elegir una nueva contraseña. Revisá también la carpeta de correo no deseado.</Alert>
        ) : (
          <Alert tone="warn">
            Este servidor todavía no tiene configurado el envío de correos, por lo que no se envió ningún mensaje. Si sos paciente, pedile a tu nutricionista un enlace para restablecer tu contraseña.
          </Alert>
        )
      ) : (
        <form onSubmit={submit} noValidate>
          <FormError error={error} />
          <Field label="Correo electrónico">{(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <Button type="submit" busy={busy} style={{ width: '100%' }}>Enviar enlace</Button>
        </form>
      )}
      <p className="small" style={{ marginTop: '1rem' }}>
        <Link to="/ingresar">Volver a ingresar</Link>
      </p>
    </AuthLayout>
  );
}

export function Reset() {
  const { token = '' } = useParams();
  const [p, setP] = useState({ a: '', b: '' });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (p.a !== p.b) return setError('Las contraseñas no coinciden');
    setBusy(true);
    try {
      await api.post('/api/auth/reset', { token, password: p.a });
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout title="Nueva contraseña">
      {done ? (
        <>
          <Alert tone="ok">Listo. Ya podés ingresar con tu nueva contraseña.</Alert>
          <Link to="/ingresar" className="btn btn-primary">Ingresar</Link>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <FormError error={error} />
          <Field label="Nueva contraseña" hint="Mínimo 10 caracteres">{(id) => <Input id={id} type="password" autoComplete="new-password" value={p.a} onChange={(e) => setP({ ...p, a: e.target.value })} />}</Field>
          <Field label="Repetila">{(id) => <Input id={id} type="password" autoComplete="new-password" value={p.b} onChange={(e) => setP({ ...p, b: e.target.value })} />}</Field>
          <Button type="submit" busy={busy} style={{ width: '100%' }}>Guardar</Button>
        </form>
      )}
    </AuthLayout>
  );
}
