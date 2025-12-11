// ============================================
// KETTLEBELL VBT - Frontend Application
// ============================================

class KettlebellVBT {
    constructor() {
        this.videoFile = null;
        this.initElements();
        this.bindEvents();
        this.updateArmPatternVisibility();
    }

    initElements() {
        // Protocol inputs
        this.exerciseSelect = document.getElementById('exercise');
        this.weightInput = document.getElementById('kettlebell-weight');
        this.repsInput = document.getElementById('reps-per-set');
        this.intervalInput = document.getElementById('interval');
        this.armPatternSelect = document.getElementById('arm-pattern');
        this.startingArmSelect = document.getElementById('starting-arm');
        this.startingArmGroup = document.getElementById('starting-arm-group');

        // Upload elements
        this.uploadZone = document.getElementById('upload-zone');
        this.videoInput = document.getElementById('video-input');
        this.videoPreview = document.getElementById('video-preview');
        this.previewPlayer = document.getElementById('preview-player');
        this.removeVideoBtn = document.getElementById('remove-video');

        // Analyze elements
        this.analyzeBtn = document.getElementById('analyze-btn');
        this.btnText = this.analyzeBtn.querySelector('.btn-text');
        this.btnLoader = this.analyzeBtn.querySelector('.btn-loader');

        // Results elements
        this.resultsSection = document.getElementById('results-section');
        this.resultsSummary = document.getElementById('results-summary');
        this.resultsBody = document.getElementById('results-body');
        this.velocityChart = document.getElementById('velocity-chart');
        this.coachingNotes = document.getElementById('coaching-notes');
    }

    bindEvents() {
        // Arm pattern visibility toggle
        this.armPatternSelect.addEventListener('change', () => this.updateArmPatternVisibility());

        // Upload zone click
        this.uploadZone.addEventListener('click', () => this.videoInput.click());

        // File input change
        this.videoInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));

        // Drag and drop
        this.uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadZone.classList.add('dragover');
        });

        this.uploadZone.addEventListener('dragleave', () => {
            this.uploadZone.classList.remove('dragover');
        });

        this.uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('video/')) {
                this.handleFileSelect(file);
            }
        });

        // Remove video
        this.removeVideoBtn.addEventListener('click', () => this.removeVideo());

        // Analyze button
        this.analyzeBtn.addEventListener('click', () => this.analyzeVideo());
    }

    updateArmPatternVisibility() {
        const pattern = this.armPatternSelect.value;
        const showStartingArm = pattern === 'alternating-sets' || pattern === 'alternating-reps';
        this.startingArmGroup.style.display = showStartingArm ? 'flex' : 'none';
    }

    handleFileSelect(file) {
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('video/')) {
            alert('Please select a video file');
            return;
        }

        // Validate file size (100MB max)
        if (file.size > 100 * 1024 * 1024) {
            alert('Video file must be under 100MB');
            return;
        }

        this.videoFile = file;

        // Show preview
        const url = URL.createObjectURL(file);
        this.previewPlayer.src = url;
        this.uploadZone.hidden = true;
        this.videoPreview.hidden = false;

        // Enable analyze button
        this.analyzeBtn.disabled = false;
    }

    removeVideo() {
        if (this.previewPlayer.src) {
            URL.revokeObjectURL(this.previewPlayer.src);
        }
        this.previewPlayer.src = '';
        this.videoFile = null;
        this.videoInput.value = '';
        this.uploadZone.hidden = false;
        this.videoPreview.hidden = true;
        this.analyzeBtn.disabled = true;
        this.resultsSection.hidden = true;
    }

    getProtocol() {
        return {
            exercise: this.exerciseSelect.value,
            weight: parseInt(this.weightInput.value),
            repsPerSet: parseInt(this.repsInput.value),
            interval: parseInt(this.intervalInput.value),
            armPattern: this.armPatternSelect.value,
            startingArm: this.startingArmSelect.value
        };
    }

    async analyzeVideo() {
        if (!this.videoFile) return;

        // Show loading state
        this.setLoading(true);
        this.resultsSection.hidden = true;

        try {
            // Convert video to base64
            const base64Video = await this.fileToBase64(this.videoFile);
            
            // Get protocol
            const protocol = this.getProtocol();

            // Send to API
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    video: base64Video,
                    mimeType: this.videoFile.type,
                    protocol: protocol
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Analysis failed');
            }

            const results = await response.json();
            this.displayResults(results);

        } catch (error) {
            console.error('Analysis error:', error);
            this.showError(error.message);
        } finally {
            this.setLoading(false);
        }
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                // Remove the data URL prefix to get just the base64
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    setLoading(loading) {
        this.analyzeBtn.disabled = loading;
        this.btnText.textContent = loading ? 'Analyzing...' : 'Analyze Video';
        this.btnLoader.hidden = !loading;
    }

    displayResults(results) {
        // Clear previous results
        this.resultsSummary.innerHTML = '';
        this.resultsBody.innerHTML = '';
        this.velocityChart.innerHTML = '';
        this.coachingNotes.innerHTML = '';

        // Summary stats
        const summaryHtml = `
            <div class="summary-stat">
                <div class="value">${results.totalReps}</div>
                <div class="label">Total Reps</div>
            </div>
            <div class="summary-stat">
                <div class="value">${results.avgDuration.toFixed(2)}s</div>
                <div class="label">Avg Duration</div>
            </div>
            <div class="summary-stat">
                <div class="value">${results.velocityDropoff.toFixed(1)}%</div>
                <div class="label">Velocity Drop</div>
            </div>
        `;
        this.resultsSummary.innerHTML = summaryHtml;

        // Rep table
        const avgDuration = results.avgDuration;
        results.reps.forEach(rep => {
            const diff = ((rep.duration - avgDuration) / avgDuration * 100);
            const diffClass = diff > 5 ? 'velocity-low' : diff < -5 ? 'velocity-high' : '';
            const diffSign = diff > 0 ? '+' : '';
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${rep.repNumber}</td>
                <td>${rep.arm}</td>
                <td>${rep.duration.toFixed(2)}s</td>
                <td>${rep.velocityScore}/10</td>
                <td class="${diffClass}">${diffSign}${diff.toFixed(1)}%</td>
            `;
            this.resultsBody.appendChild(row);
        });

        // Velocity chart
        const maxVelocity = Math.max(...results.reps.map(r => r.velocityScore));
        results.reps.forEach(rep => {
            const bar = document.createElement('div');
            bar.className = 'velocity-bar';
            const heightPercent = (rep.velocityScore / maxVelocity) * 100;
            bar.style.height = `${heightPercent}%`;
            bar.setAttribute('data-rep', rep.repNumber);
            if (rep.velocityScore < results.avgVelocity * 0.9) {
                bar.classList.add('below-avg');
            }
            this.velocityChart.appendChild(bar);
        });

        // Coaching notes
        this.coachingNotes.innerHTML = `
            <h3>🎯 Analysis</h3>
            <p>${results.coachingNotes}</p>
        `;

        // Show results
        this.resultsSection.hidden = false;
        this.resultsSection.scrollIntoView({ behavior: 'smooth' });
    }

    showError(message) {
        // Remove existing error
        const existing = document.querySelector('.error-message');
        if (existing) existing.remove();

        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        
        const analyzeSection = document.getElementById('analyze-section');
        analyzeSection.querySelector('.card-body').appendChild(errorDiv);

        // Auto-remove after 5 seconds
        setTimeout(() => errorDiv.remove(), 5000);
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new KettlebellVBT();
});
