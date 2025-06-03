$(() => {

    let doKeepAliveAudio = false;
    let isKeepAliveAudioPlaying = false;
    let didHandleKeepAliveTap = false;

    const keepAliveAudioEl = document.getElementById("keepAliveAudioElement");
    if (!keepAliveAudioEl) {
        console.error("Error: keepAliveAudioElement not found in DOM");
        return;
    }

    let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let keepAliveBuffer = null;
    let keepAliveSource = null;
    let playbackStartTime = 0;
    let lastKnownPosition = 0;
    let syncInterval = null;
    const AUDIO_DURATION = 22.629;

    // Update lastKnownPosition continuously
    function updateLastKnownPosition() {
        if (isKeepAliveAudioPlaying && keepAliveSource) {
            lastKnownPosition = ((audioCtx.currentTime - playbackStartTime) % AUDIO_DURATION + AUDIO_DURATION) % AUDIO_DURATION;
        }
    }
    setInterval(updateLastKnownPosition, 50);

    // Load audio
    fetch("cup-of-cohee.ogg")
        .then(res => {
            if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
            return res.arrayBuffer();
        })
        .then(data => audioCtx.decodeAudioData(data))
        .then(buffer => {
            keepAliveBuffer = buffer;
            console.log("Audio loaded, buffer duration:", buffer.duration);
        })
        .catch(err => console.error("Audio loading error:", err));

    // Play Web Audio
    function playWebAudioLoop() {
        if (!keepAliveBuffer) {
            console.error("No buffer available for Web Audio");
            return;
        }

        if (audioCtx.state === "closed") {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (audioCtx.state === "suspended") {
            audioCtx.resume().catch(err => console.error("AudioContext resume error:", err));
        }

        stopWebAudioLoop();

        if (isNaN(lastKnownPosition) || lastKnownPosition < 0 || lastKnownPosition > AUDIO_DURATION) {
            console.error("Invalid lastKnownPosition:", lastKnownPosition, "resetting to 0");
            lastKnownPosition = 0;
        }

        keepAliveSource = audioCtx.createBufferSource();
        keepAliveSource.buffer = keepAliveBuffer;
        keepAliveSource.loop = true;
        keepAliveSource.connect(audioCtx.destination);
        keepAliveSource.start(0, lastKnownPosition);
        playbackStartTime = audioCtx.currentTime - lastKnownPosition;
        isKeepAliveAudioPlaying = true;

        startFallbackSync();
    }

    // Stop Web Audio
    function stopWebAudioLoop() {
        if (keepAliveSource) {
            updateLastKnownPosition();
            keepAliveSource.stop();
            keepAliveSource.disconnect();
            keepAliveSource = null;
        }
        isKeepAliveAudioPlaying = false;
        stopFallbackSync();
    }

    // Start HTML5 audio (muted)
    function playFallbackAudioMuted() {
        if (!keepAliveAudioEl.src) {
            console.error("Error: keepAliveAudioEl.src is not set");
            return;
        }
        keepAliveAudioEl.loop = true;
        keepAliveAudioEl.muted = true;
        keepAliveAudioEl.play().catch(err => console.error("Fallback audio error:", err));
    }

    // Sync <audio> to Web Audio
    function syncFallbackAudio() {
        if (!keepAliveBuffer || !keepAliveAudioEl.src || !isKeepAliveAudioPlaying || document.hidden) return;
        updateLastKnownPosition();
        keepAliveAudioEl.currentTime = lastKnownPosition;
        keepAliveAudioEl.play().catch(err => console.error("Fallback sync error:", err));
    }

    // Start fallback sync
    function startFallbackSync() {
        stopFallbackSync();
        syncInterval = setInterval(syncFallbackAudio, 50);
    }

    // Stop fallback sync
    function stopFallbackSync() {
        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
        }
    }

    // Switch to fallback audio
    function switchToFallbackAudio() {
        if (!doKeepAliveAudio) return;
        stopWebAudioLoop();
        keepAliveAudioEl.muted = false;
        keepAliveAudioEl.currentTime = lastKnownPosition;
        keepAliveAudioEl.play().catch(err => console.error("Fallback audio error:", err));
    }

    // Switch to Web Audio
    function switchToWebAudio() {
        if (!doKeepAliveAudio) return;
        setTimeout(() => {
            let audioCurrentTime = (keepAliveAudioEl.currentTime % AUDIO_DURATION + AUDIO_DURATION) % AUDIO_DURATION;
            if (isNaN(audioCurrentTime) || audioCurrentTime <= 0 || keepAliveAudioEl.paused) {
                console.error("Invalid audio currentTime:", audioCurrentTime, "using lastKnownPosition:", lastKnownPosition);
            } else {
                lastKnownPosition = audioCurrentTime;
            }
            keepAliveAudioEl.muted = true;
            keepAliveAudioEl.pause();
            playWebAudioLoop();
        }, 2000);
    }

    // Visibility change handler
    document.addEventListener("visibilitychange", () => {
        if (!doKeepAliveAudio) return;
        if (document.hidden) {
            switchToFallbackAudio();
        } else {
            switchToWebAudio();
        }
    });

    // Toggle handler
    function handleKeepAliveToggle(e) {
        if (e.type === "touchstart") {
            e.preventDefault();
        }
        if (didHandleKeepAliveTap) {
            return;
        }
        didHandleKeepAliveTap = true;

        $("#keepAliveAudio").toggleClass("toggledOnCrowdControl");
        doKeepAliveAudio = !doKeepAliveAudio;

        if (doKeepAliveAudio) {
            lastKnownPosition = 0;
            playWebAudioLoop();
            playFallbackAudioMuted();
        } else {
            stopWebAudioLoop();
            keepAliveAudioEl.pause();
            keepAliveAudioEl.currentTime = 0;
            lastKnownPosition = 0;
        }

        setTimeout(() => {
            didHandleKeepAliveTap = false;
        }, 300);
    }

    // Bind handlers
    try {
        $("#keepAliveAudio").off().on("click touchstart", handleKeepAliveToggle);
    } catch (err) {
        console.error("Error binding event handlers:", err);
    }

    // Manual restart
    function manualRestartWebAudio() {
        stopWebAudioLoop();
        playWebAudioLoop();
    }

    // Expose globally
    window.manualRestartWebAudio = manualRestartWebAudio;
});
