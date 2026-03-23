import React, { useRef, useEffect, useState, useContext, useCallback } from 'react';
import axios from 'axios';
import { ToastContext } from '../App';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4005';
const FRAME_INTERVAL_MS = 150;

const RISK_LEVELS = { High: 'high', Medium: 'medium', Low: 'low' };

export default function WebcamStream({ token }) {
    const toast = useContext(ToastContext);
    const videoRef      = useRef(null);
    const canvasRef     = useRef(null);
    const overlayRef    = useRef(null);
    const streamRef     = useRef(null);
    const streamingRef  = useRef(false);
    const locationRef   = useRef(null);
    const sessionIdRef  = useRef(null);

    const highRiskStart    = useRef(null);
    const lastAlertTime    = useRef(0);
    const riskDropTime     = useRef(null);
    const hasAlerteRef     = useRef(false);
    const mediaRecorderRef = useRef(null);
    const recordedChunks   = useRef([]);

    const [isStreaming, setIsStreaming] = useState(false);
    const [prediction,  setPrediction]  = useState(null);
    const [frameCount,  setFrameCount]  = useState(0);
    const [sessionTime, setSessionTime] = useState(0);
    const [demoMode,    setDemoMode]    = useState('None');

    const authHeader = { headers: { 'x-auth-token': token } };

    // ── Session timer ──────────────────────────────────────────
    useEffect(() => {
        let timer;
        if (isStreaming) {
            timer = setInterval(() => setSessionTime(t => t + 1), 1000);
        } else {
            setSessionTime(0);
        }
        return () => clearInterval(timer);
    }, [isStreaming]);

    const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

    // ── Geolocation ────────────────────────────────────────────
    const getLocation = () => {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                pos => { locationRef.current = { lat: pos.coords.latitude, lon: pos.coords.longitude }; },
                err => console.warn('GPS denied:', err.message)
            );
        }
    };

    // ── Demo mode toggle ───────────────────────────────────────
    const setDemoModeAPI = async (behavior) => {
        try {
            await axios.post(`${API}/api/webcam-proxy`, { __demo: behavior }, authHeader).catch(() => {});
            await axios.post('http://localhost:5000/demo_mode', { behavior });
            setDemoMode(behavior || 'None');
        } catch {}
    };

    // ── Draw bounding boxes ───────────────────────────────────
    const drawOverlays = useCallback((boxes, riskLevel) => {
        const canvas = overlayRef.current;
        const video  = videoRef.current;
        if (!canvas || !video) return;

        const ctx = canvas.getContext('2d');
        canvas.width  = video.clientWidth;
        canvas.height = video.clientHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!boxes?.length) return;

        const scaleX = canvas.width  / 300;
        const scaleY = canvas.height / 300;
        const color  = riskLevel === 'High' ? '#ff3a3a' : riskLevel === 'Medium' ? '#ffd60a' : '#00ff88';

        boxes.forEach(([x1, y1, x2, y2]) => {
            ctx.strokeStyle = color;
            ctx.lineWidth   = 2.5;
            ctx.strokeRect(x1 * scaleX, y1 * scaleY, (x2 - x1) * scaleX, (y2 - y1) * scaleY);

            ctx.fillStyle = color;
            ctx.font = 'bold 11px JetBrains Mono, monospace';
            ctx.fillText('PERSON', x1 * scaleX + 2, y1 * scaleY - 4);

            // Corner accents
            const cw = (x2 - x1) * scaleX;
            const ch = (y2 - y1) * scaleY;
            const cx1 = x1 * scaleX, cy1 = y1 * scaleY;
            const len = 10;
            [[cx1, cy1, 1, 1], [cx1 + cw, cy1, -1, 1], [cx1, cy1 + ch, 1, -1], [cx1 + cw, cy1 + ch, -1, -1]].forEach(([x, y, dx, dy]) => {
                ctx.beginPath();
                ctx.moveTo(x, y); ctx.lineTo(x + dx * len, y);
                ctx.moveTo(x, y); ctx.lineTo(x, y + dy * len);
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
                ctx.stroke();
            });
        });
    }, []);

    // ── Main prediction loop ───────────────────────────────────
    const processFrame = useCallback(async () => {
        if (!videoRef.current || !streamingRef.current) return;
        const canvas = canvasRef.current;
        const video  = videoRef.current;

        if (canvas && video && video.readyState === 4) {
            canvas.width = 300; canvas.height = 300;
            canvas.getContext('2d').drawImage(video, 0, 0, 300, 300);
            const base64Frame = canvas.toDataURL('image/jpeg', 0.8);

            try {
                const res = await axios.post(`${API}/api/webcam-proxy`, {
                    frame: base64Frame,
                    location: locationRef.current,
                    session_id: sessionIdRef.current,
                }, authHeader);

                const pred = res.data;
                setPrediction(pred);
                drawOverlays(pred.boxes, pred.risk);
                setFrameCount(c => c + 1);

                // ── Alert logic ──
                const isViolent = pred.risk === 'High' &&
                    ['Fight', 'Assault', 'Violence'].some(k => pred.class?.includes(k));

                if (isViolent) {
                    riskDropTime.current = null;
                    if (!highRiskStart.current) {
                        if (Date.now() - lastAlertTime.current >= 10000) {
                            highRiskStart.current = Date.now();
                            startRecording();
                        }
                    } else if (Date.now() - highRiskStart.current > 3000 && !hasAlerteRef.current) {
                        hasAlerteRef.current = true;
                        lastAlertTime.current = Date.now();
                        speakAlert(pred.class);
                        stopRecording(true, pred.class);
                    }
                } else {
                    if (highRiskStart.current) {
                        if (!riskDropTime.current) riskDropTime.current = Date.now();
                        if (Date.now() - riskDropTime.current > 1500) {
                            stopRecording(false);
                            highRiskStart.current = null;
                            hasAlerteRef.current  = false;
                            riskDropTime.current  = null;
                        }
                    }
                }
            } catch (err) {
                setPrediction(null);
            }
        }

        if (streamingRef.current) {
            setTimeout(() => requestAnimationFrame(processFrame), FRAME_INTERVAL_MS);
        }
    }, [drawOverlays, token]);

    const speakAlert = (cls) => {
        const msg = new SpeechSynthesisUtterance(`Alert: ${cls || 'Violence'} detected`);
        msg.rate = 1.0; msg.pitch = 1.1; msg.volume = 1.0;
        window.speechSynthesis.speak(msg);
        toast?.(`🚨 ALERT: ${cls} detected — voice alert triggered`, 'error', 8000);
    };

    // ── MediaRecorder helpers ──────────────────────────────────
    const startRecording = () => {
        if (!streamRef.current) return;
        recordedChunks.current = [];
        try {
            const opts = MediaRecorder.isTypeSupported('video/webm; codecs=vp9')
                ? { mimeType: 'video/webm; codecs=vp9' } : { mimeType: 'video/webm' };
            const rec = new MediaRecorder(streamRef.current, opts);
            rec.ondataavailable = e => { if (e.data.size > 0) recordedChunks.current.push(e.data); };
            rec.onstop = () => uploadClip();
            rec.start();
            mediaRecorderRef.current = rec;
        } catch (e) { console.error('Recorder error:', e); }
    };

    const stopRecording = (upload = true, cls = '') => {
        if (!upload) { recordedChunks.current = []; }
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
    };

    const uploadClip = async () => {
        if (!recordedChunks.current.length) return;
        const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
        const form = new FormData();
        form.append('video', new File([blob], `incident_${Date.now()}.webm`, { type: 'video/webm' }));
        form.append('videoName',  'Live Auto-Capture');
        form.append('behavior',   (prediction?.class || 'Aggression') + ' (Auto-Detected)');
        form.append('riskLevel',  'High');
        form.append('timestamp',  new Date().toISOString());
        try {
            await axios.post(`${API}/api/report-incident`, form, authHeader);
            toast?.('📹 Incident clip uploaded to dashboard', 'info', 5000);
        } catch {}
    };

    // ── Camera controls ────────────────────────────────────────
    const startStream = async () => {
        getLocation();
        sessionIdRef.current = `session_${Math.random().toString(36).substr(2,9)}_${Date.now()}`;
        stopStream();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setIsStreaming(true);
                streamingRef.current = true;
                requestAnimationFrame(processFrame);
                toast?.('📷 Camera started — AI surveillance active', 'success');
            }
        } catch (err) {
            toast?.('Cannot access webcam: ' + err.message, 'error');
        }
    };

    const stopStream = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
        mediaRecorderRef.current = null;
        recordedChunks.current   = [];
        streamingRef.current = false;
        setIsStreaming(false);
        setPrediction(null);
        const ctx = overlayRef.current?.getContext('2d');
        ctx?.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
    };

    useEffect(() => () => stopStream(), []);

    const pred     = prediction;
    const riskKey  = RISK_LEVELS[pred?.risk] || 'low';
    const barWidth = { high: '100%', medium: '60%', low: '20%' }[riskKey];

    // Manual report
    const handleReport = async () => {
        if (!pred) return;
        try {
            await axios.post(`${API}/api/report-case`, {
                videoName: 'Live Webcam Feed',
                behavior:  `${pred.class} (Manual Report)`,
                riskLevel: pred.risk || 'High',
                location:  locationRef.current,
            }, authHeader);
            toast?.('Incident manually reported to dashboard', 'success');
        } catch { toast?.('Report failed', 'error'); }
    };

    return (
        <div className="webcam-page">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div className="page-title">📷 Live Surveillance Stream</div>
                    <div className="page-subtitle">Real-time AI behavioral analysis via YOLOv8 + CNN</div>
                </div>
                {isStreaming && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        🕒 {fmtTime(sessionTime)} &nbsp;·&nbsp; {frameCount} frames
                    </div>
                )}
            </div>

            <div className="webcam-layout">
                {/* Camera Feed */}
                <div className="camera-panel">
                    <div className="camera-header">
                        <span className="camera-label">📡 CAM-01 · PRIMARY</span>
                        {isStreaming && (
                            <span className="rec-badge">
                                <span className="rec-dot" /> LIVE
                            </span>
                        )}
                    </div>

                    <div className="stream-wrapper">
                        <video ref={videoRef} autoPlay playsInline muted className="video-feed"
                            style={{ display: isStreaming ? 'block' : 'none' }} />
                        <canvas ref={canvasRef}   style={{ display: 'none' }} />
                        <canvas ref={overlayRef}  className="overlay-canvas" />

                        {!isStreaming && (
                            <div className="no-signal">
                                <div className="no-signal-icon">📷</div>
                                <div>No Signal</div>
                                <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>
                                    Click START CAMERA to begin surveillance
                                </div>
                            </div>
                        )}

                        {/* Risk overlay */}
                        {pred && (
                            <div className="risk-overlay">
                                <div className={`risk-pill ${riskKey}`}>
                                    {riskKey === 'high' ? '🔴' : riskKey === 'medium' ? '🟡' : '🟢'}
                                    &nbsp;{pred.class} · {pred.risk}
                                </div>
                                {pred.reason && (
                                    <div className="insight-pill">💡 {pred.reason}</div>
                                )}
                            </div>
                        )}

                        {/* HUD */}
                        {pred && (
                            <div className="hud-overlay">
                                <div className="hud-stat">👥 {pred.persons ?? 0} persons</div>
                                <div className="hud-stat">📊 {Math.round((pred.confidence || 0) * 100)}% conf.</div>
                                <div className="hud-stat">🕒 {FRAME_INTERVAL_MS}ms/frame</div>
                            </div>
                        )}
                    </div>

                    {/* Controls */}
                    <div className="cam-controls">
                        {!isStreaming ? (
                            <button className="btn btn-primary" style={{ flex: 1 }} onClick={startStream}>
                                ▶ START CAMERA
                            </button>
                        ) : (
                            <>
                                <button className="btn btn-danger" onClick={stopStream}>⏹ STOP</button>
                                <button className="btn btn-ghost" onClick={handleReport}
                                    disabled={!pred || pred.class === 'Normal'} style={{ flex: 1 }}>
                                    📋 Manual Report
                                </button>
                            </>
                        )}
                    </div>

                    {/* Demo mode bar */}
                    <div className="demo-bar">
                        <div className="demo-label">Demo / Test Mode</div>
                        <div className="demo-btns">
                            {['None', 'Fighting', 'Assault', 'Normal'].map(b => (
                                <button key={b}
                                    className={`btn btn-xs ${demoMode === b ? 'btn-primary' : 'btn-ghost'}`}
                                    onClick={() => setDemoModeAPI(b === 'None' ? null : b)}
                                >
                                    {b}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* AI Analysis Panel */}
                <div className="ai-panel">
                    <div className="panel-header" style={{ padding: '12px 16px' }}>
                        <div className="panel-title" style={{ fontSize: '0.9rem' }}>
                            <span className="title-accent">◆</span> AI Analysis
                        </div>
                        <div className={`status-badge ${isStreaming ? 'status-investigating' : 'status-pending'}`}>
                            {isStreaming ? '⚡ ACTIVE' : '○ IDLE'}
                        </div>
                    </div>

                    <div className="ai-body">
                        {/* Risk Meter */}
                        <div className="risk-meter-container">
                            <div className="risk-meter-label">Risk Level</div>
                            <div className={`risk-meter-value ${riskKey}`}>
                                {pred ? pred.risk.toUpperCase() : '—'}
                            </div>
                            <div className="risk-bar-track">
                                <div className={`risk-bar-fill ${riskKey}`} style={{ width: pred ? barWidth : '0%' }} />
                            </div>
                        </div>

                        {/* Stats */}
                        {[
                            ['CLASS',      pred?.class       || '—'],
                            ['CONFIDENCE', pred ? `${Math.round((pred.confidence || 0) * 100)}%` : '—'],
                            ['PERSONS',    pred?.persons !== undefined ? pred.persons : '—'],
                            ['MOTION',     pred?.motion     !== undefined ? pred.motion.toFixed(1) : '—'],
                            ['TEMP SCORE', pred?.threshold  !== undefined ? pred.threshold : '—'],
                        ].map(([k, v]) => (
                            <div className="ai-stat-row" key={k}>
                                <span className="ai-stat-key">{k}</span>
                                <span className="ai-stat-val">{v}</span>
                            </div>
                        ))}

                        {/* Insight */}
                        {pred?.reason && (
                            <div style={{
                                padding: '10px 12px',
                                background: 'var(--bg-elevated)',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border)',
                                borderLeft: `3px solid ${riskKey === 'high' ? 'var(--red)' : riskKey === 'medium' ? 'var(--amber)' : 'var(--green)'}`,
                                fontSize: '0.76rem',
                                color: 'var(--text-secondary)',
                                lineHeight: 1.5,
                            }}>
                                <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>💡 Insight:</span>
                                <br />{pred.reason}
                            </div>
                        )}

                        {/* Debug probs */}
                        {pred?.debug_probs && (
                            <div style={{ display: 'flex', gap: 6 }}>
                                {Object.entries(pred.debug_probs).map(([cls, prob]) => (
                                    <div key={cls} style={{
                                        flex: 1, textAlign: 'center',
                                        padding: '6px 4px',
                                        background: 'var(--bg-elevated)',
                                        borderRadius: 'var(--radius-sm)',
                                        border: '1px solid var(--border)',
                                    }}>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-muted)', marginBottom: 3 }}>
                                            {cls.toUpperCase()}
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--cyan)' }}>
                                            {Math.round(prob * 100)}%
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* GPS */}
                        {locationRef.current && (
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                📍 {locationRef.current.lat?.toFixed(5)}, {locationRef.current.lon?.toFixed(5)}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
