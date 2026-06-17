// app.js — wires the upload/run/playback/inputs pieces together.
// Loaded as a plain <script> (not type="module") after vexMock.js,
// simulator.js, timeline.js, field.js, inputsPanel.js, so that opening
// index.html via file:// works in Chrome - ES module imports are blocked
// by CORS when fetched from a file:// origin.
// (not destructured to a local - `runProgram` is already a top-level
// function declaration from simulator.js, and classic <script> tags share
// one global scope, so a const of the same name here would be an illegal
// redeclaration.)

const el = (id) => document.getElementById(id);

const fileInput = el("fileInput");
const fileNameLabel = el("fileName");
const runBtn = el("runBtn");
const resetBtn = el("resetBtn");
const timeLimitInput = el("timeLimitInput");
const fieldCanvas = el("fieldCanvas");
const stepBackBtn = el("stepBackBtn");
const playPauseBtn = el("playPauseBtn");
const stepFwdBtn = el("stepFwdBtn");
const speedSelect = el("speedSelect");
const scrubber = el("scrubber");
const clockLabel = el("clockLabel");
const statusBox = el("statusBox");
const inputsContent = el("inputsContent");
const eventLogEl = el("eventLog");
const sourceView = el("sourceView");

const inputs = createInputsState();
const field = new FieldView(fieldCanvas);
const player = new Player();

let sourceCode = "";
let runtime = null;

function setStatus(kind, message) {
  statusBox.className = `status ${kind}`;
  statusBox.textContent = message;
}

function renderEventLog(log) {
  eventLogEl.innerHTML = "";
  log.forEach((entry) => {
    const div = document.createElement("div");
    div.className = `entry ${entry.kind === "error" ? "error" : entry.kind === "stdout" || entry.kind === "note" ? "note" : ""}`;
    div.textContent = `${entry.t.toFixed(2)}s  ${entry.text}`;
    div.addEventListener("click", () => player.scrubTo(entry.t));
    eventLogEl.appendChild(div);
  });
  eventLogEl.scrollTop = eventLogEl.scrollHeight;
}

async function handleRun() {
  if (!sourceCode) return;
  runBtn.disabled = true;
  setStatus("", "Running…");
  const budgetSec = Math.max(1, Number(timeLimitInput.value) || 20);
  const result = await window.VexSim.runProgram(sourceCode, inputs, budgetSec);
  runtime = result.runtime;
  player.setEvents(runtime.timeline.slice());
  field.setPose({ x: 0, y: 0, heading: 0 });
  if (result.ok) {
    setStatus("ok", `Run complete: ${runtime.timeline.length} events, ${runtime.clock.toFixed(1)}s simulated.`);
  } else if (result.error.kind === "time_limit") {
    setStatus("warn", result.error.message);
  } else {
    runtime.log.push({ t: runtime.clock, kind: "error", text: result.error.message });
    setStatus("error", result.error.message);
  }
  renderEventLog(runtime.log);
  resetBtn.disabled = false;
  runBtn.disabled = false;
}

function handleReset() {
  player.pause();
  player.setEvents([]);
  field.setPose({ x: 0, y: 0, heading: 0 });
  eventLogEl.innerHTML = "";
  runtime = null;
  playPauseBtn.textContent = "▶ Play";
  setStatus("", "");
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    sourceCode = String(reader.result);
    sourceView.textContent = sourceCode;
    fileNameLabel.textContent = file.name;
    runBtn.disabled = false;
    setStatus("", "Loaded. Click Run.");
  };
  reader.readAsText(file);
});

runBtn.addEventListener("click", handleRun);
resetBtn.addEventListener("click", handleReset);

stepBackBtn.addEventListener("click", () => player.stepBackward());
stepFwdBtn.addEventListener("click", () => player.stepForward());
playPauseBtn.addEventListener("click", () => {
  if (player.playing) {
    player.pause();
  } else {
    player.play();
  }
});
speedSelect.addEventListener("change", () => player.setSpeed(Number(speedSelect.value)));
scrubber.addEventListener("input", () => player.scrubTo(Number(scrubber.value)));

player.onPose = (pose) => field.setPose(pose);
player.onTick = (playhead, duration) => {
  scrubber.max = String(duration || 0);
  scrubber.value = String(playhead);
  clockLabel.textContent = `t = ${playhead.toFixed(1)}s`;
  playPauseBtn.textContent = player.playing ? "⏸ Pause" : "▶ Play";
};
player.onEnd = () => {
  playPauseBtn.textContent = "▶ Play";
};

mountInputsPanel(inputsContent, inputs, {
  onChange: () => {
    if (runtime) setStatus("warn", "Inputs changed - click Run again to see this take effect.");
  },
});

window.addEventListener("resize", () => field.draw());
