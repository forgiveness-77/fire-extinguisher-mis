import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import Login          from './pages/Login';
import Register       from './pages/Register';
import RecoverPassword from './pages/RecoverPassword';
import Dashboard      from './pages/Dashboard';
import Extinguishers  from './pages/Extinguishers';
import Inspections    from './pages/Inspections';
import Maintenance    from './pages/Maintenance';
import Reports        from './pages/Reports';
import Users          from './pages/Users';
import Profile        from './pages/Profile';

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login"            element={<Login />} />
      <Route path="/register"         element={<Register />} />
      <Route path="/recover-password" element={<RecoverPassword />} />

      {/* Protected — wrapped in Layout */}
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Layout><Dashboard /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/extinguishers" element={
        <ProtectedRoute>
          <Layout><Extinguishers /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/inspections" element={
        <ProtectedRoute>
          <Layout><Inspections /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/maintenance" element={
        <ProtectedRoute roles={['admin', 'inspector']}>
          <Layout><Maintenance /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/reports" element={
        <ProtectedRoute>
          <Layout><Reports /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/users" element={
        <ProtectedRoute roles={['admin']}>
          <Layout><Users /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/profile" element={
        <ProtectedRoute>
          <Layout><Profile /></Layout>
        </ProtectedRoute>
      } />

      {/* Fallback */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
