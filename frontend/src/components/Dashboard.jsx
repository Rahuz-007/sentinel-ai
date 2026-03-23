import React, { useState, useEffect, useContext, useCallback } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { ToastContext } from '../App';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4005';

// ─── Helper formatters ────────────────────────────────────────
const relTime = (ts) => {
    const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
    if (diff < 60)  return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return new Date(ts).toLocaleTimeString();
};

const RISK_CLASS  = { High: 'high', Medium: 'medium', Low: 'low' };
const STATUS_SLUG = (s) => s.toLowerCase().replace(' ', '_');

const STATUSES = {
    admin:     ['Investigating', 'Resolved', 'False Alarm'],
    police:    ['Investigating', 'Resolved'],
    cctv_user: ['Verified', 'Reported', 'False Alarm'],
};

// ─── Stats Card ───────────────────────────────────────────────
function StatCard({ label, value, color, icon, loading }) {
    return (
        <div className={`stat-card ${color}`}>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{loading ? '—' : value ?? 0}</div>
            <div className="stat-icon">{icon}</div>
        </div>
    );
}

// ─── Main Dashboard ───────────────────────────────────────────
export default function Dashboard({ user, token }) {
    const toast = useContext(ToastContext);
    const [alerts,  setAlerts]  = useState([]);
    const [stats,   setStats]   = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter,  setFilter]  = useState({ search: '', risk: '', status: '' });
    const [socket,  setSocket]  = useState(null);

    const authHeader = { headers: { 'x-auth-token': token } };

    // ── Fetch ──────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        try {
            const [aRes, sRes] = await Promise.all([
                axios.get(`${API}/api/alerts`, authHeader),
                axios.get(`${API}/api/stats`,  authHeader),
            ]);
            setAlerts(aRes.data);
            setStats(sRes.data);
        } catch (err) {
            console.error('Fetch error:', err.message);
        } finally {
            setLoading(false);
        }
    }, [token]);

    // ── Socket.IO real-time updates ───────────────────────────
    useEffect(() => {
        fetchData();

        const sock = io(API, { transports: ['websocket', 'polling'] });

        sock.on('connect', () => console.log('✅ Socket connected'));

        sock.on('new_alert', (payload) => {
            if (payload?.type === 'new_alert' && payload?.alert) {
                setAlerts(prev => [payload.alert, ...prev]);
                setStats(prev => prev ? { ...prev, total: (prev.total || 0) + 1,
                    ...(payload.alert.riskLevel === 'High' ? { highRisk: (prev.highRisk || 0) + 1 } : {})
                } : prev);
                toast?.(`🚨 New ${payload.alert.riskLevel} alert: ${payload.alert.behavior}`,
                    payload.alert.riskLevel === 'High' ? 'error' : 'warning', 6000);
            } else if (payload?.type === 'status_update') {
                setAlerts(prev => prev.map(a => a._id === payload.alert._id ? payload.alert : a));
            }
        });

        setSocket(sock);
        return () => sock.disconnect();
    }, [fetchData]);

    // ── Actions ────────────────────────────────────────────────
    const updateStatus = async (id, status) => {
        try {
            await axios.put(`${API}/api/alerts/${id}`, { status }, authHeader);
            setAlerts(prev => prev.map(a => a._id === id ? { ...a, status } : a));
            toast?.(`Status updated → ${status}`, 'success');
        } catch { toast?.('Failed to update status', 'error'); }
    };

    const deleteAlert = async (id) => {
        if (!window.confirm('Permanently delete this alert? This cannot be undone.')) return;
        try {
            await axios.delete(`${API}/api/alerts/${id}`, authHeader);
            setAlerts(prev => prev.filter(a => a._id !== id));
            toast?.('Alert deleted', 'success');
        } catch { toast?.('Failed to delete alert', 'error'); }
    };

    const clearHistory = async () => {
        if (!window.confirm('Hide all history from your view?')) return;
        try {
            await axios.delete(`${API}/api/alerts/history`, authHeader);
            fetchData();
            toast?.('History cleared from view', 'info');
        } catch { toast?.('Failed to clear history', 'error'); }
    };

    const clearFalseAlarms = async () => {
        try {
            await axios.delete(`${API}/api/alerts/false-alarms`, authHeader);
            fetchData();
            toast?.('False alarms cleared', 'success');
        } catch { toast?.('Failed to clear false alarms', 'error'); }
    };

    // ── Filtering ──────────────────────────────────────────────
    const filtered = alerts.filter(a => {
        if (filter.risk   && a.riskLevel !== filter.risk)  return false;
        if (filter.status && a.status    !== filter.status) return false;
        if (filter.search) {
            const q = filter.search.toLowerCase();
            if (!a.behavior?.toLowerCase().includes(q) && !a.videoName?.toLowerCase().includes(q)) return false;
        }
        return true;
    });

    const isHigh = (a) => a.riskLevel === 'High';
    const actions = STATUSES[user?.role] || [];
    const isAdmin  = user?.role === 'admin';
    const isPolice = user?.role === 'police';

    return (
        <div>
            {/* Header */}
            <div className="dashboard-header">
                <div>
                    <div className="page-title">
                        ⚡ Security Dashboard
                        {(isPolice) && <span style={{ fontSize: '0.75rem', color: 'var(--cyan)', marginLeft: 10 }}>AUDIT VIEW</span>}
                    </div>
                    <div className="page-subtitle">Real-time behavioral anomaly detection and incident management</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div className="live-badge">
                        <div className="status-dot" /> Live
                    </div>
                    {isAdmin && (
                        <>
                            <button className="btn btn-ghost btn-sm" onClick={clearFalseAlarms}>🚫 Clear False</button>
                            <button className="btn btn-danger btn-sm" onClick={clearHistory}>🗑 Clear All</button>
                        </>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={fetchData}>↻ Refresh</button>
                </div>
            </div>

            {/* Stats */}
            <div className="stats-bar">
                <StatCard label="Total Incidents" value={stats?.total}      color="cyan"  icon="📊" loading={loading} />
                <StatCard label="High Risk"        value={stats?.highRisk}  color="red"   icon="🚨" loading={loading} />
                <StatCard label="Investigating"    value={stats?.investigating} color="amber" icon="🔍" loading={loading} />
                <StatCard label="Resolved Today"   value={stats?.resolvedToday} color="green" icon="✅" loading={loading} />
            </div>

            {/* Panel */}
            <div className="panel">
                <div className="panel-header">
                    <div className="panel-title">
                        <span className="title-accent">◆</span> Incident Feed
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 400 }}>
                            ({filtered.length} shown)
                        </span>
                    </div>
                    {/* Filters */}
                    <div className="filter-bar" style={{ margin: 0 }}>
                        <input
                            className="filter-input"
                            placeholder="🔍 Search behavior, source..."
                            value={filter.search}
                            onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
                        />
                        <select className="filter-select" value={filter.risk} onChange={e => setFilter(f => ({ ...f, risk: e.target.value }))}>
                            <option value="">All Risks</option>
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                        </select>
                        <select className="filter-select" value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
                            <option value="">All Status</option>
                            {['Pending','Investigating','Verified','Reported','Resolved','False Alarm'].map(s =>
                                <option key={s} value={s}>{s}</option>
                            )}
                        </select>
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="loading-state"><div className="spin" /> Loading incidents...</div>
                ) : (
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Camera / Location</th>
                                    <th>Behavior</th>
                                    <th>Risk</th>
                                    <th>Status</th>
                                    <th>Officer / Precinct</th>
                                    <th>Time</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan="6">
                                            <div className="empty-state">
                                                <div className="empty-icon">🛡️</div>
                                                <div className="empty-text">No incidents match current filters</div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filtered.map(alert => (
                                    <tr key={alert._id} className={isHigh(alert) ? 'risk-high' : ''}>
                                        {/* Camera / Location */}
                                        <td>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.84rem', marginBottom: 3 }}>
                                                {alert.videoName || 'Live Feed'}
                                            </div>
                                            {alert.precinct && (
                                                <div style={{ fontSize: '0.68rem', color: 'var(--cyan)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
                                                    🏛 {alert.precinct}
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                {alert.location && (
                                                    <a
                                                        className="gps-link"
                                                        href={`https://www.google.com/maps?q=${alert.location.lat},${alert.location.lon}`}
                                                        target="_blank" rel="noopener noreferrer"
                                                    >
                                                        📍 {alert.location.lat?.toFixed(4)}, {alert.location.lon?.toFixed(4)}
                                                    </a>
                                                )}
                                                {alert.videoPath && (
                                                    <a
                                                        className="video-link"
                                                        href={`http://localhost:4005${alert.videoPath}`}
                                                        target="_blank" rel="noopener noreferrer"
                                                    >
                                                        📹 Clip
                                                    </a>
                                                )}
                                            </div>
                                            {alert.notes && (
                                                <div style={{
                                                    marginTop: 4,
                                                    fontSize: '0.68rem',
                                                    color: 'var(--text-secondary)',
                                                    lineHeight: 1.4,
                                                    maxWidth: 280,
                                                    borderLeft: '2px solid var(--border)',
                                                    paddingLeft: 6,
                                                }}>
                                                    {alert.notes}
                                                </div>
                                            )}
                                        </td>

                                        {/* Behavior */}
                                        <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{alert.behavior}</td>

                                        {/* Risk */}
                                        <td>
                                            <span className={`badge badge-${RISK_CLASS[alert.riskLevel]}`}>
                                                <span className="badge-dot" />
                                                {alert.riskLevel}
                                            </span>
                                        </td>

                                        {/* Status */}
                                        <td>
                                            <span className={`status-badge status-${STATUS_SLUG(alert.status || 'pending')}`}>
                                                {alert.status || 'Pending'}
                                            </span>
                                        </td>

                                        {/* Officer / Precinct */}
                                        <td>
                                            {alert.reportedBy ? (
                                                <div>
                                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                                                        {alert.reportedBy}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>—</span>
                                            )}
                                        </td>

                                        {/* Time */}
                                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                            <div>{relTime(alert.timestamp)}</div>
                                            <div style={{ fontSize: '0.63rem', color: 'var(--text-dim)' }}>
                                                {new Date(alert.timestamp).toLocaleTimeString()}
                                            </div>
                                        </td>

                                        {/* Actions */}
                                        <td>
                                            <div className="actions-cell">
                                                {actions.map(s => (
                                                    <button
                                                        key={s}
                                                        className={`btn btn-xs ${s === 'Resolved' ? 'btn-success' : 'btn-ghost'}`}
                                                        onClick={() => updateStatus(alert._id, s)}
                                                        disabled={alert.status === s}
                                                        style={{ fontFamily: 'var(--font-mono)' }}
                                                    >
                                                        {s === 'Investigating' ? '🔍' : s === 'Resolved' ? '✅' : s === 'Verified' ? '✔' : s === 'Reported' ? '📋' : '✗'} {s.split(' ')[0]}
                                                    </button>
                                                ))}
                                                {(isAdmin || isPolice) && (
                                                    <button className="btn btn-xs btn-danger" onClick={() => deleteAlert(alert._id)}>🗑</button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
