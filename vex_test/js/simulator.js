// simulator.js
//
// Owns the Skulpt configuration and orchestrates running a student program
// (or, after the fact, firing a single registered controller/sensor
// callback). Both paths funnel through the same watchdogs and error
// formatting.

function builtinRead(filename) {
  if (Sk.builtinFiles === undefined || Sk.builtinFiles.files[filename] === undefined) {
    throw new Error("File not found: '" + filename + "'");
  }
  return Sk.builtinFiles.files[filename];
}

// Hard backstop (milliseconds of wall-clock interpretation) against a loop
// that never calls a mock timing function at all, e.g. `while True: pass`.
// Our own virtual-time budget (seconds of *simulated* robot time) is the
// primary, friendlier watchdog and is checked inside vexMock.js.
const CPU_BACKSTOP_MS = 8000;

function configureSkulpt() {
  window.VexSim.installVexModule();
  Sk.configure({
    output: (text) => {
      const runtime = window.VexSim.runtime;
      if (runtime && text && text.trim().length) {
        runtime.log.push({ t: runtime.clock, kind: "stdout", text: text.replace(/\n$/, "") });
      }
    },
    read: builtinRead,
    execLimit: CPU_BACKSTOP_MS,
  });
}

function formatError(err) {
  if (err && err.__simTimeLimit) {
    return { kind: "time_limit", message: err.message };
  }
  if (err instanceof Sk.builtin.TimeLimitError) {
    return {
      kind: "cpu_limit",
      message:
        "Stopped: this program seems to loop without ever calling wait()/drive_for()/etc, " +
        "so there's no simulated time to budget against. Add a wait() inside long-running loops.",
    };
  }
  if (err && typeof err.toString === "function" && err.tp$name) {
    // a Skulpt/Python exception
    return { kind: "python_error", message: err.toString() };
  }
  return { kind: "error", message: (err && err.message) || String(err) };
}

/**
 * Run a full student program from the top. Returns a Promise resolving to
 * { ok, runtime, error? }. Scheduled boolean press/release windows (see
 * inputsPanel.js) are checked once up front (in case anything is scheduled
 * for t=0) and then again every time the simulated clock advances, from
 * inside vexMock.js's _pushEvent - so a `.pressed(fn)` callback fires at
 * the right moment *during* this one synchronous run, not after it.
 */
function runProgram(sourceCode, inputsRef, budgetSec) {
  configureSkulpt();
  const runtime = window.VexSim.createRuntime(inputsRef, budgetSec);
  Sk.execStart = Date.now();
  return Sk.misceval
    .asyncToPromise(() => {
      window.VexSim.api.checkScheduledEvents();
      return Sk.importMainWithBody("student_code", false, sourceCode, true);
    })
    .then(() => ({ ok: true, runtime }))
    .catch((err) => ({ ok: false, runtime, error: formatError(err) }));
}

window.VexSim.runProgram = runProgram;
