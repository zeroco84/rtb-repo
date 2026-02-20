'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================
// MAIN APP COMPONENT
// ============================================
export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [toast, setToast] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);

  // Load stats and check admin status on mount
  useEffect(() => {
    fetchStats();
    checkAdmin();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const checkAdmin = async () => {
    try {
      const res = await fetch('/api/admin/login');
      const data = await res.json();
      setIsAdmin(data.authenticated);
    } catch (err) {
      setIsAdmin(false);
    }
    setAdminChecked(true);
  };

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleLogin = () => {
    setIsAdmin(true);
    showToast('Admin access granted', 'success');
  };

  const handleLogout = async () => {
    await fetch('/api/admin/login', { method: 'DELETE' });
    setIsAdmin(false);
    setActiveTab('dashboard');
    showToast('Logged out', 'info');
  };

  return (
    <>
      {/* Navigation */}
      <nav className="nav-container">
        <div className="nav-inner">
          <div className="nav-brand">
            <div className="nav-brand-icon">⚖️</div>
            <div>
              <div className="nav-brand-text">RTB Disputes</div>
              <div className="nav-brand-sub">Public Database</div>
            </div>
          </div>

          <div className="nav-tabs">
            <button
              className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <span className="nav-tab-icon">📊</span>
              Dashboard
            </button>
            <button
              className={`nav-tab ${activeTab === 'disputes' ? 'active' : ''}`}
              onClick={() => setActiveTab('disputes')}
            >
              <span className="nav-tab-icon">📋</span>
              Disputes
            </button>
            <button
              className={`nav-tab ${activeTab === 'league' ? 'active' : ''}`}
              onClick={() => setActiveTab('league')}
            >
              <span className="nav-tab-icon">🏆</span>
              League Table
            </button>
            <button
              className={`nav-tab ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => setActiveTab('admin')}
            >
              <span className="nav-tab-icon">{isAdmin ? '⚙️' : '🔒'}</span>
              Admin
            </button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="page-container">
        {activeTab === 'dashboard' && (
          <DashboardView stats={stats} onRefresh={fetchStats} />
        )}
        {activeTab === 'disputes' && (
          <DisputesView showToast={showToast} />
        )}
        {activeTab === 'league' && (
          <LeagueTableView showToast={showToast} />
        )}
        {activeTab === 'admin' && (
          <AdminGate
            isAdmin={isAdmin}
            adminChecked={adminChecked}
            onLogin={handleLogin}
            onLogout={handleLogout}
            showToast={showToast}
            onSyncComplete={fetchStats}
          />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
    </>
  );
}

// ============================================
// DASHBOARD VIEW
// ============================================
function DashboardView({ stats, onRefresh }) {
  if (!stats) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <div className="loading-text">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          Overview of the RTB dispute database
        </p>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="glass-card stat-card">
          <div className="stat-label">Total Disputes</div>
          <div className="stat-value blue">{(stats.total_disputes || 0).toLocaleString()}</div>
          <div className="stat-change">All scraped records</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-label">Parties Tracked</div>
          <div className="stat-value green">{(stats.total_parties || 0).toLocaleString()}</div>
          <div className="stat-change">Unique individuals/entities</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-label">Repeat Offenders</div>
          <div className="stat-value amber">{(stats.repeat_offenders || 0).toLocaleString()}</div>
          <div className="stat-change">3+ disputes</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-label">AI Processed</div>
          <div className="stat-value purple">{(stats.ai_processed || 0).toLocaleString()}</div>
          <div className="stat-change">Enhanced records</div>
        </div>
      </div>

      {/* Two column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)' }}>
        {/* Top Landlords */}
        <div className="glass-card-static">
          <div className="section-header">
            <div className="section-title">
              <span className="section-title-icon">🏠</span>
              Top Landlords
            </div>
            <span className="badge badge-red">by disputes</span>
          </div>
          {stats.top_landlords && stats.top_landlords.length > 0 ? (
            stats.top_landlords.map((p, i) => (
              <div key={p.id} className="party-dispute-row">
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 700, color: '#f87171', flexShrink: 0
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    {p.total_disputes} dispute{p.total_disputes !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state" style={{ padding: '24px' }}>
              <div className="empty-state-text">No data yet. Run a sync to populate.</div>
            </div>
          )}
        </div>

        {/* Top Tenants */}
        <div className="glass-card-static">
          <div className="section-header">
            <div className="section-title">
              <span className="section-title-icon">👤</span>
              Top Tenants
            </div>
            <span className="badge badge-amber">by disputes</span>
          </div>
          {stats.top_tenants && stats.top_tenants.length > 0 ? (
            stats.top_tenants.map((p, i) => (
              <div key={p.id} className="party-dispute-row">
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 700, color: '#fbbf24', flexShrink: 0
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    {p.total_disputes} dispute{p.total_disputes !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state" style={{ padding: '24px' }}>
              <div className="empty-state-text">No data yet. Run a sync to populate.</div>
            </div>
          )}
        </div>
      </div>

      {/* Last Sync Info */}
      {stats.latest_job && (
        <div className="glass-card-static" style={{ marginTop: 'var(--spacing-md)', padding: 'var(--spacing-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>
                Last Data Sync
              </div>
              <div style={{ fontSize: '14px', color: 'var(--text-primary)', marginTop: '4px' }}>
                {new Date(stats.latest_job.completed_at || stats.latest_job.created_at).toLocaleString()}
              </div>
            </div>
            <span className={`badge ${stats.latest_job.status === 'completed' ? 'badge-green' : stats.latest_job.status === 'running' ? 'badge-blue' : 'badge-red'}`}>
              {stats.latest_job.status}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================
// DISPUTES VIEW
// ============================================
function DisputesView({ showToast }) {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState('dispute_date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedDispute, setSelectedDispute] = useState(null);
  const searchTimeout = useRef(null);

  const fetchDisputes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '25',
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      if (search) params.set('search', search);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

      const res = await fetch(`/api/disputes?${params}`);
      const data = await res.json();

      setDisputes(data.disputes || []);
      setTotalPages(data.total_pages || 0);
      setTotal(data.total || 0);
    } catch (err) {
      showToast('Failed to fetch disputes', 'error');
    }
    setLoading(false);
  }, [page, search, dateFrom, dateTo, sortBy, sortOrder, showToast]);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  const handleSearch = (value) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 400);
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const SortIcon = ({ field }) => {
    if (sortBy !== field) return <span style={{ opacity: 0.3 }}>↕</span>;
    return <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Disputes</h1>
        <p className="page-subtitle">
          Search through {total.toLocaleString()} dispute records
        </p>
      </div>

      {/* Search */}
      <div className="search-container">
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search by name, address, DR number, TR number..."
            onChange={(e) => handleSearch(e.target.value)}
            id="dispute-search-input"
          />
        </div>
        <div className="search-filters">
          <input
            type="date"
            className="date-input"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            placeholder="From date"
            id="date-from-input"
          />
          <input
            type="date"
            className="date-input"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            placeholder="To date"
            id="date-to-input"
          />
          {(search || dateFrom || dateTo) && (
            <button
              className="filter-chip"
              onClick={() => {
                setSearch('');
                setDateFrom('');
                setDateTo('');
                setPage(1);
                const input = document.getElementById('dispute-search-input');
                if (input) input.value = '';
              }}
            >
              ✕ Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="glass-card-static table-container">
        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <div className="loading-text">Loading disputes...</div>
          </div>
        ) : disputes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-title">No disputes found</div>
            <div className="empty-state-text">
              {search ? 'Try adjusting your search terms' : 'Run a data sync to populate the database'}
            </div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className={sortBy === 'dispute_date' ? 'active' : ''} onClick={() => handleSort('dispute_date')}>
                  Date <SortIcon field="dispute_date" />
                </th>
                <th>Parties</th>
                <th className={sortBy === 'dr_no' ? 'active' : ''} onClick={() => handleSort('dr_no')}>
                  DR No. <SortIcon field="dr_no" />
                </th>
                <th>Type</th>
                <th>PDFs</th>
                <th>AI</th>
              </tr>
            </thead>
            <tbody>
              {disputes.map((d) => (
                <tr key={d.id} onClick={() => setSelectedDispute(d)}>
                  <td className="mono">
                    {d.dispute_date ? new Date(d.dispute_date).toLocaleDateString('en-IE') : '—'}
                  </td>
                  <td>
                    <div style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.4, maxWidth: '400px' }}>
                      {d.applicant_name && (
                        <div>
                          <span className="badge badge-blue" style={{ marginRight: 6 }}>{d.applicant_role || 'Applicant'}</span>
                          {d.applicant_name}
                        </div>
                      )}
                      {d.respondent_name && (
                        <div style={{ marginTop: 4 }}>
                          <span className="badge badge-amber" style={{ marginRight: 6 }}>{d.respondent_role || 'Respondent'}</span>
                          {d.respondent_name}
                        </div>
                      )}
                      {!d.applicant_name && !d.respondent_name && (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>{d.heading}</span>
                      )}
                    </div>
                  </td>
                  <td className="mono">{d.dr_no || '—'}</td>
                  <td className="muted">{d.dispute_type || '—'}</td>
                  <td>
                    {d.pdf_urls && d.pdf_urls.length > 0 && (
                      <span className="badge badge-glass">📄 {d.pdf_urls.length}</span>
                    )}
                  </td>
                  <td>
                    {d.ai_processed ? (
                      <span className="badge badge-purple">✨</span>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination-btn"
            onClick={() => setPage(1)}
            disabled={page === 1}
          >
            «
          </button>
          <button
            className="pagination-btn"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ‹
          </button>
          <span className="pagination-info">
            Page {page} of {totalPages} ({total.toLocaleString()} results)
          </span>
          <button
            className="pagination-btn"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            ›
          </button>
          <button
            className="pagination-btn"
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages}
          >
            »
          </button>
        </div>
      )}

      {/* Dispute Detail Modal */}
      {selectedDispute && (
        <DisputeModal
          dispute={selectedDispute}
          onClose={() => setSelectedDispute(null)}
        />
      )}
    </>
  );
}

// ============================================
// DISPUTE MODAL
// ============================================
function DisputeModal({ dispute, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-card-static modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>
              Dispute Details
            </h2>
            {dispute.dr_no && (
              <span className="badge badge-glass">{dispute.dr_no}</span>
            )}
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-field">
          <div className="modal-field-label">Heading</div>
          <div className="modal-field-value">{dispute.heading}</div>
        </div>

        {dispute.dispute_date && (
          <div className="modal-field">
            <div className="modal-field-label">Date</div>
            <div className="modal-field-value">
              {new Date(dispute.dispute_date).toLocaleDateString('en-IE', {
                year: 'numeric', month: 'long', day: 'numeric'
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {dispute.applicant_name && (
            <div className="modal-field">
              <div className="modal-field-label">Applicant ({dispute.applicant_role || 'Unknown'})</div>
              <div className="modal-field-value">{dispute.applicant_name}</div>
            </div>
          )}
          {dispute.respondent_name && (
            <div className="modal-field">
              <div className="modal-field-label">Respondent ({dispute.respondent_role || 'Unknown'})</div>
              <div className="modal-field-value">{dispute.respondent_name}</div>
            </div>
          )}
        </div>

        {dispute.tr_no && (
          <div className="modal-field">
            <div className="modal-field-label">TR Number</div>
            <div className="modal-field-value" style={{ fontFamily: "'SF Mono', monospace" }}>{dispute.tr_no}</div>
          </div>
        )}

        {dispute.property_address && (
          <div className="modal-field">
            <div className="modal-field-label">Property Address</div>
            <div className="modal-field-value">{dispute.property_address}</div>
          </div>
        )}

        {dispute.ai_summary && (
          <div className="modal-field">
            <div className="modal-field-label">AI Summary</div>
            <div className="modal-field-value" style={{ fontSize: '13px', lineHeight: 1.5 }}>
              {dispute.ai_summary}
            </div>
          </div>
        )}

        {(dispute.dispute_value || dispute.awarded_amount) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {dispute.dispute_value && (
              <div className="modal-field">
                <div className="modal-field-label">Dispute Value</div>
                <div className="modal-field-value" style={{ color: 'var(--accent-amber)' }}>
                  €{parseFloat(dispute.dispute_value).toLocaleString()}
                </div>
              </div>
            )}
            {dispute.awarded_amount && (
              <div className="modal-field">
                <div className="modal-field-label">Awarded</div>
                <div className="modal-field-value" style={{ color: 'var(--accent-green)' }}>
                  €{parseFloat(dispute.awarded_amount).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        )}

        {dispute.pdf_urls && dispute.pdf_urls.length > 0 && (
          <div className="modal-field">
            <div className="modal-field-label">Documents</div>
            <div className="pdf-links">
              {dispute.pdf_urls.map((pdf, i) => (
                <a key={i} href={pdf.url} target="_blank" rel="noopener noreferrer" className="pdf-link">
                  📄 {pdf.label}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// LEAGUE TABLE VIEW
// ============================================
function LeagueTableView({ showToast }) {
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [partyType, setPartyType] = useState('');
  const [minDisputes, setMinDisputes] = useState(2);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [selectedParty, setSelectedParty] = useState(null);
  const [partyDetail, setPartyDetail] = useState(null);
  const searchTimeout = useRef(null);

  const fetchParties = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '25',
        sort_by: 'total_disputes',
        sort_order: 'desc',
        min_disputes: minDisputes.toString(),
      });
      if (search) params.set('search', search);
      if (partyType) params.set('party_type', partyType);

      const res = await fetch(`/api/parties?${params}`);
      const data = await res.json();

      setParties(data.parties || []);
      setTotalPages(data.total_pages || 0);
      setTotal(data.total || 0);
    } catch (err) {
      showToast('Failed to fetch parties', 'error');
    }
    setLoading(false);
  }, [page, search, partyType, minDisputes, showToast]);

  useEffect(() => {
    fetchParties();
  }, [fetchParties]);

  const handleSearch = (value) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 400);
  };

  const openPartyDetail = async (party) => {
    setSelectedParty(party);
    try {
      const res = await fetch(`/api/parties/${party.id}`);
      const data = await res.json();
      setPartyDetail(data);
    } catch (err) {
      showToast('Failed to load party details', 'error');
    }
  };

  // Get top 3 for podium
  const podiumParties = parties.slice(0, 3);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">League Table</h1>
        <p className="page-subtitle">
          Repeat offenders ranked by number of disputes
        </p>
      </div>

      {/* Podium */}
      {!loading && podiumParties.length >= 3 && (
        <div className="league-podium">
          {/* Silver - 2nd place */}
          <div className="podium-item" onClick={() => openPartyDetail(podiumParties[1])}>
            <div className="podium-rank silver">2</div>
            <div className="podium-avatar silver">
              {podiumParties[1].name.charAt(0).toUpperCase()}
            </div>
            <div className="podium-name">{podiumParties[1].name}</div>
            <div className="podium-disputes">
              {podiumParties[1].total_disputes} disputes
            </div>
            <div className="podium-bar silver"></div>
          </div>

          {/* Gold - 1st place */}
          <div className="podium-item" onClick={() => openPartyDetail(podiumParties[0])}>
            <div className="podium-rank gold">1</div>
            <div className="podium-avatar gold">
              {podiumParties[0].name.charAt(0).toUpperCase()}
            </div>
            <div className="podium-name">{podiumParties[0].name}</div>
            <div className="podium-disputes">
              {podiumParties[0].total_disputes} disputes
            </div>
            <div className="podium-bar gold"></div>
          </div>

          {/* Bronze - 3rd place */}
          <div className="podium-item" onClick={() => openPartyDetail(podiumParties[2])}>
            <div className="podium-rank bronze">3</div>
            <div className="podium-avatar bronze">
              {podiumParties[2].name.charAt(0).toUpperCase()}
            </div>
            <div className="podium-name">{podiumParties[2].name}</div>
            <div className="podium-disputes">
              {podiumParties[2].total_disputes} disputes
            </div>
            <div className="podium-bar bronze"></div>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="search-container">
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search by party name..."
            onChange={(e) => handleSearch(e.target.value)}
            id="league-search-input"
          />
        </div>
        <div className="search-filters">
          <button
            className={`filter-chip ${partyType === '' ? 'active' : ''}`}
            onClick={() => { setPartyType(''); setPage(1); }}
          >
            All
          </button>
          <button
            className={`filter-chip ${partyType === 'Landlord' ? 'active' : ''}`}
            onClick={() => { setPartyType('Landlord'); setPage(1); }}
          >
            🏠 Landlords
          </button>
          <button
            className={`filter-chip ${partyType === 'Tenant' ? 'active' : ''}`}
            onClick={() => { setPartyType('Tenant'); setPage(1); }}
          >
            👤 Tenants
          </button>
          <select
            className="filter-select"
            value={minDisputes}
            onChange={(e) => { setMinDisputes(parseInt(e.target.value)); setPage(1); }}
            id="min-disputes-select"
          >
            <option value="1">1+ disputes</option>
            <option value="2">2+ disputes</option>
            <option value="3">3+ disputes</option>
            <option value="5">5+ disputes</option>
            <option value="10">10+ disputes</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card-static table-container">
        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <div className="loading-text">Loading league table...</div>
          </div>
        ) : parties.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏆</div>
            <div className="empty-state-title">No parties found</div>
            <div className="empty-state-text">
              {search ? 'Try adjusting your search' : 'Run a data sync to populate'}
            </div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>Rank</th>
                <th>Name</th>
                <th>Type</th>
                <th>Total Disputes</th>
                <th>As Applicant</th>
                <th>As Respondent</th>
              </tr>
            </thead>
            <tbody>
              {parties.map((p, i) => {
                const rank = (page - 1) * 25 + i + 1;
                return (
                  <tr key={p.id} onClick={() => openPartyDetail(p)}>
                    <td>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: rank <= 3 ?
                          rank === 1 ? 'rgba(251, 191, 36, 0.1)' :
                            rank === 2 ? 'rgba(148, 163, 184, 0.1)' :
                              'rgba(249, 115, 22, 0.1)' : 'var(--glass-bg)',
                        border: `1px solid ${rank <= 3 ?
                          rank === 1 ? 'rgba(251, 191, 36, 0.3)' :
                            rank === 2 ? 'rgba(148, 163, 184, 0.3)' :
                              'rgba(249, 115, 22, 0.3)' : 'var(--glass-border)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: 700,
                        color: rank <= 3 ?
                          rank === 1 ? '#fbbf24' :
                            rank === 2 ? '#94a3b8' :
                              '#f97316' : 'var(--text-secondary)'
                      }}>
                        {rank}
                      </div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>
                      <span className={`badge ${p.party_type === 'Landlord' ? 'badge-red' : p.party_type === 'Tenant' ? 'badge-amber' : 'badge-glass'}`}>
                        {p.party_type || 'Unknown'}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        fontSize: '18px', fontWeight: 800,
                        color: p.total_disputes >= 5 ? 'var(--accent-red)' :
                          p.total_disputes >= 3 ? 'var(--accent-amber)' : 'var(--text-primary)'
                      }}>
                        {p.total_disputes}
                      </span>
                    </td>
                    <td className="muted">{p.total_as_applicant}</td>
                    <td className="muted">{p.total_as_respondent}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button className="pagination-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
          <button className="pagination-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
          <span className="pagination-info">Page {page} of {totalPages} ({total.toLocaleString()} parties)</span>
          <button className="pagination-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
          <button className="pagination-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
        </div>
      )}

      {/* Party Detail Modal */}
      {selectedParty && (
        <PartyDetailModal
          party={selectedParty}
          detail={partyDetail}
          onClose={() => { setSelectedParty(null); setPartyDetail(null); }}
        />
      )}
    </>
  );
}

