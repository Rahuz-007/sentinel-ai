import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import axios from 'axios';
import { ToastContext } from '../App';

const API = 'http://localhost:4005';
const FRAME_MS = 500; // 2fps per camera (lightweight)

const RISK_COLOR = { High:'#ef4444', Medium:'#f59e0b', Low:'#22c55e' };

const DEFAULT_CAMERAS = [
    { id:'cam_1', label:'Camera 1', type:'webcam',   src:'',    active:false },
    { id:'cam_2', label:'Camera 2', type:'ip',       src:'',    active:false },
    { id:'cam_3', label:'Camera 3', type:'ip',       src:'',    active:false },
    { id:'cam_4', label:'Camera 4', type:'webcam',   src:'',    active:false },
];

function CameraSlot({ cam, onUpdate, token }) {
    const toast       = useContext(ToastContext);
    const videoRef    = useRef(null);
    const canvasRef   = useRef(null);
    const streamRef   = useRef(null);
    const timerRef    = useRef(null);
    const [streaming, setStreaming]   = useState(false);
    const [prediction, setPrediction] = useState(null);
    const [expanded, setExpanded]     = useState(false);
    const [ipUrl, setIpUrl]           = useState(cam.src||'');
    const authHeader = { headers: { 'x-auth-token': token } };

    const capture = useCallback(async () => {
        if (!videoRef.current || !canvasRef.current) return;
        const c = canvasRef.current;
        c.width = 224; c.height = 224;
        c.getContext('2d').drawImage(videoRef.current, 0, 0, 224, 224);
        const frame = c.toDataURL('image/jpeg', 0.75);
        try {
            const r = await axios.post(`${API}/api/webcam-proxy`, {
                frame, session_id: cam.id,
            }, authHeader);
            setPrediction(r.data);
        } catch {}
    }, [cam.id, token]);

    const start = async () => {
        try {
            let stream;
            if (cam.type === 'webcam') {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const vdevices = devices.filter(d => d.kind === 'videoinput');
                const idx = parseInt(cam.id.split('_')[1])-1;
                const deviceId = vdevices[idx]?.deviceId;
                stream = await navigator.mediaDevices.getUserMedia({
                    video: deviceId ? { deviceId: { exact: deviceId } } : true
                });
            }
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }
            setStreaming(true);
            timerRef.current = setInterval(capture, FRAME_MS);
        } catch(e) {
            toast?.(`Camera ${cam.label}: ${e.message}`, 'error');
        }
    };

    const stop = () => {
        clearInterval(timerRef.current);
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;
        setStreaming(false);
        setPrediction(null);
    };

    useEffect(() => () => stop(), []);

    const risk  = prediction?.risk || 'Low';
    const cls   = prediction?.class || '—';
    const isViolent = cls === 'Fighting' || cls === 'Assault';

    return (
        <div style={{
            border: `2px solid ${isViolent ? '#ef4444' : 'var(--border)'}`,
            borderRadius: 12,
            overflow:'hidden',
            background:'var(--surface-1)',
            transition:'border-color 0.3s',
            boxShadow: isViolent ? '0 0 16px rgba(239,68,68,0.3)' : 'none',
        }}>
            {/* Header */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'8px 12px', background:'var(--surface-2)', borderBottom:'1px solid var(--border)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%',
                        background: streaming ? '#22c55e' : '#4b5563',
                        boxShadow: streaming ? '0 0 6px #22c55e' : 'none' }} />
                    <span style={{ fontSize:'0.78rem', fontWeight:600, color:'var(--text-primary)' }}>
                        {cam.label}
                    </span>
                    {cam.type === 'ip' && (
                        <span style={{ fontSize:'0.6rem', color:'var(--cyan)',
                            fontFamily:'var(--font-mono)', background:'rgba(6,182,212,0.1)',
                            padding:'1px 5px', borderRadius:3 }}>IP/RTSP</span>
                    )}
                </div>
                <div style={{ display:'flex', gap:6 }}>
                    {!streaming
                        ? <button className="btn btn-xs btn-ghost" onClick={start}>▶ Start</button>
                        : <button className="btn btn-xs btn-danger" onClick={stop}>⏹ Stop</button>
                    }
                    <button className="btn btn-xs btn-ghost"
                        onClick={() => setExpanded(e=>!e)}>{expanded?'▲':'▼'}</button>
                </div>
            </div>

            {/* Video feed */}
            <div style={{ position:'relative', background:'#000', aspectRatio:'16/9' }}>
                <video ref={videoRef} muted playsInline autoPlay
                    style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                <canvas ref={canvasRef} style={{ display:'none' }} />

                {!streaming && (
                    <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
                        alignItems:'center', justifyContent:'center', gap:8 }}>
                        <div style={{ fontSize:'2rem' }}>📷</div>
                        <div style={{ fontSize:'0.72rem', color:'var(--text-dim)' }}>Camera offline</div>
                        {cam.type==='ip' && (
                            <input
                                value={ipUrl}
                                onChange={e => setIpUrl(e.target.value)}
                                placeholder="rtsp://192.168.1.x/stream"
                                style={{ fontSize:'0.65rem', padding:'4px 8px', borderRadius:4,
                                    border:'1px solid var(--border)', background:'var(--surface-2)',
                                    color:'var(--text-primary)', width:'80%', textAlign:'center' }}
                            />
                        )}
                    </div>
                )}

                {/* Risk overlay */}
                {streaming && prediction && (
                    <div style={{ position:'absolute', top:6, right:6,
                        background:'rgba(0,0,0,0.75)', borderRadius:6, padding:'4px 8px',
                        border:`1px solid ${RISK_COLOR[risk]}`,
                        boxShadow:`0 0 8px ${RISK_COLOR[risk]}40` }}>
                        <div style={{ fontSize:'0.65rem', fontFamily:'var(--font-mono)',
                            color:RISK_COLOR[risk], fontWeight:700 }}>
                            {isViolent ? '🚨 ' : ''}{cls}
                        </div>
                        <div style={{ fontSize:'0.58rem', color:'var(--text-dim)' }}>
                            {prediction.persons} persons · {prediction.motion?.toFixed(1)} motion
                        </div>
                    </div>
                )}

                {/* ALERT banner */}
                {isViolent && (
                    <div style={{ position:'absolute', bottom:0, left:0, right:0,
                        background:'rgba(239,68,68,0.9)', color:'#fff',
                        textAlign:'center', padding:'4px', fontSize:'0.72rem',
                        fontWeight:700, animation:'pulse 1s infinite' }}>
                        🚨 {cls.toUpperCase()} DETECTED
                    </div>
                )}
            </div>

            {/* Expandable details */}
            {expanded && streaming && prediction && (
                <div style={{ padding:'10px 12px', fontSize:'0.7rem',
                    fontFamily:'var(--font-mono)', color:'var(--text-secondary)',
                    borderTop:'1px solid var(--border)', background:'var(--surface-2)' }}>
                    <div>🎯 <b>Class:</b> {prediction.class}</div>
                    <div>📊 <b>Confidence:</b> {(prediction.confidence*100).toFixed(1)}%</div>
                    <div>⚡ <b>Temporal:</b> {prediction.threshold}</div>
                    <div>💡 <b>Reason:</b> {prediction.reason}</div>
                    {prediction.pose_signals?.length > 0 && (
                        <div>🦾 <b>Pose:</b> {prediction.pose_signals.slice(0,2).join(', ')}</div>
                    )}
                    {prediction.screen_mode && (
                        <div style={{ color:'#f59e0b' }}>📱 Screen mode active</div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function MultiCamera({ token }) {
    const [cameras, setCameras] = useState(DEFAULT_CAMERAS);
    const [layout, setLayout]   = useState('2x2'); // '2x2' | '1x4' | '2x1'

    const updateCam = (id, patch) => {
        setCameras(prev => prev.map(c => c.id===id ? {...c,...patch} : c));
    };

    const addCamera = () => {
        if (cameras.length >= 8) return;
        const id = `cam_${cameras.length+1}`;
        setCameras(prev => [...prev, { id, label:`Camera ${cameras.length+1}`,
            type:'ip', src:'', active:false }]);
    };

    const cols = layout === '1x4' ? 1 : layout === '4x1' ? 4 : 2;

    return (
        <div style={{ padding:'24px 0' }}>
            <div className="dashboard-header">
                <div>
                    <div className="page-title">📷 Multi-Camera Grid</div>
                    <div className="page-subtitle">
                        Monitor up to 8 cameras simultaneously with per-feed AI analysis
                    </div>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    {/* Layout selector */}
                    <div style={{ display:'flex', gap:4 }}>
                        {[['2x2','▩'],['4x1','▦'],['1x4','▥']].map(([l,icon])=>(
                            <button key={l}
                                className={`btn btn-sm ${layout===l?'btn-primary':'btn-ghost'}`}
                                onClick={()=>setLayout(l)} title={l}>
                                {icon} {l}
                            </button>
                        ))}
                    </div>
                    <button className="btn btn-sm btn-ghost" onClick={addCamera}
                        disabled={cameras.length>=8}>
                        + Add Camera
                    </button>
                </div>
            </div>

            {/* Grid */}
            <div style={{
                display:'grid',
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gap: 16,
            }}>
                {cameras.map(cam => (
                    <CameraSlot key={cam.id} cam={cam} onUpdate={updateCam} token={token} />
                ))}
            </div>

            <div style={{ marginTop:16, padding:'12px 16px', background:'var(--surface-1)',
                borderRadius:8, border:'1px solid var(--border)',
                fontSize:'0.72rem', color:'var(--text-dim)', lineHeight:1.7 }}>
                <b style={{ color:'var(--text-secondary)' }}>Tips:</b>
                &nbsp;• <b>Webcam</b> cameras use your device cameras (Camera 1 = first, Camera 4 = fourth).
                &nbsp;• <b>IP/RTSP</b> cameras: enter the stream URL (e.g. <code>rtsp://192.168.1.100/stream</code>).
                &nbsp;• Each camera runs an independent AI session with separate temporal tracking.
                &nbsp;• Each camera processes at 2fps to reduce CPU load. Increase FRAME_MS in code for faster.
            </div>
        </div>
    );
}
