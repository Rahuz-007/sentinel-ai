import React, { useRef, useEffect, useState } from 'react';
import axios from 'axios';

const WebcamStream = () => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null); // Ref to hold the MediaStream object
    const streamingRef = useRef(false); // Ref for mutable state access in loop
    const highRiskStartTime = useRef(null); // Track when high risk started
    const hasPlayedVoiceAlert = useRef(false); // Track if we've already spoken for this event
    const lastAlertTime = useRef(0); // For cooldown between distinct incidents
    const riskDropTime = useRef(null); // For debouncing momentary risk drops
    const mediaRecorderRef = useRef(null); // To record the clip
    const recordedChunksRef = useRef([]); // To store video chunks
    const overlayRef = useRef(null); // Ref for drawing bounding boxes
    const locationRef = useRef(null); // Store GPS [lat, lon]
    const sessionIdRef = useRef(null); // Unique ID for ML session isolation

    const [isStreaming, setIsStreaming] = useState(false);
    const [prediction, setPrediction] = useState(null);
    const [errorMsg, setErrorMsg] = useState(null);
    const [frameCount, setFrameCount] = useState(0);
    const [backendStatus, setBackendStatus] = useState("Idle");



    useEffect(() => {
        const checkConnection = async () => {
            try {
                await axios.get('http://localhost:4005/api/alerts');
                setBackendStatus("Backend reachable");
            } catch (err) {
                setBackendStatus("Backend unreachable: " + err.message);
            }
        };
        checkConnection();
        return () => stopStream();
    }, []);

    const setDemoMode = async (behavior) => {
        try {
            await axios.post('http://localhost:5000/demo_mode', { behavior });
        } catch (error) {
            console.error("Failed to set demo mode:", error);
        }
    };

    const handleReport = async () => {
        if (!prediction) return;

        try {
            const reportData = {
                videoName: "Live Webcam Feed",
                behavior: `${prediction.class} (Detected Live)`,
                riskLevel: prediction.risk || "High",
                timestamp: new Date().toISOString()
            };

            await axios.post('http://localhost:4005/api/report-case', reportData);
            alert("Live incident reported successfully!");
        } catch (error) {
            console.error("Reporting failed", error);
            alert("Failed to report live incident.");
        }
    };

    // --- Geolocation Logic ---
    const getLiveLocation = () => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition((position) => {
                locationRef.current = {
                    lat: position.coords.latitude,
                    lon: position.coords.longitude
                };
                console.log("📍 Location captured:", locationRef.current);
            }, (err) => {
                console.warn("📍 Location access denied or failed:", err.message);
            });
        }
    };

    const startStream = async () => {
        getLiveLocation(); // Get GPS when starting camera
        sessionIdRef.current = `session_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
        // Ensure strictly stopped before starting
        stopStream();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            streamRef.current = stream; // Save stream to ref

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setIsStreaming(true);
                streamingRef.current = true;
                // Start prediction loop
                requestAnimationFrame(processFrame);
            }
        } catch (err) {
            console.error("Error accessing webcam:", err);
            alert("Cannot access webcam.");
        }
    };

    const stopStream = () => {
        // Stop all tracks from the stream ref
        if (streamRef.current) {
            const tracks = streamRef.current.getTracks();
            tracks.forEach(track => track.stop());
            streamRef.current = null;
        }

        // Also clean up video ref just in case
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }

        // Stop recorder if active
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current = null;
        recordedChunksRef.current = [];

        setIsStreaming(false);
        streamingRef.current = false;
        setPrediction(null); // Clear last prediction
    };

    const processFrame = async () => {
        if (!videoRef.current || !streamingRef.current) return; // Use Ref for immediate check

        // Draw frame to canvas
        const canvas = canvasRef.current;
        const video = videoRef.current;

        if (canvas && video && video.readyState === 4) {
            canvas.width = 300; // Downscale for speed
            canvas.height = 300;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Get Data URL
            const base64Frame = canvas.toDataURL('image/jpeg', 0.8);

            try {
                // Routing through the backend proxy (Port 4005) 
                const res = await axios.post('http://localhost:4005/api/webcam-proxy', {
                    frame: base64Frame,
                    location: locationRef.current,
                    session_id: sessionIdRef.current
                });

                const pred = res.data;

                // --- Voice Alert Logic ---
                // Trigger only if "Fight" or "Assault" is detected continuously for 10 seconds
                const isHighRisk = pred.risk === 'High';
                const isViolence = ['Fight', 'Assault', 'Violence'].some(k => pred.class && pred.class.includes(k));

                if (isHighRisk && isViolence) {
                    riskDropTime.current = null; // Reset drop timer if risk is high

                    if (!highRiskStartTime.current) {
                        // Check Cooldown: Don't start a new incident if we just alerted < 10s ago
                        if (Date.now() - lastAlertTime.current < 10000) {
                            return;
                        }

                        // --- Risk START: Begin Recording ---
                        highRiskStartTime.current = Date.now();

                        if (streamRef.current) {
                            recordedChunksRef.current = [];
                            try {
                                const options = { mimeType: 'video/webm' };
                                if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
                                    options.mimeType = 'video/webm; codecs=vp9';
                                }

                                const recorder = new MediaRecorder(streamRef.current, options);

                                recorder.ondataavailable = (event) => {
                                    if (event.data.size > 0) {
                                        recordedChunksRef.current.push(event.data);
                                    }
                                };

                                recorder.onstop = async () => {
                                    // Only upload if we actually triggered the alert
                                    if (!hasPlayedVoiceAlert.current || recordedChunksRef.current.length === 0) return;

                                    const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
                                    const videoFile = new File([blob], `incident_${Date.now()}.webm`, { type: 'video/webm' });

                                    console.log("📤 Uploading 3s incident clip...");
                                    const formData = new FormData();
                                    formData.append('video', videoFile);
                                    formData.append('videoName', "Live Auto-Capture");
                                    formData.append('behavior', pred.class + " (Auto-Detected)");
                                    formData.append('riskLevel', 'High');
                                    formData.append('timestamp', new Date().toISOString());

                                    try {
                                        await axios.post('http://localhost:4005/api/report-incident', formData);
                                        console.log("✅ Incident clip uploaded successfully");
                                    } catch (err) {
                                        console.error("Failed to upload incident:", err);
                                    }
                                };

                                recorder.start();
                                mediaRecorderRef.current = recorder;
                                console.log("🎥 Started recording potential incident...");
                            } catch (e) {
                                console.error("Recorder error:", e);
                            }
                        }

                    } else {
                        const elapsed = Date.now() - highRiskStartTime.current;
                        if (elapsed > 3000 && !hasPlayedVoiceAlert.current) {
                            // 3 seconds passed
                            console.log("🔊 Triggering Voice Alert: Fight detected for >3s");
                            const msg = new SpeechSynthesisUtterance("Fight or assault detected");
                            msg.rate = 1.0;
                            msg.pitch = 1.2;
                            msg.volume = 1.0;
                            window.speechSynthesis.speak(msg);

                            hasPlayedVoiceAlert.current = true;
                            lastAlertTime.current = Date.now(); // Mark this incident as handled

                            // Stop recording and trigger upload (handled by onstop)
                            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                                mediaRecorderRef.current.stop();
                                console.log("⏹️ Stopped recording (3s limit reached)");
                            }
                        }
                    }
                } else {
                    // Risk dropped. Debounce the reset.
                    if (highRiskStartTime.current) {
                        if (!riskDropTime.current) {
                            riskDropTime.current = Date.now();
                        }

                        // Only reset if low risk persists for > 1.5s
                        if (Date.now() - riskDropTime.current > 1500) {
                            console.log("🛡️ Incident ended (Resetting)");

                            // Stop recorder if it was running (e.g. incident < 3s)
                            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                                mediaRecorderRef.current.stop();
                                recordedChunksRef.current = []; // Clear chunks so we don't upload false alarm
                            }

                            highRiskStartTime.current = null;
                            hasPlayedVoiceAlert.current = false;
                            riskDropTime.current = null;
                        }
                    }
                }
                // -------------------------

                setPrediction(pred);
                setErrorMsg(null);
                setBackendStatus("Connected");

                // --- Draw Overlays ---
                drawOverlays(pred.boxes, pred.risk);




            } catch (error) {
                // console.error("Prediction error:", error); // Reduce console spam
                setErrorMsg("Connecting to AI...");
                setBackendStatus("Error: " + error.message);
                setPrediction(null);

                // Clear overlays on error
                if (overlayRef.current) {
                    const ctx = overlayRef.current.getContext('2d');
                    ctx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
                }
            }
            setFrameCount(prev => prev + 1);
        }


        if (streamingRef.current) {
            setTimeout(() => requestAnimationFrame(processFrame), 150);
        }
    };

    // Helper to draw bounding boxes
    const drawOverlays = (boxes, riskLevel) => {
        const canvas = overlayRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!boxes || boxes.length === 0) return;

        // Sync canvas size to video display size
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;

        // The boxes from backend are relative to 300x300
        const scaleX = canvas.width / 300;
        const scaleY = canvas.height / 300;

        boxes.forEach(box => {
            const [x1, y1, x2, y2] = box;

            // Draw Box
            ctx.strokeStyle = riskLevel === 'High' ? '#ff3232' : '#00ffd2';
            ctx.lineWidth = 3;
            ctx.strokeRect(x1 * scaleX, y1 * scaleY, (x2 - x1) * scaleX, (y2 - y1) * scaleY);

            // Draw Label
            ctx.fillStyle = riskLevel === 'High' ? '#ff3232' : '#00ffd2';
            ctx.font = 'bold 14px Inter';
            ctx.fillText('PERSON', x1 * scaleX, y1 * scaleY - 5);
        });
    };




    return (
        <div className="webcam-container glass-panel">
            <h2>Live Surveillance Stream</h2>

            <div className="stream-wrapper">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className={`video-feed ${prediction?.risk === 'High' ? 'border-danger' : 'border-safe'}`}
                />
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                <canvas
                    ref={overlayRef}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'none',
                        zIndex: 5
                    }}
                />


                {prediction && (
                    <div className={`overlay-badge risk-${prediction.risk.toLowerCase()}`}>
                        {prediction.class} ({prediction.risk})
                    </div>
                )}

                {errorMsg && !prediction && (
                    <div className="overlay-badge risk-low" style={{ backgroundColor: '#e67e22', fontSize: '0.7rem' }}>
                        {errorMsg} <br /> {backendStatus}
                    </div>
                )}

                {prediction && (
                    <div style={{
                        position: 'absolute',
                        bottom: '10px',
                        left: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '5px'
                    }}>
                        {prediction.reason && (
                            <div style={{
                                background: 'rgba(0,0,0,0.7)',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                color: (prediction.reason.includes('interaction') || prediction.reason.includes('velocity')) ? '#ffcc00' : '#fff',
                                fontSize: '0.75rem',
                                width: 'fit-content',
                                fontWeight: 'bold'
                            }}>
                                💡 {prediction.reason}
                            </div>
                        )}
                        <div style={{
                            background: 'rgba(0,0,0,0.6)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '0.8rem',
                            display: 'flex',
                            gap: '10px',
                            backdropFilter: 'blur(4px)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            width: 'fit-content'
                        }}>
                            <span>👥 {prediction.persons !== undefined ? prediction.persons : '-'}</span>
                            <span title="Adaptive Threshold">🛡️ {prediction.threshold || '-'}</span>
                            <span>📊 {Math.round(prediction.confidence * 100)}%</span>
                        </div>
                    </div>
                )}
            </div>




            <div className="controls" style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {!isStreaming ? (
                    <button className="action-btn start-btn" onClick={startStream}>Start Camera</button>
                ) : (
                    <>
                        <button className="action-btn stop-btn" onClick={stopStream}>Stop Camera</button>
                        <button
                            className="action-btn"
                            style={{ background: '#e74c3c' }}
                            onClick={handleReport}
                            disabled={!prediction || prediction.class === 'Normal'}
                        >
                            Report Live Case
                        </button>
                    </>
                )}
            </div>


        </div>
    );
};
export default WebcamStream;
