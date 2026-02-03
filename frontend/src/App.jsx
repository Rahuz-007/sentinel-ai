import React, { useState } from 'react';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import VideoUpload from './components/VideoUpload';
import WebcamStream from './components/WebcamStream';
import Login from './components/Login';
import './index.css';

function App() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));

    // Check for existing session on load (simplified)
    React.useEffect(() => {
        const savedUser = localStorage.getItem('user');
        if (token && savedUser) {
            setUser(JSON.parse(savedUser));
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

    if (!token) {
        return <Login onLogin={handleLogin} />;
    }

    return (
        <div className="app-container">
            <Navbar
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                user={user}
                onLogout={handleLogout}
            />

            <main className="main-content">
                {activeTab === 'dashboard' && <Dashboard user={user} />}

                {activeTab === 'upload' && (user?.role === 'admin' || user?.role === 'police' || user?.role === 'cctv_user') && (
                    <VideoUpload />
                )}

                {activeTab === 'webcam' && (user?.role === 'admin' || user?.role === 'cctv_user') && (
                    <WebcamStream />
                )}
            </main>
        </div>
    );
}

export default App;
