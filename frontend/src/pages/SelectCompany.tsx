import React, { useState, FormEvent } from 'react';
import { useAuth, Company } from '../context/AuthContext';
import { Building2, Plus, ArrowRight, Shield, LogOut, AlertCircle } from 'lucide-react';

export default function SelectCompany() {
  const { user, companies, selectCompany, createCompany, logout } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) return;

    setError(null);
    setSubmitting(true);
    try {
      await createCompany(newCompanyName);
    } catch (err: any) {
      setError(err.message || 'Failed to create company');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px'
    }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            backgroundColor: '#e0f2fe',
            borderRadius: '10px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '12px'
          }}>
            <Building2 size={26} color="#0284c7" />
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a' }}>Select Pharmacy Company</h1>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
            Logged in as <strong style={{ color: '#0f172a' }}>{user?.username}</strong>
          </p>
        </div>

        {error && (
          <div style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            padding: '10px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Company Selection Card */}
        <div className="card" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>
              Your Companies ({companies.length})
            </span>
            <button
              onClick={() => setIsCreating(!isCreating)}
              className="btn btn-secondary btn-sm"
            >
              <Plus size={14} />
              <span>{isCreating ? 'Cancel' : 'New Company'}</span>
            </button>
          </div>

          {/* Create Company Inline Form */}
          {isCreating && (
            <form onSubmit={handleCreate} style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '14px',
              marginBottom: '16px'
            }}>
              <div className="form-group" style={{ marginBottom: '10px' }}>
                <label className="form-label" htmlFor="new-comp-name">Company / Pharmacy Name</label>
                <input
                  id="new-comp-name"
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. Apollo Pharmacy Ltd"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary btn-sm"
                >
                  {submitting ? 'Creating...' : 'Create & Enter'}
                </button>
              </div>
            </form>
          )}

          {/* Companies List */}
          {companies.length === 0 && !isCreating ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b' }}>
              <p style={{ fontSize: '13px', marginBottom: '12px' }}>
                You have not joined or created any companies yet.
              </p>
              <button
                onClick={() => setIsCreating(true)}
                className="btn btn-primary btn-sm"
              >
                <Plus size={14} /> Create Your First Company
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {companies.map((company) => (
                <div
                  key={company.id}
                  onClick={() => selectCompany(company)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#0284c7';
                    e.currentTarget.style.backgroundColor = '#f0f9ff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.backgroundColor = '#ffffff';
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>
                      {company.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                      <span className={`badge badge-${company.role}`}>
                        {company.role.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', color: '#0284c7', gap: '4px', fontSize: '12.5px', fontWeight: 600 }}>
                    <span>Select</span>
                    <ArrowRight size={14} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Logout */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={logout}
            className="btn btn-secondary btn-sm"
            style={{ color: '#64748b' }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>

      </div>
    </div>
  );
}
