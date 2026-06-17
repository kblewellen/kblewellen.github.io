// inputsPanel.js
//
// Builds the controller/sensor inputs panel and keeps a plain JS state
// object in sync with it. That state object is what vexMock.js reads from
// (via get_input paths like "controller.buttonA" / "sensors.distance_mm").
//
// Two kinds of widgets:
//  - direct sliders/dropdowns for continuous inputs (joystick axes,
//    distance, optical color/hue) that just set the *current* value.
//  - the "Mid-run input changes" schedule editor below, which is the only
//    way to drive boolean inputs (controller buttons, Bumper, Optical's
//    near-object). A boolean is scheduled as a press/release *window*:
//    "down at t1, up at t2" - pressing() reads true for [t1, t2), and the
//    matching .pressed(fn)/.released(fn) callback (if the program
//    registered one) fires at t1/t2 during the run itself.

function createInputsState() {
  return {
    controller: {
      axis1: 0, axis2: 0, axis3: 0, axis4: 0,
    },
    sensors: {
      distance_mm: 300,
      optical: { color: "red", hue: 0 },
    },
    // mid-run schedule, two kinds of entries:
    //   { kind: "press", path, downAt, upAt }   - boolean press/release window
    //   { kind: "set", path, t, value }         - numeric/enum value-at-time
    schedule: [],
  };
}

const BUTTON_LABELS = [
  ["buttonA", "A"], ["buttonB", "B"], ["buttonX", "X"], ["buttonY", "Y"],
  ["buttonUp", "Up"], ["buttonDown", "Down"], ["buttonLeft", "Left"], ["buttonRight", "Right"],
  ["buttonL1", "L1"], ["buttonL2", "L2"], ["buttonR1", "R1"], ["buttonR2", "R2"],
];

const SCHEDULABLE_INPUTS = [
  ...BUTTON_LABELS.map(([key, label]) => ({ path: `controller.${key}`, label: `Controller: ${label}`, type: "bool" })),
  ...["axis1", "axis2", "axis3", "axis4"].map((key) => ({ path: `controller.${key}`, label: `Controller: ${key}`, type: "number", min: -100, max: 100 })),
  { path: "sensors.bumper", label: "Sensor: Bumper", type: "bool" },
  { path: "sensors.distance_mm", label: "Sensor: Distance (mm)", type: "number", min: 0, max: 2000 },
  { path: "sensors.optical.isNear", label: "Sensor: Optical near object", type: "bool" },
  { path: "sensors.optical.color", label: "Sensor: Optical color", type: "enum", options: ["red", "green", "blue", "yellow", "orange", "purple", "cyan", "white", "none"] },
  { path: "sensors.optical.hue", label: "Sensor: Optical hue", type: "number", min: 0, max: 359 },
];

function specFor(path) {
  return SCHEDULABLE_INPUTS.find((s) => s.path === path);
}

let scheduleIdCounter = 0;
function nextScheduleId() {
  scheduleIdCounter += 1;
  return `sched_${scheduleIdCounter}`;
}

function numberInput(value, width) {
  const input = document.createElement("input");
  input.type = "number";
  input.step = "0.1";
  input.min = "0";
  input.value = value;
  input.style.width = width || "4rem";
  return input;
}

function valueEditorFor(spec) {
  if (spec.type === "enum") {
    const sel = document.createElement("select");
    for (const v of spec.options) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    }
    return { el: sel, getValue: () => sel.value };
  }
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(spec.min ?? "");
  input.max = String(spec.max ?? "");
  input.value = "0";
  input.style.width = "4.5rem";
  return { el: input, getValue: () => Number(input.value) };
}

function describeEntry(entry) {
  const spec = specFor(entry.path);
  const label = spec ? spec.label : entry.path;
  if (entry.kind === "press") {
    return entry.upAt != null
      ? `${label}: down at t=${entry.downAt.toFixed(2)}s, up at t=${entry.upAt.toFixed(2)}s`
      : `${label}: down at t=${entry.downAt.toFixed(2)}s (stays down)`;
  }
  return `${label}: t=${entry.t.toFixed(2)}s -> ${entry.value}`;
}

