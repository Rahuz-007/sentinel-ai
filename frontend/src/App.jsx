import React, { useState, useEffect, useCallback } from 'react';
import Navbar      from './components/Navbar';
import Dashboard   from './components/Dashboard';
import VideoUpload from './components/VideoUpload';
import WebcamStream from './components/WebcamStream';
import MultiCamera from './components/MultiCamera';
import Analytics   from './components/Analytics';
import Login       from './components/Login';
import './index.css';

// ─── Toast Context ─────────────────────────────────────────────
export const ToastContext = React.createContext(null);

function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((msg, type = 'info', duration = 4000) => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, msg, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
    }, []);

    const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };

    return (
        <ToastContext.Provider value={addToast}>
            {children}
            <div className="toast-container">
                {toasts.map(t => (
                    <div key={t.id} className={`toast ${t.type}`}>
                        <span>{icons[t.type] || '📢'}</span>
                        <span>{t.msg}</span>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

// ─── App ───────────────────────────────────────────────────────
function App() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [user,  setUser]  = useState(null);
    const [token, setToken] = useState(() => localStorage.getItem('token'));

    useEffect(() => {
        const savedUser = localStorage.getItem('user');
        if (token && savedUser) {
            try { setUser(JSON.parse(savedUser)); }
            catch { localStorage.clear(); setToken(null); }
        }
    }, [token]);

    const handleLogin = (userData, authToken) => {
        localStorage.setItem('token', authToken);
        localStorage.setItem('user', JSON.stringify(userData));
        setToken(authToken);
        setUser(userData);
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(null);
        setUser(null);
        setActiveTab('dashboard');
    };

    if (!token) return (
        <ToastProvider>
            <Login onLogin={handleLogin} />
        </ToastProvider>
    );

    const role = user?.role;
    const isAdmin  = role === 'admin';
    const isPolice = role === 'police';
    const isCCTV   = role === 'cctv_user';

    return (
        <ToastProvider>
            <div className="app-container">
                <Navbar
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    user={user}
                    onLogout={handleLogout}
                    token={token}
                />
                <main className="main-content">
                    {activeTab === 'dashboard'    && <Dashboard    user={user} token={token} />}
                    {activeTab === 'analytics'    && <Analytics    token={token} />}
                    {activeTab === 'webcam'       && (isAdmin||isCCTV) && <WebcamStream token={token} />}
                    {activeTab === 'multicam'     && (isAdmin||isCCTV) && <MultiCamera  token={token} />}
                    {activeTab === 'upload'       && <VideoUpload  token={token} />}
                </main>
            </div>
        </ToastProvider>
    );
}

export default App;