// ============================================
// PARTY DETAIL MODAL
// ============================================
function PartyDetailModal({ party, detail, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-card-static modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
              {party.name}
            </h2>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span className={`badge ${party.party_type === 'Landlord' ? 'badge-red' : 'badge-amber'}`}>
                {party.party_type || 'Unknown'}
              </span>
              <span className="badge badge-glass">
                {party.total_disputes} dispute{party.total_disputes !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          <div className="glass-card stat-card" style={{ padding: '12px' }}>
            <div className="stat-label" style={{ fontSize: '10px' }}>Total</div>
            <div className="stat-value blue" style={{ fontSize: '22px' }}>{party.total_disputes}</div>
          </div>
          <div className="glass-card stat-card" style={{ padding: '12px' }}>
            <div className="stat-label" style={{ fontSize: '10px' }}>Applicant</div>
            <div className="stat-value green" style={{ fontSize: '22px' }}>{party.total_as_applicant}</div>
          </div>
          <div className="glass-card stat-card" style={{ padding: '12px' }}>
            <div className="stat-label" style={{ fontSize: '10px' }}>Respondent</div>
            <div className="stat-value amber" style={{ fontSize: '22px' }}>{party.total_as_respondent}</div>
          </div>
        </div>

        <div className="modal-field-label" style={{ marginBottom: '12px' }}>Dispute History</div>

        {!detail ? (
          <div className="loading-container" style={{ padding: '20px' }}>
            <div className="spinner spinner-sm"></div>
            <div className="loading-text">Loading disputes...</div>
          </div>
        ) : detail.disputes && detail.disputes.length > 0 ? (
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {detail.disputes.map((d, i) => (
              <div key={i} className="party-dispute-row">
                <div className="party-dispute-date">
                  {d.dispute_date ? new Date(d.dispute_date).toLocaleDateString('en-IE') : '—'}
                </div>
                <div className="party-dispute-heading">
                  <div>{d.heading}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                    {d.dr_no && <span>DR: {d.dr_no} </span>}
                    <span className={`badge ${d.party_role === 'Applicant' ? 'badge-blue' : 'badge-amber'}`} style={{ marginLeft: '4px' }}>
                      {d.party_role}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state-text">No dispute records found</div>
        )}
      </div>
    </div>
  );
}

// ============================================
// ADMIN GATE
// ============================================
function AdminGate({ isAdmin, adminChecked, onLogin, onLogout, showToast, onSyncComplete }) {
  if (!adminChecked) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <div className="loading-text">Checking authentication...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return <AdminLoginView onLogin={onLogin} showToast={showToast} />;
  }

  return <AdminPanel onLogout={onLogout} showToast={showToast} onSyncComplete={onSyncComplete} />;
}

// ============================================
// ADMIN LOGIN VIEW
// ============================================
function AdminLoginView({ onLogin, showToast }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok) {
        onLogin();
      } else {
        setError(data.error || 'Invalid password');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    }
    setLoading(false);
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Admin Access</h1>
        <p className="page-subtitle">
          Sign in to manage data sync and settings
        </p>
      </div>

      <div style={{ maxWidth: '440px', margin: '0 auto' }}>
        <div className="glass-card-static" style={{ padding: 'var(--spacing-xl)' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15))',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '32px', margin: '0 auto 16px',
            }}>
              🔐
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Administrator Login
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
              Data sync and settings require authentication
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block', fontSize: '12px', fontWeight: 600,
                color: 'var(--text-secondary)', textTransform: 'uppercase',
                letterSpacing: '1px', marginBottom: '8px'
              }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                className="search-input"
                style={{
                  width: '100%', padding: '12px 16px',
                  background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                  borderRadius: '12px', color: 'var(--text-primary)',
                  fontSize: '15px', outline: 'none',
                }}
                autoFocus
                id="admin-password-input"
              />
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: '10px', marginBottom: '16px',
                background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#f87171', fontSize: '13px',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !password}
              style={{ width: '100%', justifyContent: 'center', padding: '14px' }}
              id="admin-login-btn"
            >
              {loading ? (
                <><div className="spinner spinner-sm" style={{ borderTopColor: 'white' }}></div> Authenticating...</>
              ) : (
                '🔓 Sign In'
              )}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

