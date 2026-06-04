import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import Login           from './pages/Login';
import Register        from './pages/Register';
import RecoverPassword from './pages/RecoverPassword';
import Dashboard       from './pages/Dashboard';
import Extinguishers   from './pages/Extinguishers';
import Inspections     from './pages/Inspections';
import Maintenance     from './pages/Maintenance';
import Reports         from './pages/Reports';
import Users           from './pages/Users';
import Profile         from './pages/Profile';
import MyExtinguisher  from './pages/MyExtinguisher';

const Page = ({ children, roles }) => (
  <ProtectedRoute roles={roles}>
    <Layout>{children}</Layout>
  </ProtectedRoute>
);

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public */}
        <Route path="/login"            element={<Login />} />
        <Route path="/register"         element={<Register />} />
        <Route path="/recover-password" element={<RecoverPassword />} />

        {/* All roles */}
        <Route path="/dashboard"      element={<Page><Dashboard /></Page>} />
        <Route path="/inspections"    element={<Page><Inspections /></Page>} />
        <Route path="/reports"        element={<Page><Reports /></Page>} />
        <Route path="/profile"        element={<Page><Profile /></Page>} />

        {/* User only */}
        <Route path="/my-extinguisher" element={<Page roles={['user']}><MyExtinguisher /></Page>} />

        {/* Admin + Inspector */}
        <Route path="/extinguishers"  element={<Page roles={['admin','inspector']}><Extinguishers /></Page>} />
        <Route path="/maintenance"    element={<Page roles={['admin','inspector']}><Maintenance /></Page>} />

        {/* Admin only */}
        <Route path="/users"          element={<Page roles={['admin']}><Users /></Page>} />

        <Route path="/"  element={<Navigate to="/dashboard" replace />} />
        <Route path="*"  element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
