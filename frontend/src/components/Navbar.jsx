import React from 'react';

const TABS = [
    { id: 'dashboard', label: 'Dashboard',    icon: '⚡', roles: ['admin','police','cctv_user'] },
    { id: 'analytics', label: 'Analytics',    icon: '📊', roles: ['admin','police','cctv_user'] },
    { id: 'webcam',    label: 'Live Camera',  icon: '📷', roles: ['admin','cctv_user'] },
    { id: 'multicam',  label: 'Multi-Cam',    icon: '▩',  roles: ['admin','cctv_user'] },
    { id: 'upload',    label: 'Video Intel',  icon: '🎬', roles: ['admin','police','cctv_user'] },
];

const ROLE_COLOR = { admin:'role-admin', police:'role-police', cctv_user:'role-cctv' };
const ROLE_LABEL = { admin:'👑 Admin', police:'🚔 Police', cctv_user:'📷 CCTV Ops' };

export default function Navbar({ activeTab, setActiveTab, user, onLogout }) {
    const initials    = user?.username?.slice(0,2).toUpperCase() || '??';
    const visibleTabs = TABS.filter(t => t.roles.includes(user?.role));

    return (
        <nav className="navbar">
            {/* Brand */}
            <div className="navbar-brand">
                <div className="brand-icon">🛡️</div>
                <span className="brand-name">Sentinel</span>
                <span className="brand-ver">v3.2</span>
            </div>

            <div className="navbar-divider" />

            {/* Navigation */}
            <div className="navbar-nav">
                {visibleTabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`nav-btn ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            <div className="navbar-spacer" />

            {/* Live indicator */}
            <div className="navbar-status">
                <div className="status-dot" />
                SYSTEM ARMED
            </div>

            <div className="navbar-divider" />

            {/* User */}
            <div className="navbar-user">
                <div className="user-avatar">{initials}</div>
                <div className="user-info">
                    <span className="user-name">{user?.username}</span>
                    <span className={`user-role ${ROLE_COLOR[user?.role]||''}`}>
                        {ROLE_LABEL[user?.role]||user?.role}
                    </span>
                </div>
            </div>

            <button className="logout-btn" onClick={onLogout}>LOGOUT</button>
        </nav>
    );
}
