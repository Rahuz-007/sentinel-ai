import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { ToastContext } from '../App';

const API = 'http://localhost:4005';

const COLORS = {
    Fighting:           '#ef4444',
    Assault:            '#f97316',
    'Suspicious Activity': '#eab308',
    'Aggressive Behavior': '#a855f7',
    Normal:             '#22c55e',
};

const BAR_COLORS = ['#06b6d4','#8b5cf6','#f59e0b','#10b981','#ef4444','#ec4899'];

function MiniBar({ label, value, max, color }) {
    const pct = max > 0 ? (value / max) * 100 : 0;
    return (
        <div style={{ marginBottom: 10 }}>
            <div style={{ display:'flex', justifyContent:'space-between',
                fontSize:'0.75rem', color:'var(--text-secondary)', marginBottom: 4 }}>
                <span>{label}</span>
                <span style={{ color:'var(--text-primary)', fontWeight:600 }}>{value}</span>
            </div>
            <div style={{ background:'var(--surface-2)', borderRadius: 4, height: 8, overflow:'hidden' }}>
                <div style={{ width:`${pct}%`, height:'100%', background: color,
                    borderRadius: 4, transition:'width 0.6s ease' }} />
            </div>
        </div>
    );
}

function StatTile({ icon, label, value, sub, color }) {
    return (
        <div className="stat-card" style={{ borderTop:`3px solid ${color}` }}>
            <div style={{ fontSize:'1.8rem', marginBottom: 6 }}>{icon}</div>
            <div style={{ fontSize:'2rem', fontWeight:800, color, fontFamily:'var(--font-mono)' }}>
                {value ?? '—'}
            </div>
            <div style={{ fontSize:'0.78rem', color:'var(--text-secondary)', fontWeight:600 }}>{label}</div>
            {sub && <div style={{ fontSize:'0.68rem', color:'var(--text-dim)', marginTop: 2 }}>{sub}</div>}
        </div>
    );
}

