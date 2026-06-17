// vexMock.js
//
// Provides the mock `vex` module that student VEXcode Python imports via
// `from vex import *`, plus the small native JS bridge it talks to.
//
// Design: real simulation logic (motion math, the timeline, watchdogs,
// input lookups) lives here as ordinary JS functions hung off
// `window.VexSim.api`. The *only* part that has to be handed to Skulpt as a
// blob of source text is a tiny mechanical bridge module (`_vexbridge`)
// whose functions just unwrap Python args and delegate to `window.VexSim.api`.
// Skulpt loads native (JS-implemented) modules by looking up
// `Sk.builtinFiles.files["src/lib/<name>.js"]`, expecting a *string* of JS
// source defining `var $builtinmodule = function(...) {...}` - so we write
// that bridge factory as a normal function and ship it via `.toString()`.
// The actual `vex` module itself (Brain/Controller/Drivetrain/etc.) is
// ordinary Python source registered the same way under "src/lib/vex.py",
// which Skulpt compiles like any other module - real classes, default args,
// __getattr__, all just work as standard Python semantics.

// --- tunable "imperfect" physics constants (for pacing only) ---
const MAX_LINEAR_MM_S = 600; // mm/s at 100% drive velocity
const MAX_TURN_DEG_S = 200; // deg/s at 100% turn velocity

window.VexSim = window.VexSim || {};

function shortestSignedDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function describeEvent(kind, payload) {
  switch (kind) {
    case "drive":
      return `drive_for(${payload.direction}, ${payload.mm.toFixed(0)}mm)`;
    case "turn":
      return `turn_for(${payload.direction}, ${payload.deg.toFixed(0)}deg)`;
    case "turn_to_heading":
      return `turn_to_heading(${payload.deg.toFixed(0)}deg)`;
    case "wait":
      return `wait(${payload.seconds.toFixed(2)}s)`;
    case "stop":
      return "stop()";
    case "motor":
      return payload.text;
    case "note":
      return payload.text;
    default:
      return kind;
  }
}

