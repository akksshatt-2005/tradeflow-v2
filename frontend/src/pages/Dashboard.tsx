import React, { useState } from 'react';
import { useAuth, Company } from '../context/AuthContext';
import { 
  Building2, 
  LayoutDashboard, 
  Receipt, 
  Package, 
  Boxes, 
  BarChart3, 
  Users, 
  ChevronDown, 
  LogOut, 
  Plus, 
  ShieldCheck, 
  CheckCircle2, 
  Clock 
} from 'lucide-react';

export default function Dashboard({ onSwitchCompany }: { onSwitchCompany: () => void }) {
  const { user, activeCompany, companies, selectCompany, logout } = useAuth();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'invoices', label: 'Invoices & Sales', icon: Receipt },
    { id: 'items', label: 'Items & Products', icon: Package },
    { id: 'stock', label: 'Stock & Batches', icon: Boxes },
    { id: 'reports', label: 'Trade Reports', icon: BarChart3 },
  ];

  return (
    <div className="app-layout">
      
      {/* Left Sidebar (Rule C5) */}
      <aside className="sidebar">
        {/* Brand Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            backgroundColor: '#0284c7',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Building2 size={18} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px', color: '#ffffff', letterSpacing: '-0.01em' }}>
              Trade Flow v2
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              Multi-Company Billing
            </div>
          </div>
        </div>

        {/* Current Active Company Indicator */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b', backgroundColor: '#090d16' }}>
          <div style={{ fontSize: '10.5px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600, letterSpacing: '0.04em' }}>
            Active Company
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeCompany?.name}
            </span>
            <span className={`badge badge-${activeCompany?.role}`} style={{ fontSize: '10px' }}>
              {activeCompany?.role.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav style={{ padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: isActive ? '#1e293b' : 'transparent',
                  color: isActive ? '#38bdf8' : '#94a3b8',
                  fontSize: '12.5px',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = '#1e293b';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Info & Footer */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>
              {user?.username}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              {companies.length} company access
            </div>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content Layout */}
      <div className="main-wrapper">
        
        {/* Top Navbar */}
        <header className="top-navbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            
            {/* Company Switcher Dropdown (Phase 0 Task 5) */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setSwitcherOpen(!switcherOpen)}
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
              >
                <Building2 size={14} color="#0284c7" />
                <span>{activeCompany?.name}</span>
                <ChevronDown size={14} />
              </button>

              {switcherOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '6px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                  width: '260px',
                  zIndex: 100,
                  overflow: 'hidden'
                }}>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                    Switch Company
                  </div>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {companies.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          selectCompany(c);
                          setSwitcherOpen(false);
                        }}
                        style={{
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          backgroundColor: c.id === activeCompany?.id ? '#f0f9ff' : '#ffffff',
                          borderBottom: '1px solid #f1f5f9'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = c.id === activeCompany?.id ? '#f0f9ff' : '#ffffff'}
                      >
                        <span style={{ fontSize: '12.5px', fontWeight: c.id === activeCompany?.id ? 600 : 400, color: '#0f172a' }}>
                          {c.name}
                        </span>
                        <span className={`badge badge-${c.role}`} style={{ fontSize: '10px' }}>
                          {c.role}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '8px 12px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                    <button
                      onClick={() => {
                        setSwitcherOpen(false);
                        onSwitchCompany();
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', fontSize: '11.5px' }}
                    >
                      <Plus size={13} /> Manage / Add Company
                    </button>
                  </div>
                </div>
              )}
            </div>

            <span className={`badge badge-${activeCompany?.role}`}>
              {activeCompany?.role.toUpperCase()}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              User: <strong style={{ color: '#0f172a' }}>{user?.username}</strong>
            </span>
          </div>
        </header>

        {/* Page Content */}
        <main className="page-content">
          
          {/* Phase 0 Foundation Overview Banner */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} color="#16a34a" />
                <span>Phase 0: Multi-Company Foundation Active</span>
              </div>
            </div>
            
            <p style={{ color: '#475569', fontSize: '13px', lineHeight: 1.5, marginBottom: '16px' }}>
              Trade Flow v2 has been initialized with database-backed authentication, strict rate limiting, 15-minute access JWTs, and complete company scoping. All incoming operations are isolated to <strong>{activeCompany?.name}</strong>.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <div style={{ padding: '12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Active Scope</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>{activeCompany?.name}</div>
              </div>

              <div style={{ padding: '12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Your Role</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0284c7', marginTop: '2px' }}>{activeCompany?.role.toUpperCase()}</div>
              </div>

              <div style={{ padding: '12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Token Lifetime</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#16a34a', marginTop: '2px' }}>15 Min (Auto-Refresh)</div>
              </div>
            </div>
          </div>

          {/* Company Members & Access Table */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Authorized Companies ({companies.length})</div>
              <button onClick={onSwitchCompany} className="btn btn-secondary btn-sm">
                <Plus size={13} /> Add Company
              </button>
            </div>

            <div className="table-responsive">
              <table className="dense-table">
                <thead>
                  <tr>
                    <th>Company Name</th>
                    <th>Your Assigned Role</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((comp) => (
                    <tr key={comp.id}>
                      <td style={{ fontWeight: comp.id === activeCompany?.id ? 700 : 500 }}>
                        {comp.name} {comp.id === activeCompany?.id && '(Current)'}
                      </td>
                      <td>
                        <span className={`badge badge-${comp.role}`}>
                          {comp.role.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-accountant">ACTIVE</span>
                      </td>
                      <td>
                        {comp.id !== activeCompany?.id ? (
                          <button
                            onClick={() => selectCompany(comp)}
                            className="btn btn-secondary btn-sm"
                          >
                            Switch to this
                          </button>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>Active</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
