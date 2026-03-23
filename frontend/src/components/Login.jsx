import React, { useState, useContext } from 'react';
import axios from 'axios';
import { ToastContext } from '../App';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4005';

export default function Login({ onLogin }) {
    const toast = useContext(ToastContext);
    const [mode,     setMode]     = useState('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role,     setRole]     = useState('cctv_user');
    const [error,    setError]    = useState('');
    const [loading,  setLoading]  = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!username.trim() || !password.trim()) {
            setError('Username and password are required.');
            return;
        }
        setLoading(true);
        try {
            if (mode === 'login') {
                const res = await axios.post(`${API}/api/login`, { username, password });
                toast?.('Login successful. Welcome, ' + res.data.user.username, 'success');
                onLogin(res.data.user, res.data.token);
            } else {
                await axios.post(`${API}/api/register`, { username, password, role });
                toast?.('Account created. You can now log in.', 'success');
                setMode('login');
                setPassword('');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Connection failed. Check if the backend is running.');
        } finally {
            setLoading(false);
        }
    };

    const ROLES = [
        { value: 'cctv_user', label: '📷  CCTV Operator' },
        { value: 'police',    label: '🚔  Police Officer' },
        { value: 'admin',     label: '👑  Administrator' },
    ];

    return (
        <div className="login-page">
            <div className="login-card">
                {/* Header */}
                <div className="login-header">
                    <div className="login-logo">🛡️</div>
                    <h1>SENTINEL AI</h1>
                    <p>Behavioral Risk Analysis System · v2.1</p>
                </div>

                {/* Body */}
                <div className="login-body">
                    {/* Mode Toggle */}
                    <div className="login-mode-toggle">
                        <button className={`mode-btn ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setError(''); }}>
                            Sign In
                        </button>
                        <button className={`mode-btn ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setError(''); }}>
                            Register
                        </button>
                    </div>

                    {/* Error */}
                    {error && <div className="error-box">⚠️ {error}</div>}

                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label className="form-label">Username</label>
                            <input
                                className="form-control"
                                type="text"
                                placeholder="Enter your username"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                autoComplete="username"
                                autoFocus
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Password</label>
                            <input
                                className="form-control"
                                type="password"
                                placeholder="Enter your password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                            />
                        </div>

                        {mode === 'register' && (
                            <div className="form-group">
                                <label className="form-label">Role</label>
                                <select
                                    className="form-control"
                                    value={role}
                                    onChange={e => setRole(e.target.value)}
                                >
                                    {ROLES.map(r => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <button
                            type="submit"
                            className="btn btn-primary"
                            style={{ width: '100%', marginTop: '8px', justifyContent: 'center', padding: '12px' }}
                            disabled={loading}
                        >
                            {loading ? (
                                <><div className="spin" style={{ width: 14, height: 14, borderWidth: 2 }} /> Processing...</>
                            ) : mode === 'login' ? '🔓 ACCESS SYSTEM' : '📝 CREATE ACCOUNT'}
                        </button>
                    </form>

                    {/* Demo Accounts Hint */}
                    <div style={{ marginTop: 20, padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.60rem', color: 'var(--text-muted)', letterSpacing: '1px', marginBottom: 8, textTransform: 'uppercase' }}>
                            Demo Accounts
                        </div>
                        {[['admin','admin123','Admin'], ['NYPD','nypd@123','Police'], ['operator','operator123','CCTV']].map(([u, p, r]) => (
                            <div key={u}
                                style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '0.70rem', marginBottom: 4, cursor: 'pointer', padding: '4px 6px', borderRadius: 4, transition: 'background 0.15s' }}
                                onClick={() => { setUsername(u); setPassword(p); setMode('login'); }}
                                onMouseOver={e => e.currentTarget.style.background = 'rgba(0,212,255,0.07)'}
                                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                            >
                                <span style={{ color: 'var(--cyan)' }}>{u}</span>
                                <span style={{ color: 'var(--text-muted)' }}>{p}</span>
                                <span style={{ color: 'var(--text-secondary)' }}>{r}</span>
                            </div>
                        ))}
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-dim)', marginTop: 6 }}>
                            Click any row to auto-fill
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