// Real implementation functions. All operate on window.VexSim.runtime,
// which simulator.js (re)creates fresh at the start of each run.
window.VexSim.api = {
  driveFor(direction, mm, pct) {
    const runtime = window.VexSim.runtime;
    const sign = direction === "reverse" ? -1 : 1;
    const distance = sign * mm;
    const headingRad = (runtime.robot.heading * Math.PI) / 180;
    const dx = Math.sin(headingRad) * distance;
    const dy = -Math.cos(headingRad) * distance;
    const speed = MAX_LINEAR_MM_S * (Math.max(pct, 1) / 100);
    const duration = Math.abs(distance) / speed;
    const before = { ...runtime.robot };
    runtime.robot.x += dx;
    runtime.robot.y += dy;
    this._pushEvent("drive", { direction, mm, pct, dx, dy }, duration, before);
  },

  turnFor(direction, deg, pct) {
    const runtime = window.VexSim.runtime;
    const sign = direction === "left" ? -1 : 1;
    const delta = sign * deg;
    const speed = MAX_TURN_DEG_S * (Math.max(pct, 1) / 100);
    const duration = Math.abs(delta) / speed;
    const before = { ...runtime.robot };
    runtime.robot.heading = (runtime.robot.heading + delta + 360) % 360;
    this._pushEvent("turn", { direction, deg, pct }, duration, before);
  },

  turnToHeading(targetDeg, pct) {
    const runtime = window.VexSim.runtime;
    const before = { ...runtime.robot };
    const delta = shortestSignedDelta(runtime.robot.heading, targetDeg);
    const speed = MAX_TURN_DEG_S * (Math.max(pct, 1) / 100);
    const duration = Math.abs(delta) / speed;
    runtime.robot.heading = ((targetDeg % 360) + 360) % 360;
    this._pushEvent("turn_to_heading", { deg: targetDeg }, duration, before);
  },

  stop() {
    const runtime = window.VexSim.runtime;
    const before = { ...runtime.robot };
    this._pushEvent("stop", {}, 0, before);
  },

  wait(seconds) {
    const runtime = window.VexSim.runtime;
    const before = { ...runtime.robot };
    this._pushEvent("wait", { seconds }, Math.max(seconds, 0), before);
  },

  motorEvent(text, seconds) {
    const runtime = window.VexSim.runtime;
    const before = { ...runtime.robot };
    this._pushEvent("motor", { text }, Math.max(seconds, 0), before);
  },

  note(text) {
    window.VexSim.runtime.log.push({ t: window.VexSim.runtime.clock, kind: "note", text });
  },

  getInput(path) {
    const runtime = window.VexSim.runtime;
    if (path === "__clock_seconds__") return runtime.clock;

    const schedule = (runtime.state && runtime.state.schedule) || [];

    // boolean press/release windows ("down at t1, up at t2") - used for
    // controller buttons, Bumper, and Optical's is_near_object.
    // pressed()/released() callbacks are edge-triggered against the
    // simulated clock directly (checkScheduledEvents(), below) so they
    // always fire at the right instant regardless of how the program polls.
    // pressing() is a *level* read though, and student code typically only
    // polls it once per loop iteration while the clock can jump by a large
    // chunk in one step (a whole drive_for/wait duration) - so checking
    // only the exact current instant means a short window can fall
    // entirely between two polls and never be observed.
    //
    // So: true if the window is active *right now* (a plain point check),
    // OR if its down-edge happened since this path was last polled (to
    // catch a window that opened and closed entirely inside one gap).
    // Only the opening edge gets that catch-up treatment - the "currently
    // active" half is always a plain point check, so a release is seen on
    // the very next poll rather than needing an extra one to flush stale
    // state (which was the bug: a poll whose interval merely *touched* the
    // tail of an already-closed window kept reporting true for one extra
    // round).
    const windows = schedule.filter((e) => e.kind === "press" && e.path === path);
    if (windows.length) {
      runtime._lastPoll = runtime._lastPoll || {};
      const from = runtime._lastPoll[path] ?? 0;
      const to = runtime.clock;
      const wasActive = windows.some((w) => {
        const currentlyActive = w.downAt <= to && (w.upAt == null || to < w.upAt);
        const openedSinceLastPoll = w.downAt > from && w.downAt <= to;
        return currentlyActive || openedSinceLastPoll;
      });
      runtime._lastPoll[path] = to;
      return wasActive;
    }

    // base/default value, from the live inputs panel widgets (axes/sensors)
    const parts = path.split(".");
    let base = runtime.state;
    for (const p of parts) {
      if (base == null) break;
      base = base[p];
    }

    // generic "at t=<t>s, set <path> to <value>" overrides for numeric/enum
    // inputs (axes, distance, hue, color) - the most recent one (largest
    // t <= current clock) wins, falling back to the base value if none has
    // triggered yet.
    let effective = base;
    let bestT = -Infinity;
    for (const entry of schedule) {
      if (entry.kind === "set" && entry.path === path && entry.t <= runtime.clock && entry.t > bestT) {
        bestT = entry.t;
        effective = entry.value;
      }
    }

    if (schedule.some((e) => e.kind === "set" && e.path === path)) {
      runtime._lastInputValue = runtime._lastInputValue || {};
      const prev = runtime._lastInputValue[path];
      if (prev === undefined) {
        runtime._lastInputValue[path] = effective; // establish baseline silently
      } else if (prev !== effective) {
        runtime._lastInputValue[path] = effective;
        runtime.log.push({ t: runtime.clock, kind: "note", text: `[input] ${path} -> ${effective} (scheduled change)` });
      }
    }
    return effective;
  },

  registerCallback(key, fn) {
    window.VexSim.runtime.callbacks[key] = fn;
  },

  fireCallback(path, eventName) {
    const fn = window.VexSim.runtime.callbacks[`${path}.${eventName}`];
    if (!fn) return;
    Sk.misceval.callsimOrSuspend(fn);
  },

  // Scans boolean press/release windows and fires the matching registered
  // .pressed(fn)/.released(fn) callback (if any) the first time the run's
  // clock crosses each window's downAt/upAt - called whenever the clock
  // advances, so this can happen mid-run, not just via the old "trigger"
  // button after a run finished.
  checkScheduledEvents() {
    const runtime = window.VexSim.runtime;
    const schedule = (runtime.state && runtime.state.schedule) || [];
    runtime._fired = runtime._fired || new Set();
    for (const entry of schedule) {
      if (entry.kind !== "press") continue;
      if (!runtime._fired.has(entry.id + ":down") && entry.downAt <= runtime.clock) {
        runtime._fired.add(entry.id + ":down");
        runtime.log.push({ t: runtime.clock, kind: "note", text: `[input] ${entry.path} -> true (scheduled)` });
        this.fireCallback(entry.path, "pressed");
      }
      if (entry.upAt != null && !runtime._fired.has(entry.id + ":up") && entry.upAt <= runtime.clock) {
        runtime._fired.add(entry.id + ":up");
        runtime.log.push({ t: runtime.clock, kind: "note", text: `[input] ${entry.path} -> false (scheduled)` });
        this.fireCallback(entry.path, "released");
      }
    }
  },

  _pushEvent(kind, payload, duration, before) {
    const runtime = window.VexSim.runtime;
    const tStart = runtime.clock;
    const tEnd = tStart + duration;
    const after = { ...runtime.robot };
    const entry = { kind, payload, tStart, tEnd, before, after, label: describeEvent(kind, payload) };
    runtime.timeline.push(entry);
    runtime.log.push({ t: tStart, kind: "event", text: entry.label });
    runtime.clock = tEnd;
    this.checkScheduledEvents();
    if (runtime.clock > runtime.budgetSec) {
      const err = new Error(
        `Simulated time limit (${runtime.budgetSec}s) reached - stopping run here. ` +
        `This is expected for an intentional "while True" loop (common in competition ` +
        `templates); raise the time limit above to simulate further.`
      );
      err.__simTimeLimit = true;
      throw err;
    }
  },
};

