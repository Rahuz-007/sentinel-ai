import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Dashboard = ({ user }) => {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchAlerts = async () => {
        try {
            const url = import.meta.env.VITE_API_URL || 'http://localhost:4005';
            // Include role in query to handle filtering
            const response = await axios.get(`${url}/api/alerts?role=${user?.role || 'user'}`);
            setAlerts(response.data);
            setLoading(false);
        } catch (error) {
            console.error("Error fetching alerts:", error);
            setLoading(false);
        }
    };

    const clearHistory = async () => {
        if (!window.confirm("This will hide all current history from your view. Police will still have access to reported incidents. Continue?")) return;
        try {
            const url = import.meta.env.VITE_API_URL || 'http://localhost:4005';
            await axios.delete(`${url}/api/alerts/history`);
            fetchAlerts();
        } catch (error) {
            alert("Failed to clear history");
        }
    };

    const clearFalseAlarms = async () => {
        if (!window.confirm("Clear all cases marked as 'False Alarm' from history?")) return;
        try {
            const url = import.meta.env.VITE_API_URL || 'http://localhost:4005';
            await axios.delete(`${url}/api/alerts/false-alarms`);
            fetchAlerts();
        } catch (error) {
            alert("Failed to clear false alarms");
        }
    };

    const updateStatus = async (id, newStatus) => {
        try {
            const url = import.meta.env.VITE_API_URL || 'http://localhost:4005';
            await axios.put(`${url}/api/alerts/${id}`, { status: newStatus });
            fetchAlerts(); // Refresh
        } catch (error) {
            console.error("Error updating status:", error);
            alert("Failed to update status");
        }
    };

    const deleteAlert = async (id) => {
        if (!window.confirm("PERMANENT DELETE: Are you sure? This will remove the case from the database and all audit logs.")) return;
        try {
            const url = import.meta.env.VITE_API_URL || 'http://localhost:4005';
            await axios.delete(`${url}/api/alerts/${id}`);
            fetchAlerts(); // Refresh list
        } catch (error) {
            console.error("Error deleting alert:", error);
            alert("Failed to delete alert");
        }
    };

    useEffect(() => {
        fetchAlerts();
        const interval = setInterval(fetchAlerts, 2000); // Polling every 2s
        return () => clearInterval(interval);
    }, []);

    const getRiskBadge = (risk) => {
        const className = `badge risk-${risk.toLowerCase()}`;
        return <span className={className}>{risk}</span>;
    };

    return (
        <div className="dashboard-container">
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2>Live Security Dashboard {user?.role === 'police' && "(Audit View)"}</h2>
                    <p>Real-time behavioral anomalies and risk assessment.</p>
                </div>
                {user?.role !== 'police' && (
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={clearFalseAlarms}
                            style={{ background: '#7f8c8d', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            🚫 Clear False Alarms
                        </button>
                        <button
                            onClick={clearHistory}
                            style={{ background: '#e74c3c', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            🗑️ Clear All History
                        </button>
                    </div>
                )}
            </header>

            {loading ? (
                <div className="loading">Loading alerts...</div>
            ) : (
                <div className="table-wrapper">
                    <table className="alert-table">
                        <thead>
                            <tr>
                                <th>Video / Source</th>
                                <th>Detected Behavior</th>
                                <th>Risk Level</th>
                                <th>Status</th>
                                <th>Timestamp</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {alerts.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="empty-state">No alerts detected yet.</td>
                                </tr>
                            ) : (
                                alerts.map((alert) => (
                                    <tr key={alert._id} className={alert.riskLevel === 'High' ? 'row-high-risk' : ''}>
                                        <td>
                                            {alert.videoName || 'Live Feed'}
                                            {alert.location && (
                                                <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                                                    <a
                                                        href={`https://www.google.com/maps?q=${alert.location.lat},${alert.location.lon}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ color: '#2ecc71', textDecoration: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                    >
                                                        📍 GPS: {alert.location.lat.toFixed(4)}, {alert.location.lon.toFixed(4)}
                                                    </a>
                                                </div>
                                            )}
                                            {alert.videoPath && (
                                                <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                                                    <a
                                                        href={`http://localhost:4005${alert.videoPath}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ color: '#3498db', textDecoration: 'none', fontWeight: 'bold' }}
                                                    >
                                                        📹 View Incident Clip
                                                    </a>
                                                </div>
                                            )}
                                        </td>
                                        <td>{alert.behavior}</td>
                                        <td>{getRiskBadge(alert.riskLevel)}</td>
                                        <td><span className={`status status-${alert.status.toLowerCase()}`}>{alert.status}</span></td>
                                        <td>{new Date(alert.timestamp).toLocaleString()}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '5px' }}>
                                                {(user?.role === 'admin' || user?.role === 'police') && (
                                                    <button
                                                        className="action-btn-small investigate"
                                                        onClick={() => updateStatus(alert._id, 'Investigating')}
                                                        disabled={alert.status === 'Investigating'}
                                                        style={{ fontSize: '0.7rem', padding: '4px 8px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                                    >
                                                        Investigate
                                                    </button>
                                                )}

                                                {(user?.role === 'admin' || user?.role === 'police') && (
                                                    <button
                                                        className="action-btn-small resolve"
                                                        onClick={() => updateStatus(alert._id, 'Resolved')}
                                                        disabled={alert.status === 'Resolved'}
                                                        style={{ fontSize: '0.7rem', padding: '4px 8px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                                    >
                                                        Resolve
                                                    </button>
                                                )}

                                                {(user?.role === 'admin' || user?.role === 'cctv_user') && (
                                                    <button
                                                        className="action-btn-small verify"
                                                        onClick={() => updateStatus(alert._id, 'Verified')}
                                                        disabled={alert.status === 'Verified' || alert.status === 'Resolved'}
                                                        style={{ fontSize: '0.7rem', padding: '4px 8px', background: '#e67e22', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                                    >
                                                        Verify
                                                    </button>
                                                )}

                                                {(user?.role === 'admin' || user?.role === 'cctv_user') && (
                                                    <button
                                                        className="action-btn-small report"
                                                        onClick={() => updateStatus(alert._id, 'Reported')}
                                                        disabled={alert.status === 'Reported'}
                                                        style={{ fontSize: '0.7rem', padding: '4px 8px', background: '#9b59b6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                                    >
                                                        Report
                                                    </button>
                                                )}

                                                {(user?.role === 'admin' || user?.role === 'cctv_user') && (
                                                    <button
                                                        className="action-btn-small false-alarm"
                                                        onClick={() => updateStatus(alert._id, 'False Alarm')}
                                                        disabled={alert.status === 'False Alarm'}
                                                        style={{ fontSize: '0.7rem', padding: '4px 8px', background: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                                    >
                                                        False
                                                    </button>
                                                )}

                                                {(user?.role === 'admin' || user?.role === 'police') && (
                                                    <button
                                                        className="action-btn-small delete"
                                                        onClick={() => deleteAlert(alert._id)}
                                                        style={{ fontSize: '0.7rem', padding: '4px 8px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                                    >
                                                        🗑️ Delete
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
