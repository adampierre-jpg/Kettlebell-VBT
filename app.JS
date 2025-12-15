

    <!-- Application Logic -->
    <script type="module">
        // --- 0. API CONFIGURATION ---
        const apiKey = ""; // Injected by environment

        // --- 1. CONFIGURATION & STATE ---
        const CONFIG = {
            shoulderWidthMeters: 0.40, // Approximate standard shoulder width for calibration
            velocitySmoothing: 3,      // Frames to average
            repStartThreshold: 0.5,    // m/s to trigger "movement detected"
            repEndThreshold: 0.2,      // m/s to trigger "rep ended"
            baselineReps: 3,           // Number of reps to establish baseline
            thresholdWarning: 15,      // % drop for Yellow
            thresholdCritical: 20,     // % drop for Red
            thresholdStop: 25          // % drop for Recommendation
        };

        const STATE = {
            isModelLoaded: false,
            isStreaming: false,
            lastVideoTime: -1,
            reps: 0,
            baseline: 0,
            repPeaks: [], // Store peaks for baseline calculation
            currentRepPeak: 0,
            isRepActive: false,
            maxDropOff: 0,
            velocityHistory: [], // For smoothing
            wristHistory: [], // Store previous positions
            lastTimestamp: 0,
            testStartTime: null,
            testComplete: false
        };

        // DOM Elements
        const video = document.getElementById("webcam");
        const canvasElement = document.getElementById("output_canvas");
        const canvasCtx = canvasElement.getContext("2d");
        const startBtn = document.getElementById("startBtn");
        const resetBtn = document.getElementById("resetBtn");
        const uploadInput = document.getElementById("videoUpload");
        const analyzeBtn = document.getElementById("analyzeBtn");
        const speakBtn = document.getElementById("speakBtn");
        const aiContentArea = document.getElementById("ai-content-area");
        const aiTextOutput = document.getElementById("ai-text-output");
        
        const ui = {
            status: document.getElementById("connectionStatus"),
            peakVel: document.getElementById("peakVel"),
            currentVel: document.getElementById("currentVel"),
            reps: document.getElementById("repCount"),
            baseline: document.getElementById("baselineVel"),
            dropOff: document.getElementById("dropOff"),
            zoneText: document.getElementById("zoneText"),
            recText: document.getElementById("recommendationText"),
            card: document.getElementById("statusCard"),
            history: document.getElementById("resultsBody")
        };

        let poseLandmarker = undefined;
        let animationId;

        // --- 2. MEDIAPIPE INITIALIZATION ---
        import { PoseLandmarker, FilesetResolver, DrawingUtils } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/vision-bundle.js";

        async function initializePoseLandmarker() {
            try {
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
                );
                poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose/pose_landmarker/float16/1/pose_landmarker.task`,
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numPoses: 1,
                    minPoseDetectionConfidence: 0.5,
                    minPosePresenceConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                
                STATE.isModelLoaded = true;
                ui.status.innerHTML = `<span class="status-dot status-green"></span> AI Ready`;
                ui.status.className = "flex items-center text-xs font-mono bg-slate-800 px-3 py-1 rounded-full text-green-400";
                startBtn.disabled = false;
                console.log("MediaPipe Pose Landmarker loaded");
            } catch (error) {
                console.error(error);
                ui.status.innerHTML = "Error Loading AI";
                ui.status.classList.add("text-red-500");
                alert("Failed to load MediaPipe. Please ensure hardware acceleration is enabled.");
            }
        }

        initializePoseLandmarker();

        // --- 3. VIDEO HANDLING ---

        // Webcam Mode
        startBtn.addEventListener("click", enableCam);

        function enableCam() {
            if (!poseLandmarker) {
                alert("Wait for AI to load");
                return;
            }

            STATE.isStreaming = true;
            
            // Remove file specific class
            video.classList.remove("no-mirror");

            const constraints = {
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: "user" 
                }
            };

            navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
                video.srcObject = stream;
                video.addEventListener("loadeddata", predictWebcam);
                startBtn.innerText = "Camera Active";
                startBtn.classList.add("bg-green-600");
                resetTest();
            }).catch((err) => {
                console.error(err);
                alert("Camera access denied or not available.");
            });
        }

        // File Upload Mode
        uploadInput.addEventListener("change", (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const url = URL.createObjectURL(file);
            video.srcObject = null;
            video.src = url;
            video.classList.add("no-mirror"); // Don't mirror uploaded videos
            
            resetTest();
            
            video.onloadeddata = () => {
                video.play();
                predictWebcam();
            };
        });

        // --- 4. CORE PROCESSING LOOP ---

        async function predictWebcam() {
            // Resize canvas to match video
            const videoWidth = video.videoWidth;
            const videoHeight = video.videoHeight;
            canvasElement.width = videoWidth;
            canvasElement.height = videoHeight;

            if (STATE.lastVideoTime !== video.currentTime) {
                STATE.lastVideoTime = video.currentTime;
                
                let startTimeMs = performance.now();
                if (video.duration) {
                     // For video files, we map currentTime to milliseconds
                     startTimeMs = video.currentTime * 1000;
                }

                const result = await poseLandmarker.detectForVideo(video, startTimeMs);
                processResult(result, startTimeMs);
            }

            if (STATE.isStreaming || !video.paused) {
                animationId = window.requestAnimationFrame(predictWebcam);
            }
        }

        // --- 5. PHYSICS & LOGIC ---

        function calculateDistance(p1, p2) {
            return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
        }

        function processResult(result, timestamp) {
            canvasCtx.save();
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

            if (result.landmarks.length > 0) {
                const landmarks = result.landmarks[0];
                
                // Draw Skeleton
                const drawingUtils = new DrawingUtils(canvasCtx);
                drawingUtils.drawLandmarks(landmarks, { 
                    radius: (data) => DrawingUtils.lerp(data.from.z, -0.15, 0.1, 5, 1),
                    color: "rgba(255, 255, 255, 0.6)"
                });
                drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
                    color: "rgba(255, 255, 255, 0.3)",
                    lineWidth: 2
                });

                // --- VELOCITY CALCULATION ---
                
                // 1. Dynamic Calibration (Pixels per Meter)
                // Left Shoulder (11), Right Shoulder (12)
                const shoulderLeft = landmarks[11];
                const shoulderRight = landmarks[12];
                const shoulderDistPx = calculateDistance(shoulderLeft, shoulderRight);
                
                // Avoid division by zero
                if (shoulderDistPx < 0.01) return; 

                const metersPerPixel = CONFIG.shoulderWidthMeters / shoulderDistPx;

                // 2. Track Wrist (Right: 16)
                // Note: landmarks are normalized (0-1). We need pixel coords for accurate distance if aspect ratio changes,
                // but since we calculate metersPerPixel based on normalized distance comparison, we can stay in normalized space 
                // IF x and y aspect ratios are handled. 
                // Better approach: Convert to pixels.
                
                const wristIndex = 16; // Right wrist
                const wrist = {
                    x: landmarks[wristIndex].x * canvasElement.width,
                    y: landmarks[wristIndex].y * canvasElement.height
                };

                // Time delta (seconds)
                let deltaTime = (timestamp - STATE.lastTimestamp) / 1000;
                STATE.lastTimestamp = timestamp;

                if (deltaTime > 0 && deltaTime < 1.0) { // Filter huge jumps
                    // 3. Calculate Velocity
                    if (STATE.wristHistory.length > 0) {
                        const prevWrist = STATE.wristHistory[STATE.wristHistory.length - 1];
                        const distPx = calculateDistance(prevWrist, wrist);
                        const rawVelocity = (distPx * metersPerPixel) / deltaTime;

                        // 4. Smoothing
                        STATE.velocityHistory.push(rawVelocity);
                        if (STATE.velocityHistory.length > CONFIG.velocitySmoothing) {
                            STATE.velocityHistory.shift();
                        }
                        
                        const avgVelocity = STATE.velocityHistory.reduce((a, b) => a + b, 0) / STATE.velocityHistory.length;
                        
                        updateLogic(avgVelocity, wrist);
                        
                        // Draw Velocity text near wrist
                        canvasCtx.fillStyle = "#22c55e";
                        canvasCtx.font = "bold 20px monospace";
                        canvasCtx.fillText(`${avgVelocity.toFixed(1)} m/s`, wrist.x + 20, wrist.y);
                    }
                    STATE.wristHistory.push(wrist);
                    if (STATE.wristHistory.length > 2) STATE.wristHistory.shift();
                }
            }
            canvasCtx.restore();
        }

        function updateLogic(velocity, wristPos) {
            // Update UI Realtime
            ui.currentVel.innerText = velocity.toFixed(2);

            // --- REP DETECTION STATE MACHINE ---
            
            // Start Rep?
            if (!STATE.isRepActive && velocity > CONFIG.repStartThreshold) {
                STATE.isRepActive = true;
                STATE.currentRepPeak = 0;
            }

            // In Rep?
            if (STATE.isRepActive) {
                // Track Peak
                if (velocity > STATE.currentRepPeak) {
                    STATE.currentRepPeak = velocity;
                }

                // End Rep? (Velocity drops below threshold)
                // We add a vertical position check: usually end of rep (top of snatch) is high up.
                // But velocity based is usually sufficient for simple counting.
                if (velocity < CONFIG.repEndThreshold) {
                    finishRep();
                }
            }
        }

        function finishRep() {
            STATE.isRepActive = false;
            
            // Filter noise: Peak must be substantial
            if (STATE.currentRepPeak < 0.8) return; 

            STATE.reps++;
            
            // Logic depending on phase
            if (STATE.reps <= CONFIG.baselineReps) {
                // Building Baseline
                STATE.repPeaks.push(STATE.currentRepPeak);
                if (STATE.reps === CONFIG.baselineReps) {
                    STATE.baseline = STATE.repPeaks.reduce((a, b) => a + b, 0) / STATE.repPeaks.length;
                    ui.baseline.innerText = STATE.baseline.toFixed(2);
                    ui.zoneText.innerText = "BASELINE SET";
                    ui.zoneText.classList.remove("text-slate-300");
                    ui.zoneText.classList.add("text-green-400");
                    ui.recText.innerText = "Maintain power!";
                }
            } else {
                // Testing Phase
                analyzeDropOff(STATE.currentRepPeak);
            }

            // UI Updates
            ui.reps.innerText = STATE.reps;
            ui.peakVel.innerText = STATE.currentRepPeak.toFixed(2);
            
            // Reset for next
            STATE.currentRepPeak = 0;
        }

        function analyzeDropOff(currentPeak) {
            const drop = ((STATE.baseline - currentPeak) / STATE.baseline) * 100;
            const dropFixed = Math.max(0, drop).toFixed(1);
            
            if (drop > STATE.maxDropOff) STATE.maxDropOff = drop;

            ui.dropOff.innerText = `${dropFixed}%`;

            // Reset classes
            ui.card.className = "metric-card border-l-4 transition-colors duration-300";
            ui.zoneText.className = "text-xl font-bold";
            document.body.classList.remove("alert-mode");

            if (drop < CONFIG.thresholdWarning) {
                // GREEN ZONE
                ui.card.classList.add("border-l-green-500");
                ui.zoneText.innerText = "OPTIMAL";
                ui.zoneText.classList.add("text-green-400");
                ui.recText.innerText = "Keep pushing";
            } else if (drop >= CONFIG.thresholdWarning && drop < CONFIG.thresholdCritical) {
                // YELLOW ZONE
                ui.card.classList.add("border-l-yellow-500");
                ui.zoneText.innerText = "FATIGUE ONSET";
                ui.zoneText.classList.add("text-yellow-400");
                ui.recText.innerText = "Power dropping detected";
            } else {
                // RED ZONE
                ui.card.classList.add("border-l-red-500", "bg-red-900/20");
                ui.zoneText.innerText = "THRESHOLD HIT";
                ui.zoneText.classList.add("text-red-500");
                ui.recText.innerText = "STOP TEST - Anaerobic Threshold Reached";
                
                // Visual Alert
                document.body.classList.add("alert-mode");
                
                // Automatically save result if this is the first failure
                if (!STATE.testComplete) {
                    saveResults();
                    STATE.testComplete = true;
                }
            }
        }

        // --- 6. DATA PERSISTENCE ---

        function saveResults() {
            const result = {
                date: new Date().toLocaleTimeString(),
                reps: STATE.reps,
                baseline: STATE.baseline.toFixed(2),
                maxDrop: STATE.maxDropOff.toFixed(1),
                status: STATE.maxDropOff > CONFIG.thresholdCritical ? "Threshold Hit" : "Completed"
            };

            const history = JSON.parse(localStorage.getItem('kb_velocity_history') || '[]');
            history.unshift(result);
            if (history.length > 10) history.pop(); // Keep last 10
            localStorage.setItem('kb_velocity_history', JSON.stringify(history));
            
            renderHistory();
        }

        function renderHistory() {
            const history = JSON.parse(localStorage.getItem('kb_velocity_history') || '[]');
            const tbody = document.getElementById("resultsBody");
            
            if (history.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="px-3 py-4 text-center text-slate-500">No tests recorded yet</td></tr>`;
                return;
            }

            tbody.innerHTML = history.map(row => `
                <tr class="border-b border-slate-700 hover:bg-slate-700/50">
                    <td class="px-3 py-2">${row.date}</td>
                    <td class="px-3 py-2 font-mono">${row.reps}</td>
                    <td class="px-3 py-2 font-mono">${row.baseline}</td>
                    <td class="px-3 py-2 font-mono text-${parseFloat(row.maxDrop) > 20 ? 'red' : 'green'}-400">${row.maxDrop}%</td>
                    <td class="px-3 py-2 text-xs">${row.status}</td>
                </tr>
            `).join('');
        }

        document.getElementById("clearHistoryBtn").addEventListener("click", () => {
            if(confirm("Clear all history?")) {
                localStorage.removeItem('kb_velocity_history');
                renderHistory();
            }
        });

        // --- 7. UTILITIES ---

        function resetTest() {
            STATE.reps = 0;
            STATE.baseline = 0;
            STATE.repPeaks = [];
            STATE.currentRepPeak = 0;
            STATE.isRepActive = false;
            STATE.maxDropOff = 0;
            STATE.velocityHistory = [];
            STATE.testComplete = false;
            
            // UI Reset
            ui.reps.innerText = "0";
            ui.peakVel.innerText = "0.00";
            ui.baseline.innerText = "--";
            ui.dropOff.innerText = "0%";
            ui.zoneText.innerText = "READY";
            ui.zoneText.className = "text-xl font-bold text-slate-300";
            ui.recText.innerText = "Start 2-3 explosive reps";
            ui.card.className = "metric-card border-l-4 border-l-slate-500";
            document.body.classList.remove("alert-mode");
            
            // AI UI Reset
            aiContentArea.classList.add("hidden");
            aiTextOutput.innerText = "";
        }

        resetBtn.addEventListener("click", resetTest);

        // --- 8. GEMINI AI INTEGRATION ---
        
        // Helper: Exponential Backoff for API calls
        async function fetchWithBackoff(url, options, maxRetries = 5) {
            let attempt = 0;
            let delay = 1000;
            
            while (attempt < maxRetries) {
                try {
                    const response = await fetch(url, options);
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    return await response.json();
                } catch (error) {
                    attempt++;
                    if (attempt >= maxRetries) throw error;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; // Exponential backoff
                }
            }
        }

        // Feature 1: Analyze Session
        analyzeBtn.addEventListener("click", async () => {
            if (STATE.reps === 0 && STATE.baseline === 0) {
                 aiContentArea.classList.remove("hidden");
                 aiTextOutput.innerText = "⚠️ No session data detected. Please complete at least 3 reps to generate a baseline before analyzing.";
                 return;
            }

            const originalBtnText = analyzeBtn.innerHTML;
            analyzeBtn.innerHTML = `<span class="loader mr-2"></span> Analyzing...`;
            analyzeBtn.disabled = true;
            aiContentArea.classList.add("hidden");
            
            try {
                const exerciseType = document.querySelector('input[name="exercise"]:checked').value;
                const prompt = `
                    You are an expert strength and conditioning coach specializing in Kettlebell sport and Velocity Based Training (VBT).
                    I just finished a set of ${exerciseType}.
                    Here is my data:
                    - Total Reps: ${STATE.reps}
                    - Baseline Peak Velocity: ${STATE.baseline.toFixed(2)} m/s (Average of first 3 reps)
                    - Max Velocity Drop-off: ${STATE.maxDropOff.toFixed(1)}% (Goal is to stop at 20% drop)
                    
                    Please provide a short, punchy 3-sentence analysis:
                    1. Analyze my power output consistency.
                    2. Did I stop at the right time relative to the anaerobic threshold?
                    3. Give me one specific recovery tip for the next 10 minutes.
                    
                    Keep the tone encouraging but technical.
                `;

                const response = await fetchWithBackoff(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }]
                        })
                    }
                );

                const analysisText = response.candidates?.[0]?.content?.parts?.[0]?.text;
                
                if (analysisText) {
                    aiContentArea.classList.remove("hidden");
                    aiTextOutput.innerText = analysisText;
                    // Store text for TTS
                    STATE.lastAnalysisText = analysisText;
                } else {
                    throw new Error("No analysis generated");
                }

            } catch (error) {
                console.error("AI Error:", error);
                aiContentArea.classList.remove("hidden");
                aiTextOutput.innerText = "Error connecting to AI Coach. Please try again.";
            } finally {
                analyzeBtn.innerHTML = originalBtnText;
                analyzeBtn.disabled = false;
            }
        });

        // Feature 2: Text to Speech
        speakBtn.addEventListener("click", async () => {
            if (!STATE.lastAnalysisText) return;
            
            const originalBtnText = speakBtn.innerHTML;
            speakBtn.innerHTML = "⏳ Generating Audio...";
            speakBtn.disabled = true;

            try {
                // Helper to convert PCM to WAV (Simplistic implementation for browser playback)
                function pcmToWav(pcmData, sampleRate = 24000) {
                    const buffer = new ArrayBuffer(44 + pcmData.byteLength);
                    const view = new DataView(buffer);
                    
                    // RIFF chunk descriptor
                    writeString(view, 0, 'RIFF');
                    view.setUint32(4, 36 + pcmData.byteLength, true);
                    writeString(view, 8, 'WAVE');
                    
                    // fmt sub-chunk
                    writeString(view, 12, 'fmt ');
                    view.setUint32(16, 16, true);
                    view.setUint16(20, 1, true); // PCM
                    view.setUint16(22, 1, true); // Mono
                    view.setUint32(24, sampleRate, true);
                    view.setUint32(28, sampleRate * 2, true);
                    view.setUint16(32, 2, true);
                    view.setUint16(34, 16, true);
                    
                    // data sub-chunk
                    writeString(view, 36, 'data');
                    view.setUint32(40, pcmData.byteLength, true);
                    
                    // Write PCM data
                    const pcmArray = new Uint8Array(pcmData);
                    const wavArray = new Uint8Array(buffer, 44);
                    wavArray.set(pcmArray);
                    
                    return buffer;
                }
                
                function writeString(view, offset, string) {
                    for (let i = 0; i < string.length; i++) {
                        view.setUint8(offset + i, string.charCodeAt(i));
                    }
                }

                // Decode base64 helper
                function base64ToArrayBuffer(base64) {
                    const binaryString = window.atob(base64);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    return bytes.buffer;
                }

                const response = await fetchWithBackoff(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: STATE.lastAnalysisText }] }],
                            generationConfig: {
                                responseModalities: ["AUDIO"],
                                speechConfig: {
                                    voiceConfig: {
                                        prebuiltVoiceConfig: { voiceName: "Fenrir" } // Deep, coach-like voice
                                    }
                                }
                            }
                        })
                    }
                );

                const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
                
                if (inlineData) {
                    const pcmData = base64ToArrayBuffer(inlineData.data);
                    const wavData = pcmToWav(pcmData, 24000); // 24kHz is standard for this model
                    const blob = new Blob([wavData], { type: 'audio/wav' });
                    const audioUrl = URL.createObjectURL(blob);
                    const audio = new Audio(audioUrl);
                    audio.play();
                } else {
                    throw new Error("No audio data received");
                }

            } catch (error) {
                console.error("TTS Error:", error);
                alert("Could not generate speech. Please try again.");
            } finally {
                speakBtn.innerHTML = originalBtnText;
                speakBtn.disabled = false;
            }
        });


        // Initial render of history
        renderHistory();

    </script>
