// One AbortController per scenario slot
const controllers = {};

async function startScenario(id, url) {
    const log    = document.getElementById(`log${id}`);
    const starts = document.querySelectorAll('.btn-start');
    const cancels = document.querySelectorAll('.btn-cancel');

    // Abort any previous run for this scenario
    if (controllers[id]) controllers[id].abort();

    const cts = new AbortController();
    controllers[id] = cts;

    // UI — running state
    setLog(log, 'running', '⏳ Request sent to server... (watch the server console)');
    starts[id - 1].disabled = true;
    cancels[id - 1].disabled = false;

    try {
        const res = await fetch(url, { signal: cts.signal });

        if (!res.ok) {
            setLog(log, 'cancelled', `❌ Server error: ${res.status}`);
            return;
        }

        // Some endpoints return Empty (no body) on cancel at server side
        const text = await res.text();
        if (!text) {
            setLog(log, 'cancelled', '🚫 Server returned empty — request was cancelled server-side.');
            return;
        }

        const data = JSON.parse(text);

        if (data.success) {
            setLog(log, 'success', `✅ ${data.message || 'Completed successfully.'}`);
        } else {
            // Timeout scenario returns success:false with a message
            setLog(log, 'timeout', `⏱ ${data.message}`);
        }

    } catch (err) {
        if (err.name === 'AbortError') {
            // fetch was aborted by our cancelScenario() call
            setLog(log, 'cancelled', '🚫 Request aborted by Cancel button — server stopped too.');
        } else {
            setLog(log, 'cancelled', `❌ Network error: ${err.message}`);
        }
    } finally {
        delete controllers[id];
        starts[id - 1].disabled = false;
        cancels[id - 1].disabled = true;
    }
}

function cancelScenario(id) {
    if (controllers[id]) {
        controllers[id].abort();  // drops TCP connection → server CancellationToken fires
    }
}

function setLog(el, state, message) {
    el.className = `log-box ${state}`;
    el.textContent = message;
}

// Simulate "close browser" — abort all in-flight requests on page unload
window.addEventListener('beforeunload', () => {
    Object.values(controllers).forEach(c => c.abort());
});
