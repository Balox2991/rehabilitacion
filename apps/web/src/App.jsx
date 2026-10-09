import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import { Loading } from "./components/PageState.jsx";
import Login from "./pages/Login.jsx";
import Enter from "./pages/Enter.jsx";
import TherapistLayout from "./pages/therapist/TherapistLayout.jsx";
import PatientLayout from "./pages/patient/PatientLayout.jsx";

// Las pantallas con gráficas, cámara o mucho contenido se cargan bajo demanda:
// la portada no descarga Recharts ni el motor de tracking.
const lazyPage = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] ?? m.default })));

const Overview = lazyPage(() => import("./pages/therapist/Overview.jsx"));
const Patients = lazyPage(() => import("./pages/therapist/Patients.jsx"));
const PatientDetail = lazyPage(() => import("./pages/therapist/PatientDetail.jsx"));
const PlanTab = lazyPage(() => import("./pages/therapist/PlanTab.jsx"));
const SummaryTab = lazyPage(() => import("./pages/therapist/PatientTabs.jsx"), "SummaryTab");
const SessionsTab = lazyPage(() => import("./pages/therapist/PatientTabs.jsx"), "SessionsTab");
const NotesTab = lazyPage(() => import("./pages/therapist/PatientTabs.jsx"), "NotesTab");
const ReportTab = lazyPage(() => import("./pages/therapist/ReportTab.jsx"));
const TherapistLibrary = lazyPage(() => import("./pages/therapist/TherapistLibrary.jsx"));
const TherapistLibraryItem = lazyPage(() => import("./pages/therapist/TherapistLibrary.jsx"), "TherapistLibraryItem");
const TherapistRoutine = lazyPage(() => import("./pages/therapist/TherapistLibrary.jsx"), "TherapistRoutine");
const Evidence = lazyPage(() => import("./pages/therapist/Evidence.jsx"));
const PatientDataTab = lazyPage(() => import("./pages/therapist/PatientDataTab.jsx"));
const Settings = lazyPage(() => import("./pages/therapist/Settings.jsx"));

const Home = lazyPage(() => import("./pages/patient/Home.jsx"));
const Progress = lazyPage(() => import("./pages/patient/Progress.jsx"));
const Routines = lazyPage(() => import("./pages/patient/Routines.jsx"), "Routines");
const RoutineDetail = lazyPage(() => import("./pages/patient/Routines.jsx"), "RoutineDetail");
const Library = lazyPage(() => import("./pages/patient/Library.jsx"), "Library");
const LibraryItem = lazyPage(() => import("./pages/patient/Library.jsx"), "LibraryItem");
const ExerciseFlow = lazyPage(() => import("./pages/patient/ExerciseFlow.jsx"));

export default function App() {
  return (
    <Suspense fallback={<Loading rows={2} />}>
      <Routes>
        <Route index element={<Login />} />
        <Route path="entrar" element={<Navigate to="/" replace />} />

        <Route element={<AppShell />}>
          <Route path="demo" element={<Enter />} />

          <Route path="fisio/:tid" element={<TherapistLayout />}>
            <Route index element={<Overview />} />
            <Route path="pacientes" element={<Patients />} />
            <Route path="paciente/:pid" element={<PatientDetail />}>
              <Route index element={<SummaryTab />} />
              <Route path="plan" element={<PlanTab />} />
              <Route path="sesiones" element={<SessionsTab />} />
              <Route path="notas" element={<NotesTab />} />
              <Route path="informe" element={<ReportTab />} />
              <Route path="datos" element={<PatientDataTab />} />
            </Route>
            <Route path="biblioteca" element={<TherapistLibrary />} />
            <Route path="biblioteca/rutinas/:code" element={<TherapistRoutine />} />
            <Route path="biblioteca/:code" element={<TherapistLibraryItem />} />
            <Route path="evidencia" element={<Evidence />} />
            <Route path="configuracion" element={<Settings />} />
          </Route>

          <Route path="paciente/:pid" element={<PatientLayout />}>
            <Route index element={<Home />} />
            <Route path="progreso" element={<Progress />} />
            <Route path="rutinas" element={<Routines />} />
            <Route path="rutinas/:code" element={<RoutineDetail />} />
            <Route path="aprender" element={<Library />} />
            <Route path="aprender/:code" element={<LibraryItem />} />
          </Route>
          <Route path="paciente/:pid/ejercicio/:planId" element={<ExerciseFlow />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
