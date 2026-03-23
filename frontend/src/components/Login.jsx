import React, { useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { ToastContext } from '../App';
import './LoginUI.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4005';

export default function Login({ onLogin }) {
    const toast = useContext(ToastContext);
    
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Escape listener
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') setIsModalOpen(false);
        };
        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, []);

    const openModal = () => {
        setError('');
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!username.trim() || !password.trim()) {
            setError('Operator credentials are required.');
            shakeModal();
            return;
        }
        setLoading(true);
        try {
            const res = await axios.post(`${API}/api/login`, { username, password });
            toast?.('Clearance authenticated. Access granted.', 'success');
            onLogin(res.data.user, res.data.token);
        } catch (err) {
            setError(err.response?.data?.message || 'Connection failed. Neural Link offline.');
            shakeModal();
        } finally {
            setLoading(false);
        }
    };

    const shakeModal = () => {
        const card = document.getElementById('lp-modal-card');
        if(card) {
            card.style.transform = 'translate(5px, 0)';
            setTimeout(() => card.style.transform = 'translate(-5px, 0)', 100);
            setTimeout(() => card.style.transform = 'translate(5px, 0)', 200);
            setTimeout(() => card.style.transform = 'scale(1) translateY(0)', 300);
        }
    };

    const DEMOS = [
        ['admin', 'admin123', 'Admin'], 
        ['NYPD', 'nypd@123', 'Police'], 
        ['operator', 'operator123', 'CCTV']
    ];

    const scrollToSection = (id) => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <div className="lp-root">
            {/* AMBIENT BACKGROUND */}
            <div className="lp-ambient">
                <div className="lp-orb lp-orb-1"></div>
                <div className="lp-orb lp-orb-2"></div>
                <div className="lp-orb lp-orb-3"></div>
                <div className="lp-grid"></div>
            </div>

            {/* NAVBAR */}
            <nav className="lp-navbar">
                <div className="lp-nav-container">
                    <div className="lp-brand" style={{cursor: 'pointer'}} onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
                        <div className="lp-brand-logo">🛡️</div>
                        <div className="lp-brand-text">
                            <span className="lp-brand-name">Sentinel</span>
                            <span className="lp-brand-version">v3.2 ENGINE</span>
                        </div>
                    </div>
                    <div className="lp-nav-links">
                        <a onClick={() => scrollToSection('features')}>Capabilities</a>
                        <a onClick={() => scrollToSection('architecture')}>Architecture</a>
                        <a onClick={() => scrollToSection('highlights')}>Highlights</a>
                        <button className="lp-btn lp-btn-outline" onClick={openModal}>System Login</button>
                    </div>
                </div>
            </nav>

            {/* HERO SECTION */}
            <header className="lp-hero" id="home">
                <div>
                    <div className="lp-badge">
                        <span className="lp-pulse"></span> LIVE NEURAL ENGINE ACTIVE
                    </div>
                    <h1>Predictive threat detection <br/><span className="lp-text-gradient">powered by Visual AI</span></h1>
                    <p>
                        Sentinel AI processes multi-camera feeds in real-time. By utilizing YOLOv8-Pose and specialized recurrent neural networks, we identify hostile behavior faster than human operators.
                    </p>
                    <div className="lp-hero-cta">
                        <button className="lp-btn lp-btn-primary" onClick={() => scrollToSection('features')}>
                            Discover Platform
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft: '6px'}}><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
                        </button>
                    </div>
                </div>
                
                <div className="lp-hero-visual">
                    <div className="lp-mockup">
                        <div className="lp-mockup-hdr">
                            <div className="lp-dots"><span></span><span></span><span></span></div>
                            <div className="lp-mockup-title">sentinel_stream_01.mp4</div>
                        </div>
                        <div className="lp-mockup-body">
                            <div className="lp-scanline"></div>
                            <div className="lp-bbox lp-b1">
                                <span className="lp-blabel">SUBJECT_01 | 94%</span>
                            </div>
                            <div className="lp-bbox lp-b2 lp-alert-box">
                                <span className="lp-blabel lp-alert-text">HOSTILE | 88%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* FEATURES SECTION */}
            <section id="features" className="lp-features">
                <div className="lp-sec-hdr">
                    <h2>Core Protocol <span className="lp-text-gradient">Capabilities</span></h2>
                    <p>Built for high-stakes environments where every millisecond matters.</p>
                </div>
                
                <div className="lp-grid-f">
                    <div className="lp-card lp-glass">
                        <div className="lp-icon">👁️</div>
                        <h3>Skeletal Tracking</h3>
                        <p>Maps 17 distinct human keypoints per subject at 60 FPS, maintaining lock across complex crowd occlusions to monitor biomechanical shifts.</p>
                    </div>
                    <div className="lp-card lp-glass">
                        <div className="lp-icon">🧠</div>
                        <h3>Contextual Fusion</h3>
                        <p>Fuses positional data with object interaction vectors to calculate absolute hostility probability continuously without fatigue.</p>
                    </div>
                    <div className="lp-card lp-glass">
                        <div className="lp-icon">⚡</div>
                        <h3>Millisecond Alerting</h3>
                        <p>When the risk threshold is broken, Twilio SMS and SMTP alerts are autonomously dispatched to designated response teams.</p>
                    </div>
                </div>
            </section>

            {/* HIGHLIGHTS SECTION */}
            <section id="highlights" className="lp-highlights">
                <div className="lp-sec-hdr">
                    <h2>System <span className="lp-text-gradient">Highlights</span></h2>
                    <p>Engineered for unparalleled accuracy and privacy in modern surveillance architecture.</p>
                </div>
                <div className="lp-grid-h">
                    <div className="lp-h-card">
                        <div className="lp-h-img">
                            <div className="lp-h-overlay">YOLOv8-Pose Integration</div>
                        </div>
                        <div className="lp-h-content">
                            <h3>Real-Time Local Analytics</h3>
                            <p>By executing lightweight vision models on-edge or on local servers, Sentinel prevents highly sensitive video streams from being transmitted to third-party databases, adhering strictly to compliance paradigms.</p>
                        </div>
                    </div>
                    <div className="lp-h-card">
                        <div className="lp-h-img h-img-2">
                            <div className="lp-h-overlay">Dynamic Command Center</div>
                        </div>
                        <div className="lp-h-content">
                            <h3>Adaptive Dashboard</h3>
                            <p>Command operators receive cross-referenced, categorized incident logs instantly in a deeply glassmorphic, ultra-responsive dashboard, drastically reducing incident analysis time.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ARCHITECTURE SECTION */}
            <section id="architecture" className="lp-features">
                <div className="lp-sec-hdr">
                    <h2>Technical <span className="lp-text-gradient">Architecture</span></h2>
                    <p>End-to-end data pipeline engineered for maximum velocity and zero latency.</p>
                </div>
                <div className="lp-grid-arch">
                    <div className="lp-arch-card">
                        <div className="lp-a-num">01</div>
                        <h3>Ingestion Layer</h3>
                        <p>Simultaneously captures up to 64 high-definition RTP/RTSP IP camera streams natively decoding through GPU-accelerated pipelines.</p>
                    </div>
                    <div className="lp-arch-card">
                        <div className="lp-a-num">02</div>
                        <h3>Neural Processing</h3>
                        <p>YOLOv8-Pose extracts human keypoints at exactly 60 FPS, while our custom LSTM recurrent networks sequence behaviors over time.</p>
                    </div>
                    <div className="lp-arch-card">
                        <div className="lp-a-num">03</div>
                        <h3>Logic Engine</h3>
                        <p>Threat models evaluate biomechanical risk. Confidence scores exceeding 85% trigger immediate lock-on and escalation protocols.</p>
                    </div>
                    <div className="lp-arch-card">
                        <div className="lp-a-num">04</div>
                        <h3>Response Dispatch</h3>
                        <p>Automated integration with local police databases, Twilio SMS networks, and internal command center dashboards in milliseconds.</p>
                    </div>
                </div>
            </section>

            {/* CREDITS FOOTER */}
            <footer className="lp-footer">
                <div className="lp-footer-content">
                    <div className="lp-f-brand">
                        <div className="lp-brand-logo">🛡️</div>
                        <span className="lp-brand-name">Sentinel AI</span>
                    </div>
                    <p className="lp-f-desc">A Predictive Threat Detection platform designed to empower command centers and protect citizens through ethical, highly secure Visual Analytics.</p>
                    <div className="lp-f-links">
                        <a href="#">Privacy Protocol</a>
                        <a href="#">Architecture Brief</a>
                        <a href="#">System Operations</a>
                    </div>
                </div>
                <div className="lp-f-bottom">
                    <p>© {new Date().getFullYear()} Sentinel AI Research Division. All neural weights and system architectures strictly classified.</p>
                </div>
            </footer>

            {/* LOGIN MODAL OVERLAY */}
            <div className={`lp-modal ${isModalOpen ? 'active' : ''}`}>
                <div className="lp-backdrop" onClick={() => setIsModalOpen(false)}></div>
                <div className="lp-m-card lp-glass-heavy" id="lp-modal-card">
                    <button className="lp-close" onClick={() => setIsModalOpen(false)}>×</button>
                    
                    <div className="lp-form-hdr">
                        <div className="lp-logo-lg">🛡️</div>
                        <h2>Secure Login</h2>
                        <p>Command Center Authentication</p>
                    </div>
                    
                    <form onSubmit={handleSubmit}>
                        <div className="lp-fg">
                            <label>Operator Clearance ID</label>
                            <input 
                                type="text" 
                                placeholder="Enter Username..." 
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                            />
                        </div>
                        <div className="lp-fg">
                            <label>Biometric / Passphrase</label>
                            <input 
                                type="password" 
                                placeholder="••••••••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            />
                        </div>
                        
                        {error && (
                            <div className="lp-err">
                                <span>⚠️</span> <span>{error}</span>
                            </div>
                        )}
                        
                        <button type="submit" className="lp-btn lp-btn-primary full-width" style={{width: '100%', padding:'14px'}} disabled={loading}>
                            {loading ? 'Processing...' : 'Authenticate Session'}
                        </button>
                    </form>

                    {/* Quick Demo Fillers */}
                    <div className="lp-demo-box">
                        <div className="lp-demo-hdr">Override Presets (Demo)</div>
                        {DEMOS.map(([u, p, r]) => (
                            <div key={u} className="lp-demo-row" onClick={() => { setUsername(u); setPassword(p); }}>
                                <span style={{color: 'var(--lp-cyan)'}}>{u}</span>
                                <span style={{color: 'var(--lp-text-secondary)'}}>{r}</span>
                            </div>
                        ))}
                    </div>
                    
                    <div className="lp-m-ftr">
                        <p>Restricted System. Unauthorized access is strictly logged and prosecuted under Federal Code Title 18, Section 1030.</p>
                    </div>
                </div>
            </div>

        </div>
    );
}