// ============================================
// ADMIN PANEL (post-login)
// ============================================
function AdminPanel({ onLogout, showToast, onSyncComplete }) {
  const [adminTab, setAdminTab] = useState('sync');

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div>
            <h1 className="page-title">Admin Panel</h1>
            <p className="page-subtitle">Manage data sync and application settings</p>
          </div>
          <button
            className="btn"
            onClick={onLogout}
            style={{
              background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#f87171', fontSize: '13px', padding: '8px 16px', borderRadius: '10px',
              cursor: 'pointer',
            }}
            id="admin-logout-btn"
          >
            🚪 Logout
          </button>
        </div>
      </div>

      {/* Admin Sub-tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: 'var(--spacing-md)' }}>
        <button
          className={`filter-chip ${adminTab === 'sync' ? 'active' : ''}`}
          onClick={() => setAdminTab('sync')}
        >
          🔄 Data Sync
        </button>
        <button
          className={`filter-chip ${adminTab === 'settings' ? 'active' : ''}`}
          onClick={() => setAdminTab('settings')}
        >
          ⚙️ Settings
        </button>
      </div>

      {adminTab === 'sync' && (
        <ScraperView showToast={showToast} onComplete={onSyncComplete} />
      )}
      {adminTab === 'settings' && (
        <SettingsView showToast={showToast} />
      )}
    </>
  );
}

// ============================================
// SETTINGS VIEW (API keys management)
// ============================================
function SettingsView({ showToast }) {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState({ key: '', value: '', description: '', is_secret: true });
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      setSettings(data.settings || []);
    } catch (err) {
      showToast('Failed to load settings', 'error');
    }
    setLoading(false);
  };

  const handleSave = async (key) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: editValue }),
      });

      if (res.ok) {
        showToast(`${key} updated successfully`, 'success');
        setEditingKey(null);
        fetchSettings();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to save', 'error');
      }
    } catch (err) {
      showToast('Failed to save setting', 'error');
    }
    setSaving(false);
  };

  const handleAdd = async () => {
    if (!newKey.key) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newKey),
      });

      if (res.ok) {
        showToast('Setting added', 'success');
        setShowAddForm(false);
        setNewKey({ key: '', value: '', description: '', is_secret: true });
        fetchSettings();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to add', 'error');
      }
    } catch (err) {
      showToast('Failed to add setting', 'error');
    }
    setSaving(false);
  };

  const settingIcons = {
    openai_api_key: '🤖',
    openai_model: '🧠',
    scrape_delay_ms: '⏱️',
    auto_sync_enabled: '🔄',
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <div className="loading-text">Loading settings...</div>
      </div>
    );
  }

  return (
    <>
      {/* Settings Cards */}
      <div className="glass-card-static">
        <div className="section-header">
          <div className="section-title">
            <span className="section-title-icon">🔧</span>
            Application Settings
          </div>
          <button
            className="btn"
            onClick={() => setShowAddForm(!showAddForm)}
            style={{
              background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)',
              color: '#818cf8', fontSize: '12px', padding: '6px 12px', borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            + Add Setting
          </button>
        </div>

        {settings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">⚙️</div>
            <div className="empty-state-title">No settings configured</div>
            <div className="empty-state-text">Settings will appear here after deploying the admin schema.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {settings.map((s) => (
              <div
                key={s.key}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 20px', borderRadius: '10px',
                  background: editingKey === s.key ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
                  transition: 'background 0.2s',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '16px' }}>{settingIcons[s.key] || '📋'}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'SF Mono', monospace" }}>
                      {s.key}
                    </span>
                    {s.is_secret && (
                      <span className="badge badge-amber" style={{ fontSize: '9px', padding: '2px 6px' }}>SECRET</span>
                    )}
                  </div>
                  {s.description && (
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginLeft: '24px' }}>
                      {s.description}
                    </div>
                  )}

                  {editingKey === s.key ? (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px', marginLeft: '24px' }}>
                      <input
                        type={s.is_secret ? 'password' : 'text'}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        placeholder={s.is_secret ? 'Enter new value...' : 'Enter value...'}
                        style={{
                          flex: 1, padding: '8px 12px', background: 'var(--glass-bg)',
                          border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '8px',
                          color: 'var(--text-primary)', fontSize: '13px', outline: 'none',
                          fontFamily: "'SF Mono', monospace",
                        }}
                        autoFocus
                      />
                      <button
                        className="btn btn-primary"
                        onClick={() => handleSave(s.key)}
                        disabled={saving}
                        style={{ padding: '8px 16px', fontSize: '12px' }}
                      >
                        {saving ? '...' : '💾 Save'}
                      </button>
                      <button
                        className="btn"
                        onClick={() => setEditingKey(null)}
                        style={{
                          padding: '8px 12px', fontSize: '12px', background: 'var(--glass-bg)',
                          border: '1px solid var(--glass-border)', borderRadius: '8px',
                          color: 'var(--text-secondary)', cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      fontSize: '13px', color: s.has_value ? 'var(--accent-green)' : 'var(--text-tertiary)',
                      marginLeft: '24px', marginTop: '2px',
                      fontFamily: "'SF Mono', monospace",
                    }}>
                      {s.has_value ? s.value : '(not set)'}
                    </div>
                  )}
                </div>

                {editingKey !== s.key && (
                  <button
                    onClick={() => { setEditingKey(s.key); setEditValue(''); }}
                    style={{
                      padding: '6px 14px', fontSize: '12px', background: 'var(--glass-bg)',
                      border: '1px solid var(--glass-border)', borderRadius: '8px',
                      color: 'var(--text-secondary)', cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    ✏️ Edit
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Setting Form */}
      {showAddForm && (
        <div className="glass-card-static" style={{ marginTop: 'var(--spacing-md)', padding: 'var(--spacing-lg)' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>
            Add New Setting
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Key
              </label>
              <input
                type="text"
                value={newKey.key}
                onChange={(e) => setNewKey({ ...newKey, key: e.target.value })}
                placeholder="e.g. anthropic_api_key"
                style={{
                  width: '100%', padding: '10px 12px', background: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)', borderRadius: '8px',
                  color: 'var(--text-primary)', fontSize: '13px', outline: 'none',
                  fontFamily: "'SF Mono', monospace",
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Value
              </label>
              <input
                type={newKey.is_secret ? 'password' : 'text'}
                value={newKey.value}
                onChange={(e) => setNewKey({ ...newKey, value: e.target.value })}
                placeholder="Enter value..."
                style={{
                  width: '100%', padding: '10px 12px', background: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)', borderRadius: '8px',
                  color: 'var(--text-primary)', fontSize: '13px', outline: 'none',
                }}
              />
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Description
            </label>
            <input
              type="text"
              value={newKey.description}
              onChange={(e) => setNewKey({ ...newKey, description: e.target.value })}
              placeholder="What is this setting for?"
              style={{
                width: '100%', padding: '10px 12px', background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)', borderRadius: '8px',
                color: 'var(--text-primary)', fontSize: '13px', outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={newKey.is_secret}
                onChange={(e) => setNewKey({ ...newKey, is_secret: e.target.checked })}
                style={{ width: '16px', height: '16px', accentColor: '#818cf8' }}
              />
              Mark as secret (value will be masked)
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setShowAddForm(false)}
                style={{
                  padding: '8px 16px', fontSize: '13px', background: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)', borderRadius: '8px',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleAdd}
                disabled={saving || !newKey.key}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                {saving ? '...' : '+ Add Setting'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="glass-card-static" style={{ marginTop: 'var(--spacing-md)', padding: 'var(--spacing-lg)' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text-primary)' }}>About Settings:</strong>
          <ul style={{ listStyle: 'none', marginTop: '8px' }}>
            <li style={{ marginBottom: '6px' }}>
              <span style={{ marginRight: '8px' }}>🔑</span>
              <strong>openai_api_key</strong> — Required for AI-powered dispute analysis and PDF summarization
            </li>
            <li style={{ marginBottom: '6px' }}>
              <span style={{ marginRight: '8px' }}>🧠</span>
              <strong>openai_model</strong> — The model to use (gpt-4o-mini is fast and cost-effective)
            </li>
            <li style={{ marginBottom: '6px' }}>
              <span style={{ marginRight: '8px' }}>⏱️</span>
              <strong>scrape_delay_ms</strong> — Delay between requests to avoid rate limiting
            </li>
            <li>
              <span style={{ marginRight: '8px' }}>🔄</span>
              <strong>auto_sync_enabled</strong> — Enable the daily automatic sync via CRON job
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}

// ============================================
// SCRAPER VIEW
// ============================================
function ScraperView({ showToast, onComplete }) {
  const [scrapeStatus, setScrapeStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const pollInterval = useRef(null);

  useEffect(() => {
    fetchStatus();
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/scrape');
      const data = await res.json();
      setScrapeStatus(data);

      if (data.latest_job?.status === 'running') {
        setRunning(true);
        startPolling();
      }
    } catch (err) {
      console.error('Failed to fetch scrape status:', err);
    }
    setLoading(false);
  };

  const startPolling = () => {
    if (pollInterval.current) clearInterval(pollInterval.current);
    pollInterval.current = setInterval(async () => {
      try {
        const res = await fetch('/api/scrape');
        const data = await res.json();
        setScrapeStatus(data);

        if (data.latest_job?.status !== 'running') {
          clearInterval(pollInterval.current);
          setRunning(false);
          if (data.latest_job?.status === 'completed') {
            showToast('Data sync completed successfully!', 'success');
            onComplete();
          } else if (data.latest_job?.status === 'failed') {
            showToast(`Sync failed: ${data.latest_job.error_message}`, 'error');
          }
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 3000);
  };

  const startScrape = async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/scrape', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Failed to start sync', 'error');
        setRunning(false);
        return;
      }

      showToast('Data sync started!', 'info');
      startPolling();
    } catch (err) {
      showToast('Failed to start sync', 'error');
      setRunning(false);
    }
  };

  const stopScrape = async () => {
    try {
      const res = await fetch('/api/scrape', { method: 'DELETE' });
      const data = await res.json();

      if (res.ok) {
        showToast('Sync cancelled', 'info');
        setRunning(false);
        if (pollInterval.current) clearInterval(pollInterval.current);
        fetchStatus();
      } else {
        showToast(data.error || 'Failed to stop sync', 'error');
      }
    } catch (err) {
      showToast('Failed to stop sync', 'error');
    }
  };

  const job = scrapeStatus?.latest_job;
  const progress = job && job.total_pages > 0
    ? Math.round((job.current_page / job.total_pages) * 100)
    : 0;

  return (
    <>
      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <div className="loading-text">Loading sync status...</div>
        </div>
      ) : (
        <>
          {/* Current status */}
          <div className="glass-card-static" style={{ marginBottom: 'var(--spacing-md)' }}>
            <div className="section-header">
              <div className="section-title">
                <span className="section-title-icon">📡</span>
                Sync Status
              </div>
              {job && (
                <span className={`badge ${job.status === 'completed' ? 'badge-green' : job.status === 'running' ? 'badge-blue' : job.status === 'failed' ? 'badge-red' : 'badge-glass'}`}>
                  {job.status === 'running' && '⏳ '}
                  {job.status}
                </span>
              )}
            </div>

            <div className="progress-container">
              {running && job ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                      Downloading page {job.current_page || 0} of {job.total_pages || '?'}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-blue)' }}>
                      {progress}%
                    </span>
                  </div>
                  <div className="progress-bar-outer">
                    <div className="progress-bar-inner" style={{ width: `${progress}%` }}></div>
                  </div>
                  <div className="progress-stats">
                    <span>Records: {job.total_records || 0}</span>
                    <span>New: {job.new_records || 0}</span>
                    <span>Updated: {job.updated_records || 0}</span>
                  </div>
                </>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
                      Database Total
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--accent-blue)' }}>
                      {(scrapeStatus?.total_disputes || 0).toLocaleString()}
                    </div>
                  </div>
                  {job && (
                    <>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
                          Last Sync
                        </div>
                        <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                          {new Date(job.completed_at || job.created_at).toLocaleString('en-IE')}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
                          Records Processed
                        </div>
                        <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                          {(job.total_records || 0).toLocaleString()}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="glass-card-static" style={{ padding: 'var(--spacing-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>
                  {running ? 'Sync in progress...' : 'Start Full Sync'}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                  {running
                    ? 'The scraper is downloading dispute records from rtb.ie. This may take several minutes.'
                    : 'Download all dispute records from the RTB website. This will scrape all pages and update the database.'}
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={startScrape}
                disabled={running}
                id="start-sync-btn"
              >
                {running ? (
                  <>
                    <div className="spinner spinner-sm" style={{ borderTopColor: 'white' }}></div>
                    Syncing...
                  </>
                ) : (
                  <>🔄 Start Sync</>
                )}
              </button>
              {running && (
                <button
                  onClick={stopScrape}
                  style={{
                    padding: '10px 20px', fontSize: '13px', fontWeight: 600,
                    background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '10px', color: '#f87171', cursor: 'pointer',
                    marginLeft: '8px',
                  }}
                  id="stop-sync-btn"
                >
                  ⏹ Stop
                </button>
              )}
            </div>
          </div>

          {/* Error display */}
          {job && job.status === 'failed' && job.error_message && (
            <div className="glass-card-static" style={{ marginTop: 'var(--spacing-md)', padding: 'var(--spacing-lg)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '20px' }}>⚠️</span>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#f87171', marginBottom: '4px' }}>
                    Last sync failed
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {job.error_message}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Info panel */}
          <div className="glass-card-static" style={{ marginTop: 'var(--spacing-md)', padding: 'var(--spacing-lg)' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text-primary)' }}>How it works:</strong>
              <ul style={{ listStyle: 'none', marginTop: '8px' }}>
                <li style={{ marginBottom: '8px' }}>
                  <span style={{ marginRight: '8px' }}>1️⃣</span>
                  Fetches the initial page from rtb.ie to obtain a security token
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <span style={{ marginRight: '8px' }}>2️⃣</span>
                  Queries the FacetWP API page by page (with a 1.5s delay between requests)
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <span style={{ marginRight: '8px' }}>3️⃣</span>
                  Parses each record, extracts party names, dates, and PDF links
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <span style={{ marginRight: '8px' }}>4️⃣</span>
                  Upserts records into the database (deduplicates by DR number)
                </li>
                <li>
                  <span style={{ marginRight: '8px' }}>5️⃣</span>
                  Creates party records and links them to disputes for the league table
                </li>
              </ul>
            </div>
          </div>
        </>
      )}
    </>
  );
}
