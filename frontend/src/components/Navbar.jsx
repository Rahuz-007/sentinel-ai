import React from 'react';

const TABS = [
    { id: 'dashboard', label: 'Dashboard',    icon: '⚡', roles: ['admin','police','cctv_user'] },
    { id: 'analytics', label: 'Analytics',    icon: '📊', roles: ['admin','police','cctv_user'] },
    { id: 'webcam',    label: 'Live Camera',  icon: '📷', roles: ['admin','cctv_user'] },
    { id: 'upload',    label: 'Video Intel',  icon: '🎬', roles: ['admin','police','cctv_user'] },
];

const ROLE_COLOR = { admin:'role-admin', police:'role-police', cctv_user:'role-cctv' };
const ROLE_LABEL = { admin:'👑 Admin', police:'🚔 Police', cctv_user:'📷 CCTV Ops' };

export default function Navbar({ activeTab, setActiveTab, user, onLogout }) {
    const initials    = user?.username?.slice(0,2).toUpperCase() || '??';
    const visibleTabs = TABS.filter(t => t.roles.includes(user?.role));

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <div className="sidebar-brand">
                    <div className="brand-icon">🛡️</div>
                    <div className="brand-text">
                        <span className="brand-name">Sentinel</span>
                        <span className="brand-ver">v3.2</span>
                    </div>
                </div>
            </div>

            <div className="sidebar-divider" />

            {/* Navigation */}
            <nav className="sidebar-nav">
                <div className="nav-label">COMMAND MODULES</div>
                {visibleTabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`nav-btn ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <span className="nav-icon">{tab.icon}</span> 
                        {tab.label}
                    </button>
                ))}
            </nav>

            <div className="sidebar-spacer" />

            {/* Live indicator */}
            <div className="sidebar-status">
                <div className="status-dot" />
                SYSTEM ARMED
            </div>

            <div className="sidebar-divider" />

            {/* User Profile */}
            <div className="sidebar-user">
                <div className="user-avatar">{initials}</div>
                <div className="user-info">
                    <span className="user-name">{user?.username}</span>
                    <span className={`user-role ${ROLE_COLOR[user?.role]||''}`}>
                        {ROLE_LABEL[user?.role]||user?.role}
                    </span>
                </div>
                <button className="logout-btn" onClick={onLogout} title="Logout">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                </button>
            </div>
        </aside>
    );
}
