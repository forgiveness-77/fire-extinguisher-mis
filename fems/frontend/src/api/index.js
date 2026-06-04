import client from './client';

// ── AUTH / USERS ──────────────────────────────────────────────────────────────
export const register        = (data)     => client.post('/users/register', data);
export const login           = (data)     => client.post('/users/login', data);
export const getProfile      = ()         => client.get('/users/profile');
export const updateProfile   = (data)     => client.put('/users/profile', data);
export const changePassword  = (data)     => client.put('/users/change-password', data);
export const recoverPassword = (data)     => client.post('/users/recover-password', data);
export const resetPassword   = (data)     => client.post('/users/reset-password', data);

export const getUsers        = (params)   => client.get('/users', { params });
export const getUser         = (id)       => client.get(`/users/${id}`);
export const updateUser      = (id, data) => client.put(`/users/${id}`, data);
export const deleteUser      = (id)       => client.delete(`/users/${id}`);
export const getPendingInspectors = (params) => client.get('/users/pending', { params });
export const approveInspector = (id)     => client.post(`/users/${id}/approve`);
export const rejectInspector  = (id, data) => client.post(`/users/${id}/reject`, data);

// ── EXTINGUISHERS ─────────────────────────────────────────────────────────────
export const getExtinguishers   = (params)    => client.get('/extinguishers', { params });
export const getExtinguisher    = (id)        => client.get(`/extinguishers/${id}`);
export const createExtinguisher = (data)      => client.post('/extinguishers', data);
export const updateExtinguisher = (id, data)  => client.put(`/extinguishers/${id}`, data);
export const deleteExtinguisher = (id)        => client.delete(`/extinguishers/${id}`);
export const assignExtinguisher  = (id, data) => client.post(`/extinguishers/${id}/assign`, data);
export const unassignExtinguisher = (id)      => client.delete(`/extinguishers/${id}/unassign`);

// ── INSPECTIONS ───────────────────────────────────────────────────────────────
export const getInspections   = (params)    => client.get('/inspections', { params });
export const getInspection    = (id)        => client.get(`/inspections/${id}`);
export const createInspection = (data)      => client.post('/inspections', data);
export const updateInspection = (id, data)  => client.put(`/inspections/${id}`, data);
export const deleteInspection = (id)        => client.delete(`/inspections/${id}`);

// ── MAINTENANCE ───────────────────────────────────────────────────────────────
export const getMaintenanceLogs    = (params)    => client.get('/maintenance', { params });
export const getMaintenanceLog     = (id)        => client.get(`/maintenance/${id}`);
export const createMaintenanceLog  = (data)      => client.post('/maintenance', data);
export const updateMaintenanceLog  = (id, data)  => client.put(`/maintenance/${id}`, data);
export const deleteMaintenanceLog  = (id)        => client.delete(`/maintenance/${id}`);

// ── REPORTS ───────────────────────────────────────────────────────────────────
export const getReportSummary      = ()       => client.get('/reports/summary');
export const getExtinguisherReport = (params) => client.get('/reports/extinguishers', { params });
export const getInspectionReport   = (params) => client.get('/reports/inspections', { params });
export const getExpiredReport      = (params) => client.get('/reports/expired', { params });
export const getMaintenanceHistory = (params) => client.get('/reports/maintenance-history', { params });
export const exportPDF = (type) => client.get(`/reports/export/pdf?type=${type}`, { responseType: 'blob' });
export const exportCSV = (type) => client.get(`/reports/export/csv?type=${type}`, { responseType: 'blob' });

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
export const getNotifications    = (params) => client.get('/notifications', { params });
export const getUnreadCount      = ()       => client.get('/notifications/unread-count');
export const markNotifRead       = (id)     => client.patch(`/notifications/${id}/read`);
export const markAllRead         = ()       => client.patch('/notifications/read-all');
export const deleteNotification  = (id)    => client.delete(`/notifications/${id}`);