function entrySortKey(entry) {
  return entry.kind === "press" ? entry.downAt : entry.t;
}

function buildScheduleEditor(container, inputs, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "input-group";
  const title = document.createElement("h3");
  title.textContent = "Mid-run input changes";
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent =
    "Buttons and sensors that are on/off (controller buttons, Bumper, " +
    "Optical near-object) are driven entirely from here as a press/release " +
    'window: "down at t1, up at t2" makes pressing() true for [t1, t2) and ' +
    "fires the matching .pressed(fn)/.released(fn) callback at t1/t2, if " +
    "the program registered one. Other inputs (axes, distance, color, hue) " +
    "use a simple value-at-time entry instead. Run once first to read good " +
    "times off the Event Log, then schedule and re-run.";

  const form = document.createElement("div");
  form.className = "sensor-row";
  const pathSelect = document.createElement("select");
  for (const spec of SCHEDULABLE_INPUTS) {
    const opt = document.createElement("option");
    opt.value = spec.path;
    opt.textContent = spec.label;
    pathSelect.appendChild(opt);
  }

  const fieldsSlot = document.createElement("span");
  let collectEntry = () => null;

  function rebuildFields() {
    fieldsSlot.innerHTML = "";
    const spec = specFor(pathSelect.value);
    if (spec.type === "bool") {
      const downLabel = document.createElement("label");
      downLabel.textContent = "down at t=";
      const downInput = numberInput("1.0");
      const upLabel = document.createElement("label");
      upLabel.textContent = "s, up at t=";
      const upInput = numberInput("");
      upInput.placeholder = "(stays down)";
      const sLabel = document.createElement("span");
      sLabel.textContent = "s";
      fieldsSlot.append(downLabel, downInput, upLabel, upInput, sLabel);
      collectEntry = () => ({
        id: nextScheduleId(),
        kind: "press",
        path: spec.path,
        downAt: Math.max(0, Number(downInput.value) || 0),
        upAt: upInput.value === "" ? null : Math.max(0, Number(upInput.value) || 0),
      });
    } else {
      const atLabel = document.createElement("label");
      atLabel.textContent = "at t=";
      const timeInput = numberInput("1.0");
      const setLabel = document.createElement("span");
      setLabel.textContent = "s, set to";
      const valueEditor = valueEditorFor(spec);
      fieldsSlot.append(atLabel, timeInput, setLabel, valueEditor.el);
      collectEntry = () => ({
        id: nextScheduleId(),
        kind: "set",
        path: spec.path,
        t: Math.max(0, Number(timeInput.value) || 0),
        value: valueEditor.getValue(),
      });
    }
  }
  pathSelect.addEventListener("change", rebuildFields);
  rebuildFields();

  const addBtn = document.createElement("button");
  addBtn.textContent = "+ Add";
  const list = document.createElement("div");

  function renderList() {
    list.innerHTML = "";
    const sorted = [...inputs.schedule].sort((a, b) => entrySortKey(a) - entrySortKey(b));
    for (const entry of sorted) {
      const row = document.createElement("div");
      row.className = "sensor-row";
      const text = document.createElement("span");
      text.textContent = describeEntry(entry);
      const del = document.createElement("button");
      del.textContent = "remove";
      del.addEventListener("click", () => {
        inputs.schedule = inputs.schedule.filter((e) => e !== entry);
        renderList();
        onChange();
      });
      row.append(text, del);
      list.appendChild(row);
    }
  }

  addBtn.addEventListener("click", () => {
    const entry = collectEntry();
    if (entry) inputs.schedule.push(entry);
    renderList();
    onChange();
  });

  form.append(pathSelect, fieldsSlot, addBtn);
  wrap.append(title, hint, form, list);
  container.appendChild(wrap);
  renderList();
}

