import React, { useState, useContext, useRef } from 'react';
import axios from 'axios';
import { ToastContext } from '../App';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4005';

const RISK_COLOR = { High: 'red', Medium: 'amber', Low: 'green' };

export default function VideoUpload({ token }) {
    const toast = useContext(ToastContext);
    const fileRef = useRef(null);

    const [mode,       setMode]       = useState('upload'); // 'upload' | 'youtube'
    const [file,       setFile]       = useState(null);
    const [ytUrl,      setYtUrl]      = useState('');
    const [loading,    setLoading]    = useState(false);
    const [progress,   setProgress]   = useState(0);
    const [results,    setResults]    = useState(null);
    const [dragOver,   setDragOver]   = useState(false);

    const authHeader = { headers: { 'x-auth-token': token } };

    const handleFile = (f) => {
        if (!f) return;
        setFile(f);
        setResults(null);
        toast?.(`📁 File selected: ${f.name}`, 'info');
    };

    const handleDrop = (e) => {
        e.preventDefault(); setDragOver(false);
        handleFile(e.dataTransfer.files[0]);
    };

    const analyzeUpload = async () => {
        if (!file) { toast?.('Please select a video file first', 'warning'); return; }
        setLoading(true); setProgress(10); setResults(null);

        const form = new FormData();
        form.append('video', file);

        try {
            setProgress(30);
            const res = await axios.post(`${API}/api/analyze-video`, form, {
                ...authHeader,
                timeout: 180000,
                onUploadProgress: e => setProgress(Math.round((e.loaded / e.total) * 50)),
            });
            setProgress(100);
            setResults(res.data);
            toast?.(`✅ Analysis complete — Risk: ${res.data.summary?.risk_level}`, 'success');
        } catch (err) {
            toast?.(err.response?.data?.error || 'Analysis failed. Is the ML service running?', 'error');
        } finally {
            setLoading(false);
            setTimeout(() => setProgress(0), 1500);
        }
    };

    const analyzeYoutube = async () => {
        if (!ytUrl.trim()) { toast?.('Please enter a YouTube URL', 'warning'); return; }
        setLoading(true); setProgress(20); setResults(null);

        try {
            const res = await axios.post(`${API}/api/analyze-youtube`, { youtube_url: ytUrl }, {
                ...authHeader,
                timeout: 300000,
            });
            // Fake progress
            const t = setInterval(() => setProgress(p => Math.min(p + 5, 90)), 3000);
            setProgress(100);
            clearInterval(t);
            setResults(res.data);
            toast?.(`✅ YouTube analysis complete — Risk: ${res.data.summary?.risk_level}`, 'success');
        } catch (err) {
            toast?.(err.response?.data?.error || 'YouTube analysis failed', 'error');
        } finally {
            setLoading(false);
            setTimeout(() => setProgress(0), 1500);
        }
    };

    const fmtTime = (s) => {
        if (s === undefined) return '—';
        const m = Math.floor(s / 60);
        const sec = Math.round(s % 60);
        return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
    };

    const summary = results?.summary;
    const events  = results?.events || [];

    return (
        <div className="upload-page">
            <div style={{ marginBottom: 24 }}>
                <div className="page-title">🎬 Video Intelligence</div>
                <div className="page-subtitle">Upload video files or analyze YouTube footage for behavioral risk assessment</div>
            </div>

            {/* Mode Tabs */}
            <div className="tab-group">
                <button className={`tab-btn ${mode === 'upload' ? 'active' : ''}`} onClick={() => { setMode('upload'); setResults(null); }}>
                    📁 Local Video Upload
                </button>
                <button className={`tab-btn ${mode === 'youtube' ? 'active' : ''}`} onClick={() => { setMode('youtube'); setResults(null); }}>
                    📺 YouTube URL Analysis
                </button>
            </div>

            <div className="panel">
                <div className="panel-body">
                    {/* Upload mode */}
                    {mode === 'upload' && (
                        <>
                            <div
                                className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
                                onClick={() => fileRef.current?.click()}
                                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleDrop}
                            >
                                <div className="drop-icon">📹</div>
                                {file ? (
                                    <>
                                        <div className="drop-text" style={{ color: 'var(--cyan)', fontWeight: 600 }}>
                                            ✅ {file.name}
                                        </div>
                                        <div className="drop-hint">{(file.size / 1024 / 1024).toFixed(1)} MB · Click to change</div>
                                    </>
                                ) : (
                                    <>
                                        <div className="drop-text">Drag & drop video here, or click to browse</div>
                                        <div className="drop-hint">Supports MP4, AVI, MOV, MKV, WebM · Max 500MB</div>
                                    </>
                                )}
                                <input
                                    ref={fileRef} type="file" accept="video/*"
                                    style={{ display: 'none' }}
                                    onChange={e => handleFile(e.target.files[0])}
                                />
                            </div>

                            {loading && (
                                <div style={{ marginTop: 12 }}>
                                    <div className="progress-bar">
                                        <div className="progress-fill" style={{ width: `${progress}%` }} />
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>
                                        {progress < 50 ? `Uploading... ${progress}%` : 'AI analyzing... please wait'}
                                    </div>
                                </div>
                            )}

                            <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                                <button
                                    className="btn btn-primary"
                                    style={{ flex: 1, justifyContent: 'center' }}
                                    onClick={analyzeUpload}
                                    disabled={loading || !file}
                                >
                                    {loading
                                        ? <><div className="spin" style={{ width: 14, height: 14, borderWidth: 2 }} /> Analyzing...</>
                                        : '🔍 ANALYZE VIDEO'}
                                </button>
                                {file && <button className="btn btn-ghost" onClick={() => { setFile(null); setResults(null); }}>✕ Clear</button>}
                            </div>
                        </>
                    )}

                    {/* YouTube mode */}
                    {mode === 'youtube' && (
                        <>
                            <div style={{ marginBottom: 12 }}>
                                <label className="form-label">YouTube Video URL</label>
                                <div className="url-input-wrap">
                                    <input
                                        className="form-control"
                                        placeholder="https://www.youtube.com/watch?v=..."
                                        value={ytUrl}
                                        onChange={e => setYtUrl(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') analyzeYoutube(); }}
                                    />
                                </div>
                            </div>

                            {loading && (
                                <div style={{ marginBottom: 12 }}>
                                    <div className="progress-bar">
                                        <div className="progress-fill" style={{ width: `${progress}%` }} />
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>
                                        Downloading and analyzing YouTube video...
                                    </div>
                                </div>
                            )}

                            <button
                                className="btn btn-primary"
                                style={{ width: '100%', justifyContent: 'center' }}
                                onClick={analyzeYoutube}
                                disabled={loading || !ytUrl.trim()}
                            >
                                {loading
                                    ? <><div className="spin" style={{ width: 14, height: 14, borderWidth: 2 }} /> Analyzing...</>
                                    : '📺 ANALYZE YOUTUBE VIDEO'}
                            </button>

                            <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                    ℹ️ Video is downloaded at 360p for fast processing. Analysis may take 1–5 minutes for long videos.
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Results */}
            {results && (
                <div className="results-panel">
                    {/* Summary */}
                    <div className="panel" style={{ marginBottom: 16 }}>
                        <div className="panel-header">
                            <div className="panel-title"><span className="title-accent">◆</span> Analysis Summary</div>
                        </div>
                        <div className="panel-body">
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                                <div className={`stat-card ${RISK_COLOR[summary?.risk_level] || 'cyan'}`}>
                                    <div className="stat-label">Risk Level</div>
                                    <div className="stat-value" style={{ fontSize: '1.5rem' }}>{summary?.risk_level || '—'}</div>
                                </div>
                                <div className="stat-card cyan">
                                    <div className="stat-label">Duration</div>
                                    <div className="stat-value" style={{ fontSize: '1.5rem' }}>{fmtTime(summary?.total_duration)}</div>
                                </div>
                                <div className="stat-card amber">
                                    <div className="stat-label">Events Found</div>
                                    <div className="stat-value" style={{ fontSize: '1.5rem' }}>{summary?.event_count ?? 0}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Timeline */}
                    {events.length > 0 && (
                        <div className="panel">
                            <div className="panel-header">
                                <div className="panel-title"><span className="title-accent">◆</span> Incident Timeline</div>
                            </div>
                            <div className="panel-body">
                                <div className="timeline">
                                    {events.map((ev, i) => (
                                        <div key={i} className={`timeline-event ${ev.type?.toLowerCase()}`}>
                                            <div className="timeline-time">
                                                {fmtTime(ev.start_time)} → {fmtTime(ev.end_time || ev.start_time)}
                                            </div>
                                            <div className="timeline-type">⚠️ {ev.type}</div>
                                            <div className="timeline-conf">
                                                {Math.round((ev.avg_confidence || 0) * 100)}% avg conf.
                                            </div>
                                            <span className={`badge badge-${ev.avg_confidence > 0.6 ? 'high' : 'medium'}`}>
                                                {ev.count} frames
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {events.length === 0 && (
                        <div className="empty-state" style={{ padding: 40 }}>
                            <div className="empty-icon">✅</div>
                            <div className="empty-text">No violent incidents detected in this footage</div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
