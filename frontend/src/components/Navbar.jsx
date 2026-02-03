import React from 'react';

const Navbar = ({ activeTab, setActiveTab, user, onLogout }) => {
    return (
        <nav className="navbar">
            <div className="logo">🛡️ Sentinel <span className="logo-highlight">AI</span></div>
            <div className="nav-links">
                {user && (
                    <div className="user-info" style={{ display: 'flex', alignItems: 'center', marginRight: '1rem', color: 'hsl(var(--text-dim))', fontSize: '0.9rem' }}>
                        <span style={{ marginRight: '0.5rem' }}>{user.username} <span style={{ opacity: 0.7 }}>({user.role})</span></span>
                    </div>
                )}
                <button
                    className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
                    onClick={() => setActiveTab('dashboard')}
                >
                    Alert Dashboard
                </button>

                {(user?.role === 'admin' || user?.role === 'police' || user?.role === 'cctv_user') && (
                    <button
                        className={`nav-btn ${activeTab === 'upload' ? 'active' : ''}`}
                        onClick={() => setActiveTab('upload')}
                    >
                        Upload Video
                    </button>
                )}

                {(user?.role === 'admin' || user?.role === 'cctv_user') && (
                    <button
                        className={`nav-btn ${activeTab === 'webcam' ? 'active' : ''}`}
                        onClick={() => setActiveTab('webcam')}
                    >
                        Live Webcam
                    </button>
                )}
                <button
                    className="nav-btn"
                    style={{ color: '#ff6b6b', border: '1px solid rgba(255, 107, 107, 0.2)' }}
                    onClick={onLogout}
                >
                    Logout
                </button>
            </div>
        </nav>
    );
};

export default Navbar;