function axisWidget(label, getVal, setVal) {
  const row = document.createElement("div");
  row.className = "axis-row";
  const lab = document.createElement("label");
  lab.textContent = label;
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "-100";
  slider.max = "100";
  slider.value = String(getVal());
  const val = document.createElement("span");
  val.className = "val";
  val.textContent = getVal();
  slider.addEventListener("input", () => {
    setVal(Number(slider.value));
    val.textContent = slider.value;
  });
  row.append(lab, slider, val);
  return row;
}

function mountInputsPanel(container, inputs, { onChange }) {
  container.innerHTML = "";

  // controller axes (continuous - direct sliders)
  const axisGroup = document.createElement("div");
  axisGroup.className = "input-group";
  const axisTitle = document.createElement("h3");
  axisTitle.textContent = "Joystick axes";
  axisGroup.appendChild(axisTitle);
  for (const key of ["axis1", "axis2", "axis3", "axis4"]) {
    axisGroup.appendChild(
      axisWidget(key, () => inputs.controller[key], (v) => { inputs.controller[key] = v; onChange(); })
    );
  }

  // sensors (continuous - direct sliders/dropdowns; booleans live entirely
  // in the schedule editor below)
  const sensorGroup = document.createElement("div");
  sensorGroup.className = "input-group";
  const sensorTitle = document.createElement("h3");
  sensorTitle.textContent = "Sensors";
  sensorGroup.appendChild(sensorTitle);

  const distRow = document.createElement("div");
  distRow.className = "sensor-row";
  const distLabel = document.createElement("label");
  distLabel.textContent = "Distance (mm)";
  const distSlider = document.createElement("input");
  distSlider.type = "range";
  distSlider.min = "0";
  distSlider.max = "2000";
  distSlider.value = String(inputs.sensors.distance_mm);
  const distVal = document.createElement("span");
  distVal.className = "val";
  distVal.textContent = inputs.sensors.distance_mm;
  distSlider.addEventListener("input", () => {
    inputs.sensors.distance_mm = Number(distSlider.value);
    distVal.textContent = distSlider.value;
    onChange();
  });
  distRow.append(distLabel, distSlider, distVal);
  sensorGroup.appendChild(distRow);

  const colorRow = document.createElement("div");
  colorRow.className = "sensor-row";
  const colorLabel = document.createElement("label");
  colorLabel.textContent = "Optical: color";
  const colorSelect = document.createElement("select");
  for (const c of ["red", "green", "blue", "yellow", "orange", "purple", "cyan", "white", "none"]) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    colorSelect.appendChild(opt);
  }
  colorSelect.value = inputs.sensors.optical.color;
  colorSelect.addEventListener("change", () => {
    inputs.sensors.optical.color = colorSelect.value;
    onChange();
  });
  colorRow.append(colorLabel, colorSelect);
  sensorGroup.appendChild(colorRow);

  const hueRow = document.createElement("div");
  hueRow.className = "sensor-row";
  const hueLabel = document.createElement("label");
  hueLabel.textContent = "Optical: hue";
  const hueSlider = document.createElement("input");
  hueSlider.type = "range";
  hueSlider.min = "0";
  hueSlider.max = "359";
  hueSlider.value = String(inputs.sensors.optical.hue);
  const hueVal = document.createElement("span");
  hueVal.className = "val";
  hueVal.textContent = inputs.sensors.optical.hue;
  hueSlider.addEventListener("input", () => {
    inputs.sensors.optical.hue = Number(hueSlider.value);
    hueVal.textContent = hueSlider.value;
    onChange();
  });
  hueRow.append(hueLabel, hueSlider, hueVal);
  sensorGroup.appendChild(hueRow);

  container.append(axisGroup, sensorGroup);
  buildScheduleEditor(container, inputs, onChange);
}
