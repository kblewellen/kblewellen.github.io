# VEX Test

A small, intentionally **imperfect** classroom tool for an intro programming
course using VEX EXP. Students upload the VEXcode Python file they wrote,
and this page runs it in the browser (via [Skulpt](https://skulpt.org/), a
Python-in-JS implementation) against a mock `vex` API, so they can watch a
box representing their robot move around an overhead field as their actual
code executes - loops, conditionals, functions, all of it.

This is **not** a physics simulator. Speeds, distances, and timing are rough
approximations chosen only to make playback pacing feel reasonable. The
goal is seeing *control flow* play out, not predicting real robot behavior.

## Running it

Open `index.html` directly in a browser (double-click it, or serve the
folder however you like - no build step, no server required). It loads
Skulpt from a CDN, so you do need internet access to load the page itself,
but no further network calls happen once it's open.

## Using it

1. **Upload** a `.py` file exported/written for VEXcode V5/EXP (the kind
   that starts with `from vex import *`).
2. Set up the **Inputs panel** to match a scenario you want to test:
   - Joystick axes and the non-boolean sensors (distance, optical color/hue)
     have direct sliders/dropdowns for their starting value, and can also be
     changed mid-run via a **"at t=…s, set … to …"** entry at the bottom.
   - Controller buttons, Bumper, and Optical's near-object are all on/off,
     and are driven *entirely* through **Mid-run input changes** as a
     press/release window: "down at t1, up at t2". The program's
     `.pressed(fn)`/`.released(fn)` callback (if it registered one) fires
     at exactly t1/t2, regardless of how the program polls. `.pressing()`
     is a level read though, and student code typically only polls it once
     per loop iteration while the clock can jump by a large chunk in one
     step (a whole `drive_for`/`wait`) - so it counts as "pressed" if the
     window overlapped *any point since that same input was last polled*,
     not only the exact instant of the check. In practice: the window just
     needs to fall somewhere between two consecutive checks of that input,
     not land exactly on one. Leave "up at" blank to stay down for the rest
     of the run.
   - Good times to use aren't always obvious up front - run once with no
     scheduling, read approximate timestamps off the Event Log (each
     drive/turn/wait event's start time is effectively also when the
     program polled the input right before it), then add entries and
     re-run.
3. Click **Run**. The whole program executes immediately (it doesn't run in
   real time) and produces a timeline of every drive/turn/wait/motor action
   (plus any scheduled input changes), which then gets recorded for
   playback.
4. Use the **transport controls** (Play/Pause/Step/Speed/scrubber) to watch
   that timeline play out on the field at whatever pace you like, or jump
   around it via the **Event Log**.

See `examples/` for three sample programs:
- `01_straight_line.py` - plain motion sequence, no inputs.
- `02_branching_bumper.py` - schedule a Bumper press/release window and
  re-run to see the branch change partway through the loop.
- `03_loop_and_callback.py` - a `while True:` competition-style loop (the
  time-limit watchdog cuts it off cleanly) plus a `buttonA.pressed(...)`
  callback that fires when you schedule a press window for Button A.

## What's mocked (and what isn't)

Implemented: `Brain` (screen prints go to the Event Log), `Controller`
(buttons + axes, poll-based and `.pressed`/`.released` callbacks), `Motor` /
`MotorGroup` (logged, not animated - they don't move the chassis box),
`Drivetrain` / `SmartDrive` (`drive_for`, `turn_for`, `turn_to_heading`,
`stop` - these *do* move the box), `wait(...)`, and three sensors: `Bumper`,
`Distance`, `Optical`. Units/enums (`MM`, `INCHES`, `DEGREES`, `PERCENT`,
etc.) and `Ports`/`GearSetting` are permissive placeholders - any port or
gear setting name is accepted without needing to be listed explicitly.

Not implemented: anything else in the real VEX API (e.g. `Competition`,
LED/pneumatics-equivalents, vision sensor, GPS, inertial sensor, precise
screen drawing). Calling something this prototype doesn't mock at all will
raise a normal Python `AttributeError`, shown in the status bar - that's a
real signal the program uses something not yet covered here, not a bug to
chase.

## Two deliberate simplifications

- **No real interpreter pausing.** A "Run" executes the whole program in one
  synchronous pass (not in real time). Within that one pass, both polled
  reads (`.pressing()`, `.position()`, `.object_distance()`, etc.) and
  `.pressed(fn)`/`.released(fn)` callbacks see whatever's scheduled against
  the run's simulated clock at **Mid-run input changes**. What you can't do
  is hand-steer an input in true real time while watching it happen live -
  scheduling is set up before clicking Run, not adjusted during it.
- **A simulated-time budget (default 20s, editable in the toolbar)** stops
  any run once that much *simulated robot time* has elapsed, specifically so
  a `while True:` competition loop doesn't hang the browser tab. There's
  also a hard 8-second wall-clock CPU backstop for the rarer case of a loop
  that never calls a timed VEX function at all (e.g. `while True: pass`).
