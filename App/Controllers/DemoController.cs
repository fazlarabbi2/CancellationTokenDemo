using Microsoft.AspNetCore.Mvc;

namespace CancellationTokenDemo.Controllers;

public class DemoController : Controller
{
    private readonly ILogger<DemoController> _logger;

    public DemoController(ILogger<DemoController> logger)
    {
        _logger = logger;
    }

    public IActionResult Index() => View();

    // =========================================================
    // SCENARIO 1 — Basic Request Cancellation
    // Simulates a slow DB query. If browser closes mid-request,
    // HttpContext.RequestAborted fires and work stops.
    // =========================================================
    [HttpGet]
    public async Task<IActionResult> SlowQuery(CancellationToken ct)
    {
        _logger.LogInformation("🟡 [Scenario 1] SlowQuery started.");

        try
        {
            // Simulate a slow database query (10 seconds)
            await Task.Delay(TimeSpan.FromSeconds(10), ct);

            _logger.LogInformation("✅ [Scenario 1] SlowQuery completed successfully.");
            return Json(new { success = true, message = "Query completed! All 10 seconds waited." });
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("🚫 [Scenario 1] SlowQuery CANCELLED — client disconnected.");
            return Empty; // client is gone, no point returning anything
        }
    }

    // =========================================================
    // SCENARIO 2 — Multi-Step Pipeline Cancellation
    // Each step checks the token. Cancels at whichever step
    // the client disconnects — doesn't blindly run all steps.
    // =========================================================
    [HttpGet]
    public async Task<IActionResult> MultiStep(CancellationToken ct)
    {
        _logger.LogInformation("🟡 [Scenario 2] MultiStep pipeline started.");

        try
        {
            var steps = new[]
            {
                "Step 1: Validating input...",
                "Step 2: Fetching data from DB...",
                "Step 3: Processing records...",
                "Step 4: Generating report...",
                "Step 5: Saving output...",
            };

            var completed = new List<string>();

            foreach (var step in steps)
            {
                // Check before starting each step
                ct.ThrowIfCancellationRequested();

                _logger.LogInformation("  ▶ {Step}", step);
                await Task.Delay(TimeSpan.FromSeconds(2), ct); // each step takes 2s

                completed.Add(step);
                _logger.LogInformation("  ✔ {Step} done.", step);
            }

            _logger.LogInformation("✅ [Scenario 2] All steps completed.");
            return Json(new { success = true, completedSteps = completed });
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("🚫 [Scenario 2] MultiStep CANCELLED mid-pipeline.");
            return Empty;
        }
    }

    // =========================================================
    // SCENARIO 3 — Timeout Cancellation
    // Uses CancellationTokenSource with a timeout, COMBINED
    // with the request token. Cancels on whichever fires first:
    // client disconnect OR 5 second timeout.
    // =========================================================
    [HttpGet]
    public async Task<IActionResult> WithTimeout(CancellationToken requestCt)
    {
        _logger.LogInformation("🟡 [Scenario 3] WithTimeout started. Timeout = 5s, Work = 8s.");

        // Timeout token — fires after 5 seconds
        using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        // Linked token — fires if EITHER the request is cancelled OR timeout hits
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(
            requestCt,
            timeoutCts.Token
        );

        try
        {
            // Simulated work takes 8 seconds — longer than 5s timeout
            await Task.Delay(TimeSpan.FromSeconds(8), linkedCts.Token);

            _logger.LogInformation("✅ [Scenario 3] Completed (should not reach here).");
            return Json(new { success = true, message = "Completed." });
        }
        catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested)
        {
            _logger.LogWarning("⏱ [Scenario 3] TIMEOUT — operation took too long.");
            return Json(new { success = false, message = "❌ Request timed out after 5 seconds." });
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("🚫 [Scenario 3] CANCELLED by client disconnect.");
            return Empty;
        }
    }

    // =========================================================
    // SCENARIO 4 — Manual Cancel Button
    // Frontend sends an AbortController signal.
    // Demonstrates that the server stops the moment
    // the user clicks Cancel — not when the request would finish.
    // =========================================================
    [HttpGet]
    public async Task<IActionResult> ManualCancel(CancellationToken ct)
    {
        _logger.LogInformation("🟡 [Scenario 4] ManualCancel started. Click Cancel to stop.");

        try
        {
            var elapsed = 0;

            // Works in 1-second increments so logs show progress
            while (elapsed < 15)
            {
                ct.ThrowIfCancellationRequested();
                await Task.Delay(TimeSpan.FromSeconds(1), ct);
                elapsed++;
                _logger.LogInformation("  ⏳ [Scenario 4] {Elapsed}s elapsed...", elapsed);
            }

            _logger.LogInformation("✅ [Scenario 4] ManualCancel finished after 15s.");
            return Json(new { success = true, message = $"Completed after {elapsed} seconds." });
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("🚫 [Scenario 4] ManualCancel CANCELLED by user.");
            return Empty;
        }
    }

    // =========================================================
    // SCENARIO 5 — Fire and Forget (Token NOT passed)
    // Shows what happens when you forget to pass the token.
    // Work continues even after client disconnects — the bad pattern.
    // =========================================================
    [HttpGet]
    public async Task<IActionResult> FireAndForget(CancellationToken ct)
    {
        _logger.LogInformation("🟡 [Scenario 5] FireAndForget started. NO token passed to Delay.");

        try
        {
            // ❌ ct is NOT passed — this runs to completion no matter what
            await Task.Delay(TimeSpan.FromSeconds(10));

            _logger.LogInformation("✅ [Scenario 5] Completed — ran even if client left!");
            return Json(new { success = true, message = "Ran to completion (client may have left)." });
        }
        catch (OperationCanceledException)
        {
            // This will NEVER be hit because we didn't pass ct to Task.Delay
            _logger.LogWarning("🚫 [Scenario 5] (This line never executes)");
            return Empty;
        }
    }
}