// --- the tiny mechanical bridge, shipped to Skulpt via .toString() ---
// IMPORTANT: this function must be fully self-contained (no closures over
// anything outside itself besides true globals like `window` and `Sk`),
// since Skulpt re-evaluates its *source text*, not the live function object.
function vexBridgeFactory() {
  function toJs(pyArgs) {
    return pyArgs.map(function (a) { return Sk.ffi.remapToJs(a); });
  }
  function wrap(fn) {
    return new Sk.builtin.func(function () {
      const args = toJs(Array.prototype.slice.call(arguments));
      const result = fn.apply(window.VexSim.api, args);
      return Sk.ffi.remapToPy(result === undefined ? null : result);
    });
  }
  var mod = {};
  mod.drive_for = wrap(window.VexSim.api.driveFor);
  mod.turn_for = wrap(window.VexSim.api.turnFor);
  mod.turn_to_heading = wrap(window.VexSim.api.turnToHeading);
  mod.stop = wrap(window.VexSim.api.stop);
  mod.wait = wrap(window.VexSim.api.wait);
  mod.motor_event = wrap(window.VexSim.api.motorEvent);
  mod.note = wrap(window.VexSim.api.note);
  mod.get_input = wrap(window.VexSim.api.getInput);
  // register_callback's 2nd arg is a Python callable - remapToJs/Py don't
  // support functions, so handle it by hand without remapping that arg.
  mod.register_callback = new Sk.builtin.func(function (keyPy, fnPy) {
    window.VexSim.api.registerCallback(Sk.ffi.remapToJs(keyPy), fnPy);
    return Sk.builtin.none.none$;
  });
  return mod;
}

