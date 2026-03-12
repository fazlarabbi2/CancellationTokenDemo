/**
 * CancellationToken Demo — jQuery 4.0.0 AJAX
 *
 * jQuery 4 notes:
 *  - $.ajax() still returns a jqXHR (superset of Promise)
 *  - jqXHR.abort() still drops the TCP connection → server CancellationToken fires
 *  - jQuery 4 removed Deferreds/Callbacks from the slim build, but the
 *    full build (which we use) keeps $.ajax() intact
 *  - We use the callback style (success/error) for clarity, but jqXHR is
 *    also thenable so .then()/.catch() work too (shown in comments)
 */

// Active jqXHR objects — one slot per scenario
var activeRequests = {};

// Client-side cosmetic timer handles
var activeTimers = {};

// ─────────────────────────────────────────────
// Start a scenario
// ─────────────────────────────────────────────
function startScenario(id, url, durationSecs) {

    // Abort any in-flight request for this scenario first
    if (activeRequests[id]) {
        activeRequests[id].abort();
    }

    setUiRunning(id, durationSecs);
    startClientTimer(id, durationSecs);

    /**
     * $.ajax() in jQuery 4 returns a jqXHR.
     * jqXHR.abort() is the key: it triggers XMLHttpRequest.abort()
     * which closes the TCP connection and fires HttpContext.RequestAborted
     * on the ASP.NET Core server side.
     *
     * Alternative thenable syntax (jQuery 4 compatible):
     *   $.ajax({ url, method:'GET' })
     *     .then(data => { ... })
     *     .catch((jqXHR, status) => { if (status === 'abort') ... })
     */
    var jqXHR = $.ajax({
        url: url,
        method: 'GET',
        timeout: 0,         // disable client-side timeout — server controls it

        success: function (data) {
            stopClientTimer(id);

            if (!data) {
                // Server returned Empty (204/no body) — cancelled server-side
                setUiCancelled(id, '🚫 Server returned empty — cancelled server-side.');
                return;
            }

            if (data.success) {
                setUiSuccess(id, '✅ ' + (data.message || 'Completed successfully.'));
            } else {
                // Scenario 3 timeout path — success:false with a message
                setUiTimeout(id, '⏱ ' + (data.message || 'Operation timed out.'));
            }
        },

        error: function (jqXHR, textStatus) {
            stopClientTimer(id);

            if (textStatus === 'abort') {
                // Our cancelScenario() called jqXHR.abort()
                // → browser closed TCP connection
                // → server HttpContext.RequestAborted fired
                // → server CancellationToken cancelled
                // → OperationCanceledException thrown
                setUiCancelled(id, '🚫 Request aborted — server CancellationToken fired.');
            } else {
                setUiCancelled(id, '❌ Network error: ' + textStatus);
            }
        },

        complete: function () {
            // Runs after success OR error — clean up UI state
            delete activeRequests[id];
            setUiIdle(id);
        }
    });

    activeRequests[id] = jqXHR;
}

// ─────────────────────────────────────────────
// Cancel — calls jqXHR.abort() which drops TCP
// ─────────────────────────────────────────────
function cancelScenario(id) {
    if (activeRequests[id]) {
        activeRequests[id].abort();
    }
}

// ─────────────────────────────────────────────
// Client-side cosmetic timers (not tied to server state)
// ─────────────────────────────────────────────
function startClientTimer(id, totalSecs) {
    var elapsed = 0;
    var $timer  = $('#timer' + id);
    var $prog   = $('#prog' + id);

    if (!$timer.length) return;
    $prog.removeClass('d-none');

    activeTimers[id] = setInterval(function () {
        elapsed++;
        if (id === 3) {
            var remaining = Math.max(0, 5 - elapsed);
            $timer.text(remaining + 's');
        } else if (id === 4) {
            $timer.text(elapsed + 's');
        }
    }, 1000);
}

function stopClientTimer(id) {
    if (activeTimers[id]) {
        clearInterval(activeTimers[id]);
        delete activeTimers[id];
    }
    $('#timer3').text('—');
    $('#timer4').text('0s');
    $('#prog' + id).addClass('d-none');
}

// ─────────────────────────────────────────────
// UI State Helpers
// ─────────────────────────────────────────────
function setUiRunning(id, secs) {
    setLog(id, 'running',
        '<i class="bi bi-arrow-repeat spin me-1"></i>' +
        '⏳ Request sent — server working (' + secs + 's)... watch the console.');
    setDot(id, 'warning');
    $('#start'  + id).prop('disabled', true);
    $('#cancel' + id).prop('disabled', false);
    resetStepBadges(id);
}

function setUiSuccess(id, msg)   { setLog(id, 'success',   msg); setDot(id, 'success'); }
function setUiCancelled(id, msg) { setLog(id, 'cancelled', msg); setDot(id, 'danger');  markRemainingStepsSkipped(id); }
function setUiTimeout(id, msg)   { setLog(id, 'timeout',   msg); setDot(id, 'warning'); }

function setUiIdle(id) {
    $('#start'  + id).prop('disabled', false);
    $('#cancel' + id).prop('disabled', true);
}

function setLog(id, state, html) {
    $('#log' + id)
        .removeClass('state-running state-success state-cancelled state-timeout')
        .addClass('state-' + state)
        .html(html);
}

function setDot(id, color) {
    $('#dot' + id).html('<i class="bi bi-circle-fill text-' + color + '"></i>');
}

// ─────────────────────────────────────────────
// Step badges (Scenario 2)
// ─────────────────────────────────────────────
function resetStepBadges(id) {
    if (id !== 2) return;
    $('#steps2 .step-badge')
        .removeClass('active done skipped bg-primary bg-success')
        .addClass('bg-secondary');
}

function markRemainingStepsSkipped(id) {
    if (id !== 2) return;
    $('#steps2 .step-badge.bg-secondary').addClass('skipped');
}

var stepTimer = null;
$(document).on('click', '#start2', function () {
    var step = 0;
    if (stepTimer) clearInterval(stepTimer);

    stepTimer = setInterval(function () {
        if (step > 0) {
            $('#steps2 .step-badge[data-step="' + step + '"]')
                .removeClass('active bg-secondary bg-primary')
                .addClass('done bg-success');
        }
        step++;
        if (step <= 5) {
            $('#steps2 .step-badge[data-step="' + step + '"]')
                .removeClass('bg-secondary').addClass('active bg-primary');
        } else {
            clearInterval(stepTimer);
        }
    }, 2000);
});

// ─────────────────────────────────────────────
// Simulate "close browser" on page unload
// $(window).on() works identically in jQuery 4
// ─────────────────────────────────────────────
$(window).on('beforeunload', function () {
    $.each(activeRequests, function (id, jqXHR) {
        jqXHR.abort();
    });
});

// ─────────────────────────────────────────────
// Spin CSS injected once at runtime
// ─────────────────────────────────────────────
$('<style>')
    .text('.spin{display:inline-block;animation:spin 1s linear infinite}' +
          '@keyframes spin{to{transform:rotate(360deg)}}')
    .appendTo('head');
