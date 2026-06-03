import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: { fontSize: '0.875rem', borderRadius: '10px', maxWidth: '380px' },
          success: { style: { borderLeft: '4px solid #DC143C' } },
          error:   { style: { borderLeft: '4px solid #dc2626' } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
