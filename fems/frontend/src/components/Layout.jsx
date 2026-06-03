import { useState } from 'react';
import Sidebar from './Sidebar';

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — always visible on lg, drawer on mobile */}
      <div className={`fixed inset-y-0 left-0 z-30 lg:static lg:z-auto transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-crimson-700 text-white">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded hover:bg-white/10 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-semibold text-sm">TZW LTD – FEMS</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-cream-100 p-5 lg:p-7">
          {children}
        </main>
      </div>
    </div>
  );
}
