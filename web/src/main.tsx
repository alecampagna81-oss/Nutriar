import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import { AuthProvider, useAuth } from './lib/auth';
import { ErrorBox, Loading, ToastProvider } from './components/ui';
import { AcceptInvitation, Forgot, Login, RegisterPro, Reset } from './pages/public/Auth';
import { ProLayout } from './pages/pro/Layout';
import { Dashboard } from './pages/pro/Dashboard';
import { PatientsList } from './pages/pro/Patients';
import { PatientDetail } from './pages/pro/PatientDetail';
import { PlanEditor } from './pages/pro/PlanEditor';
import { Agenda } from './pages/pro/Agenda';
import { Inbox } from './pages/pro/Inbox';
import { Foods } from './pages/pro/Foods';
import { Templates } from './pages/pro/Templates';
import { Settings } from './pages/pro/Settings';
import { PatientLayout } from './pages/patient/Layout';
import { Home } from './pages/patient/Home';
import { PlanView } from './pages/patient/Plan';
import { Shopping } from './pages/patient/Shopping';
import { LogPage } from './pages/patient/Log';
import { Progress } from './pages/patient/Progress';
import { PatientMessages } from './pages/patient/Messages';
import { Appointments } from './pages/patient/Appointments';
import { Questionnaire } from './pages/patient/Questionnaire';
import { Profile } from './pages/patient/Profile';

function Root() {
  const { me, loading, error, refresh } = useAuth();
  if (loading) return <Loading />;
  if (error)
    return (
      <main className="auth-page">
        <div className="auth-card"><ErrorBox error={error} onRetry={refresh} /></div>
      </main>
    );
  return (
    <Routes>
      <Route path="/ingresar" element={me ? <Navigate to={me.role === 'professional' ? '/pro' : '/app'} replace /> : <Login />} />
      <Route path="/registro" element={<RegisterPro />} />
      <Route path="/invitacion/:token" element={<AcceptInvitation />} />
      <Route path="/recuperar" element={<Forgot />} />
      <Route path="/restablecer/:token" element={<Reset />} />
      <Route path="/pro" element={me?.role === 'professional' ? <ProLayout /> : <Navigate to="/ingresar" replace />}>
        <Route index element={<Dashboard />} />
        <Route path="pacientes" element={<PatientsList />} />
        <Route path="pacientes/:id/:tab?" element={<PatientDetail />} />
        <Route path="planes/:planId" element={<PlanEditor />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="mensajes" element={<Inbox />} />
        <Route path="alimentos" element={<Foods />} />
        <Route path="plantillas" element={<Templates />} />
        <Route path="configuracion" element={<Settings />} />
      </Route>
      <Route path="/app" element={me?.role === 'patient' ? <PatientLayout /> : <Navigate to="/ingresar" replace />}>
        <Route index element={<Home />} />
        <Route path="plan" element={<PlanView />} />
        <Route path="compras" element={<Shopping />} />
        <Route path="registrar" element={<LogPage />} />
        <Route path="avances" element={<Progress />} />
        <Route path="mensajes" element={<PatientMessages />} />
        <Route path="turnos" element={<Appointments />} />
        <Route path="cuestionario" element={<Questionnaire />} />
        <Route path="perfil" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to={me ? (me.role === 'professional' ? '/pro' : '/app') : '/ingresar'} replace />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Root />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