// --- the actual `vex` API surface, as real Python source ---
const VEX_PY_SOURCE = `
import _vexbridge as _bridge

# --- enums / constants (kept as plain strings; both bare names and the
# "real" enum-namespaced forms are exposed since intro VEXcode code mixes
# both depending on VEXcode version / autocomplete) ---

class DirectionType:
    FORWARD = "forward"
    REVERSE = "reverse"

class TurnType:
    LEFT = "left"
    RIGHT = "right"

class DistanceUnits:
    MM = "mm"
    IN = "in"

class RotationUnits:
    DEGREES = "deg"
    TURNS = "rev"
    RAW = "raw"

class TimeUnits:
    SECONDS = "s"
    MSEC = "ms"

class VelocityUnits:
    PERCENT = "%"
    RPM = "rpm"
    DPS = "dps"

class PercentUnits:
    PERCENT = "%"

FORWARD = DirectionType.FORWARD
REVERSE = DirectionType.REVERSE
LEFT = TurnType.LEFT
RIGHT = TurnType.RIGHT
DEGREES = RotationUnits.DEGREES
TURNS = RotationUnits.TURNS
MM = DistanceUnits.MM
INCHES = DistanceUnits.IN
SECONDS = TimeUnits.SECONDS
MSEC = TimeUnits.MSEC
PERCENT = VelocityUnits.PERCENT
RPM = VelocityUnits.RPM
PRIMARY = "primary"
PARTNER = "partner"


class _Permissive:
    """Returns a placeholder for any attribute access - used for Ports,
    GearSetting, and similar hardware-config enums whose exact members this
    prototype doesn't need to know about."""
    def __init__(self, label):
        self._label = label
    def __getattr__(self, name):
        return "%s.%s" % (self._label, name)

Ports = _Permissive("Ports")
GearSetting = _Permissive("GearSetting")
BrakeType = _Permissive("BrakeType")
ColorHue = _Permissive("ColorHue")


def _to_mm(value, units):
    return value * 25.4 if units == INCHES else value

def _to_degrees(value, units):
    if units == TURNS:
        return value * 360.0
    return value

def _to_seconds(value, units):
    return value / 1000.0 if units == MSEC else value

def _velocity_pct(velocity, velocity_units):
    if velocity is None:
        return 50
    if velocity_units == RPM:
        return max(1, min(100, (velocity / 200.0) * 100))
    return max(1, min(100, velocity))


def wait(value, units=SECONDS):
    _bridge.wait(_to_seconds(value, units))


class Brain:
    def __init__(self):
        self.screen = _Screen()
        self.timer = _Timer()
    def play_sound(self, *a, **kw):
        _bridge.note("[brain] play_sound (not simulated)")


class _Screen:
    def print(self, *args):
        _bridge.note("[screen] " + " ".join(str(a) for a in args))
    def clear_screen(self, *a, **kw):
        _bridge.note("[screen] clear_screen")
    def set_cursor(self, *a, **kw):
        pass
    def new_line(self):
        _bridge.note("[screen] (new line)")
    def draw_rectangle(self, *a, **kw):
        _bridge.note("[screen] draw_rectangle (not simulated)")


class _Timer:
    def time(self, units=SECONDS):
        return _bridge.get_input("__clock_seconds__") or 0
    def clear(self):
        pass


class _Button:
    def __init__(self, key):
        self._key = key
    def pressing(self):
        return bool(_bridge.get_input("controller." + self._key))
    def pressed(self, callback):
        _bridge.register_callback("controller." + self._key + ".pressed", callback)
    def released(self, callback):
        _bridge.register_callback("controller." + self._key + ".released", callback)


class _Axis:
    def __init__(self, key):
        self._key = key
    def position(self, units=PERCENT):
        return _bridge.get_input("controller." + self._key) or 0
    def value(self):
        return _bridge.get_input("controller." + self._key) or 0


class Controller:
    def __init__(self, *a, **kw):
        for name in ("buttonA", "buttonB", "buttonX", "buttonY",
                     "buttonUp", "buttonDown", "buttonLeft", "buttonRight",
                     "buttonL1", "buttonL2", "buttonR1", "buttonR2"):
            setattr(self, name, _Button(name))
        for name in ("axis1", "axis2", "axis3", "axis4"):
            setattr(self, name, _Axis(name))
        self.screen = _Screen()


class Bumper:
    def __init__(self, *a, **kw):
        pass
    def pressing(self):
        return bool(_bridge.get_input("sensors.bumper"))
    def pressed(self, callback):
        _bridge.register_callback("sensors.bumper.pressed", callback)
    def released(self, callback):
        _bridge.register_callback("sensors.bumper.released", callback)


class Distance:
    def __init__(self, *a, **kw):
        pass
    def object_distance(self, units=MM):
        mm = _bridge.get_input("sensors.distance_mm") or 0
        return mm if units == MM else mm / 25.4


class Optical:
    def __init__(self, *a, **kw):
        pass
    def is_near_object(self):
        return bool(_bridge.get_input("sensors.optical.isNear"))
    def color(self):
        return _bridge.get_input("sensors.optical.color")
    def hue(self):
        return _bridge.get_input("sensors.optical.hue") or 0


class Motor:
    def __init__(self, port=None, gear_setting=None, reverse=False, *a, **kw):
        self.port = port
    def spin(self, direction=FORWARD, velocity=None, velocity_units=PERCENT):
        _bridge.note("[motor] spin(%s) - continuous spin isn't animated, see spin_for" % direction)
    def spin_for(self, direction=FORWARD, value=0, units=DEGREES, velocity=None, velocity_units=PERCENT, wait=True):
        pct = _velocity_pct(velocity, velocity_units)
        deg = _to_degrees(value, units)
        seconds = abs(deg) / (200.0 * (pct / 100.0))
        _bridge.motor_event("motor.spin_for(%s, %s)" % (direction, value), seconds if wait else 0)
    def stop(self, *a, **kw):
        _bridge.note("[motor] stop")
    def set_velocity(self, v, units=PERCENT):
        pass


class MotorGroup:
    def __init__(self, *motors):
        self.motors = motors
    def spin(self, direction=FORWARD, velocity=None, velocity_units=PERCENT):
        _bridge.note("[motor group] spin(%s) - continuous spin isn't animated" % direction)
    def spin_for(self, direction=FORWARD, value=0, units=DEGREES, velocity=None, velocity_units=PERCENT, wait=True):
        pct = _velocity_pct(velocity, velocity_units)
        deg = _to_degrees(value, units)
        seconds = abs(deg) / (200.0 * (pct / 100.0))
        _bridge.motor_event("motor_group.spin_for(%s, %s)" % (direction, value), seconds if wait else 0)
    def stop(self, *a, **kw):
        _bridge.note("[motor group] stop")


class Drivetrain:
    def __init__(self, left_motor=None, right_motor=None, wheel_travel=300,
                 track_width=320, wheel_base=320, units=MM,
                 external_gear_ratio=1.0, *a, **kw):
        pass

    def drive_for(self, direction=FORWARD, distance=0, units=MM, velocity=None, velocity_units=PERCENT, wait=True):
        mm = _to_mm(distance, units)
        pct = _velocity_pct(velocity, velocity_units)
        _bridge.drive_for(direction, mm, pct)

    def turn_for(self, direction=RIGHT, angle=0, units=DEGREES, velocity=None, velocity_units=PERCENT, wait=True):
        deg = _to_degrees(angle, units)
        pct = _velocity_pct(velocity, velocity_units)
        _bridge.turn_for(direction, deg, pct)

    def turn_to_heading(self, heading=0, units=DEGREES, velocity=None, velocity_units=PERCENT, wait=True):
        deg = _to_degrees(heading, units)
        pct = _velocity_pct(velocity, velocity_units)
        _bridge.turn_to_heading(deg, pct)

    def drive(self, direction=FORWARD, velocity=None, velocity_units=PERCENT):
        _bridge.note("[drivetrain] drive(%s) - continuous drive isn't animated, use drive_for" % direction)

    def stop(self):
        _bridge.stop()

    def set_drive_velocity(self, v, units=PERCENT):
        pass
    def set_turn_velocity(self, v, units=PERCENT):
        pass
    def set_timeout(self, v, units=SECONDS):
        pass


SmartDrive = Drivetrain
`;

window.VexSim.installVexModule = function installVexModule() {
  if (window.VexSim._installed) return;
  Sk.builtinFiles = Sk.builtinFiles || { files: {} };
  Sk.builtinFiles.files["src/lib/_vexbridge.js"] =
    "var $builtinmodule = " + vexBridgeFactory.toString() + ";";
  Sk.builtinFiles.files["src/lib/vex.py"] = VEX_PY_SOURCE;
  window.VexSim._installed = true;
};

window.VexSim.createRuntime = function createRuntime(inputsRef, budgetSec) {
  const runtime = {
    state: inputsRef,
    timeline: [],
    log: [],
    callbacks: {},
    clock: 0,
    budgetSec,
    robot: { x: 0, y: 0, heading: 0 },
  };
  window.VexSim.runtime = runtime;
  return runtime;
};
