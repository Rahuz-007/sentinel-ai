import React, { useState } from 'react';
import axios from 'axios';

const VideoUpload = () => {
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState(null);

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
        setResult(null);
    };

    const handleUpload = async () => {
        if (!file) return;

        setUploading(true);
        setResult(null);
        const formData = new FormData();
        formData.append('video', file);

        try {
            const response = await axios.post('http://localhost:4005/api/analyze-video', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setResult(response.data);
            setUploading(false);
        } catch (error) {
            console.error("Upload failed", error);
            setUploading(false);
            alert("Upload failed. Check backend connection.");
        }
    };



    const handleReport = async (event) => {
        try {
            const reportData = {
                videoName: file ? file.name : "Uploaded Video",
                behavior: `${event.type} (${event.start_time}s - ${event.end_time}s)`,
                riskLevel: "High", // Manual report implies high importance
                timestamp: new Date().toISOString()
            };

            await axios.post('http://localhost:4005/api/report-case', reportData);
            alert("Case reported successfully! Check Dashboard.");
        } catch (error) {
            console.error("Reporting failed", error);
            alert("Failed to report case.");
        }
    };

    return (
        <div className="upload-container glass-panel">
            <h2 style={{ marginBottom: '20px' }}>Upload Video File</h2>

            <div className="upload-area">
                <input type="file" accept="video/*" onChange={handleFileChange} id="video-input" className="file-input" />
                <label htmlFor="video-input" className="file-label">{file ? file.name : "Select Video File"}</label>
                <button className="action-btn" onClick={handleUpload} disabled={!file || uploading}>
                    {uploading ? "Analyzing..." : "Analyze File"}
                </button>
            </div>

            {result && result.summary && (
                <div className="result-card" style={{ marginTop: '30px', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>Detection Summary</h3>
                        <div className={`overlay-badge risk-${result.summary.risk_level.toLowerCase()}`}>
                            {result.summary.risk_level} Risk
                        </div>
                    </div>

                    <div className="result-details" style={{ fontSize: '0.9rem', color: '#ccc', marginBottom: '15px' }}>
                        <span>⏱️ Duration: {result.summary.total_duration}s</span> |
                        <span> 🚩 Events: {result.summary.event_count}</span>
                    </div>

                    {result.events && result.events.length > 0 ? (
                        <div className="events-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            <h4>Detected Incidents</h4>
                            {result.events.map((ev, idx) => (
                                <div key={idx} className="event-item glass-panel" style={{ padding: '10px', marginBottom: '10px', borderLeft: '4px solid #e74c3c' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                                        <span>{ev.type}</span>
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                            <span style={{ color: '#e74c3c' }}>{Math.round(ev.avg_confidence * 100)}% Conf.</span>
                                            <button
                                                className="action-btn"
                                                style={{ padding: '2px 8px', fontSize: '0.7rem', background: '#e74c3c' }}
                                                onClick={() => handleReport(ev)}
                                            >
                                                Report Case
                                            </button>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '5px' }}>
                                        🕒 {ev.start_time}s - {ev.end_time}s | {ev.humans_present ? "👥 Humans Detected" : "⚠️ Context Unknown"}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p style={{ opacity: 0.6 }}>No violent incidents detected in this clip.</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default VideoUpload;