export default function Analytics({ token }) {
    const toast  = useContext(ToastContext);
    const [alerts, setAlerts]  = useState([]);
    const [loading, setLoading] = useState(true);
    const authHeader = { headers: { 'x-auth-token': token } };

    useEffect(() => {
        const load = async () => {
            try {
                const r = await axios.get(`${API}/api/alerts`, authHeader);
                setAlerts(r.data || []);
            } catch { toast?.('Failed to load analytics data', 'error'); }
            finally   { setLoading(false); }
        };
        load();
    }, []);

    // ── Computed stats ────────────────────────────────────────
    const total    = alerts.length;
    const highRisk = alerts.filter(a => a.riskLevel === 'High').length;
    const resolved = alerts.filter(a => a.status === 'Resolved').length;
    const pending  = alerts.filter(a => a.status === 'Pending').length;
    const today    = alerts.filter(a => {
        const d = new Date(a.timestamp);
        const n = new Date();
        return d.getDate()===n.getDate() && d.getMonth()===n.getMonth();
    }).length;

    // ── Behavior breakdown ────────────────────────────────────
    const behaviorMap = {};
    alerts.forEach(a => {
        const b = a.behavior || 'Unknown';
        behaviorMap[b] = (behaviorMap[b]||0) + 1;
    });
    const behaviorList = Object.entries(behaviorMap)
        .sort((a,b) => b[1]-a[1]);
    const maxB = behaviorList[0]?.[1] || 1;

    // ── Status breakdown ──────────────────────────────────────
    const statusMap = {};
    alerts.forEach(a => {
        const s = a.status || 'Pending';
        statusMap[s] = (statusMap[s]||0)+1;
    });

    // ── Hour-of-day distribution ──────────────────────────────
    const hourMap = Array(24).fill(0);
    alerts.forEach(a => {
        const h = new Date(a.timestamp).getHours();
        if (!isNaN(h)) hourMap[h]++;
    });
    const maxHour = Math.max(...hourMap, 1);

    // ── Precinct breakdown ────────────────────────────────────
    const precinctMap = {};
    alerts.forEach(a => {
        const p = a.precinct || 'Unknown';
        precinctMap[p] = (precinctMap[p]||0)+1;
    });
    const precinctList = Object.entries(precinctMap)
        .sort((a,b)=>b[1]-a[1]).slice(0,6);
    const maxP = precinctList[0]?.[1]||1;

    // ── Weekly trend ──────────────────────────────────────────
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dayMap = Array(7).fill(0);
    alerts.forEach(a => {
        const d = new Date(a.timestamp).getDay();
        if (!isNaN(d)) dayMap[d]++;
    });
    const maxDay = Math.max(...dayMap, 1);

    if (loading) return (
        <div className="loading-state">
            <div className="spin" /> Loading analytics...
        </div>
    );

    return (
        <div style={{ padding:'24px 0' }}>
            {/* Header */}
            <div className="dashboard-header">
                <div>
                    <div className="page-title">📊 Analytics & Intelligence</div>
                    <div className="page-subtitle">Incident patterns, behavior trends, and operational insights</div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                    <div className="live-badge"><div className="status-dot"/>Live</div>
                    <span style={{ fontSize:'0.72rem', color:'var(--text-dim)',
                        fontFamily:'var(--font-mono)', alignSelf:'center' }}>
                        {total} total incidents
                    </span>
                </div>
            </div>

            {/* KPI Row */}
            <div className="stats-bar" style={{ marginBottom: 24 }}>
                <StatTile icon="📋" label="Total Incidents"  value={total}    color="#06b6d4" />
                <StatTile icon="🚨" label="High Risk"        value={highRisk} color="#ef4444"
                    sub={`${total ? ((highRisk/total)*100).toFixed(0) : 0}% of total`} />
                <StatTile icon="📅" label="Today's Incidents" value={today}  color="#f59e0b" />
                <StatTile icon="✅" label="Resolved"         value={resolved} color="#22c55e"
                    sub={`${total ? ((resolved/total)*100).toFixed(0) : 0}% resolution rate`} />
                <StatTile icon="⏳" label="Pending"          value={pending}  color="#a855f7" />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 20, marginBottom: 20 }}>
                {/* Behavior Breakdown */}
                <div className="panel">
                    <div className="panel-header">
                        <div className="panel-title"><span className="title-accent">◆</span> Behavior Types</div>
                    </div>
                    <div style={{ padding:'16px 20px' }}>
                        {behaviorList.length === 0
                            ? <div style={{ color:'var(--text-dim)', textAlign:'center', padding:20 }}>No data</div>
                            : behaviorList.map(([b, count], i) => (
                                <MiniBar key={b} label={b} value={count} max={maxB}
                                    color={COLORS[b] || BAR_COLORS[i % BAR_COLORS.length]} />
                            ))
                        }
                    </div>
                </div>

                {/* Status Breakdown */}
                <div className="panel">
                    <div className="panel-header">
                        <div className="panel-title"><span className="title-accent">◆</span> Case Status</div>
                    </div>
                    <div style={{ padding:'16px 20px' }}>
                        {['Pending','Investigating','Verified','Reported','Resolved','False Alarm'].map((s,i) => (
                            <MiniBar key={s} label={s} value={statusMap[s]||0}
                                max={Math.max(...Object.values(statusMap),1)}
                                color={BAR_COLORS[i % BAR_COLORS.length]} />
                        ))}
                    </div>
                </div>
            </div>

            {/* Hour of Day Chart */}
            <div className="panel" style={{ marginBottom: 20 }}>
                <div className="panel-header">
                    <div className="panel-title">
                        <span className="title-accent">◆</span> Incidents by Hour of Day
                        <span style={{ fontSize:'0.7rem', color:'var(--text-dim)', marginLeft:8 }}>
                            (24-hour distribution)
                        </span>
                    </div>
                </div>
                <div style={{ padding:'20px 24px' }}>
                    <div style={{ display:'flex', alignItems:'flex-end', gap: 3,
                        height: 120, borderBottom:'1px solid var(--border)' }}>
                        {hourMap.map((count, h) => {
                            const pct = (count/maxHour)*100;
                            const isNight = h < 6 || h >= 22;
                            const isPeak  = count === maxHour && count > 0;
                            return (
                                <div key={h} style={{ flex:1, display:'flex',
                                    flexDirection:'column', alignItems:'center', gap:2 }}>
                                    {isPeak && (
                                        <div style={{ fontSize:'0.55rem', color:'#ef4444',
                                            fontFamily:'var(--font-mono)', fontWeight:700 }}>
                                            PEAK
                                        </div>
                                    )}
                                    <div
                                        title={`${h}:00 — ${count} incidents`}
                                        style={{
                                            width:'100%', height:`${pct || 2}%`,
                                            minHeight: 3,
                                            background: isPeak ? '#ef4444' : isNight ? '#4f46e5' : '#06b6d4',
                                            borderRadius:'3px 3px 0 0',
                                            opacity: count===0 ? 0.2 : 1,
                                            transition:'height 0.4s ease',
                                            cursor:'default',
                                        }}
                                    />
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between',
                        marginTop: 6, fontSize:'0.62rem', color:'var(--text-dim)',
                        fontFamily:'var(--font-mono)' }}>
                        {[0,3,6,9,12,15,18,21].map(h => (
                            <span key={h}>{String(h).padStart(2,'0')}:00</span>
                        ))}
                    </div>
                    <div style={{ display:'flex', gap:16, marginTop:10, fontSize:'0.68rem' }}>
                        <span style={{ color:'#4f46e5' }}>■ Night (22:00–06:00)</span>
                        <span style={{ color:'#06b6d4' }}>■ Day</span>
                        <span style={{ color:'#ef4444' }}>■ Peak hour</span>
                    </div>
                </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 20, marginBottom: 20 }}>
                {/* Weekly Trend */}
                <div className="panel">
                    <div className="panel-header">
                        <div className="panel-title"><span className="title-accent">◆</span> Weekly Pattern</div>
                    </div>
                    <div style={{ padding:'16px 20px' }}>
                        <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:90 }}>
                            {dayMap.map((count,d) => (
                                <div key={d} style={{ flex:1, display:'flex',
                                    flexDirection:'column', alignItems:'center', gap:4 }}>
                                    <div style={{
                                        width:'100%',
                                        height:`${(count/maxDay)*80 || 3}px`,
                                        background: count===maxDay && count>0 ? '#f59e0b' : '#8b5cf6',
                                        borderRadius:'4px 4px 0 0',
                                        opacity: count===0 ? 0.2 : 1,
                                        minHeight: 3,
                                    }} />
                                    <span style={{ fontSize:'0.65rem', color:'var(--text-dim)' }}>{days[d]}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Top Precincts */}
                <div className="panel">
                    <div className="panel-header">
                        <div className="panel-title"><span className="title-accent">◆</span> Top Precincts</div>
                    </div>
                    <div style={{ padding:'16px 20px' }}>
                        {precinctList.length === 0
                            ? <div style={{ color:'var(--text-dim)', textAlign:'center', padding:20 }}>
                                No precinct data yet
                              </div>
                            : precinctList.map(([p, count], i) => (
                                <MiniBar key={p} label={p.replace(' Precinct','').replace(' –',' ·')}
                                    value={count} max={maxP}
                                    color={BAR_COLORS[i % BAR_COLORS.length]} />
                            ))
                        }
                    </div>
                </div>
            </div>

            {/* Risk level over time */}
            <div className="panel">
                <div className="panel-header">
                    <div className="panel-title"><span className="title-accent">◆</span> Risk Level Distribution
                    </div>
                </div>
                <div style={{ padding:'20px 24px', display:'flex', gap: 24, flexWrap:'wrap' }}>
                    {['High','Medium','Low'].map((r,i) => {
                        const cnt = alerts.filter(a=>a.riskLevel===r).length;
                        const pct = total ? ((cnt/total)*100).toFixed(1) : '0';
                        const colors = ['#ef4444','#f59e0b','#22c55e'];
                        return (
                            <div key={r} style={{ display:'flex', alignItems:'center', gap:12, flex:1 }}>
                                <div style={{ position:'relative', width:80, height:80 }}>
                                    <svg viewBox="0 0 36 36" style={{ transform:'rotate(-90deg)' }}>
                                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                            fill="none" stroke="var(--surface-2)" strokeWidth="3" />
                                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                            fill="none" stroke={colors[i]} strokeWidth="3"
                                            strokeDasharray={`${pct}, 100`} />
                                    </svg>
                                    <div style={{ position:'absolute', inset:0, display:'flex',
                                        alignItems:'center', justifyContent:'center',
                                        fontSize:'0.8rem', fontWeight:700, color:colors[i],
                                        fontFamily:'var(--font-mono)' }}>
                                        {pct}%
                                    </div>
                                </div>
                                <div>
                                    <div style={{ color:colors[i], fontWeight:700, fontSize:'1.1rem' }}>{cnt}</div>
                                    <div style={{ color:'var(--text-secondary)', fontSize:'0.75rem' }}>{r} Risk</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
