// timeline.js
//
// Playback engine: given a list of timeline events (each with tStart/tEnd
// and a robot pose before/after), animates a "playhead" across them at an
// adjustable pace and reports the interpolated pose so field.js can draw it.
// This is what satisfies "step through or run at various paces" without
// needing real interpreter-level pausing - we're just scrubbing a recorded
// timeline, like a video.

function shortestHeadingDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

class Player {
  constructor() {
    this.events = [];
    this.playhead = 0;
    this.speed = 1;
    this.playing = false;
    this._rafId = null;
    this._lastFrameMs = null;
    this.onPose = null; // (pose) => void
    this.onTick = null; // (playhead, duration) => void
    this.onEnd = null; // () => void
  }

  setEvents(events) {
    this.events = events;
    this.playhead = 0;
    this._emitPose();
    this._emitTick();
  }

  appendEvents(newEvents) {
    this.events = this.events.concat(newEvents);
    this._emitTick();
  }

  duration() {
    if (this.events.length === 0) return 0;
    return this.events[this.events.length - 1].tEnd;
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  poseAt(t) {
    if (this.events.length === 0) {
      return { x: 0, y: 0, heading: 0 };
    }
    if (t <= this.events[0].tStart) {
      return { ...this.events[0].before };
    }
    for (const ev of this.events) {
      if (t >= ev.tStart && t <= ev.tEnd) {
        const span = ev.tEnd - ev.tStart;
        const frac = span === 0 ? 1 : (t - ev.tStart) / span;
        const headingDelta = shortestHeadingDelta(ev.before.heading, ev.after.heading);
        return {
          x: lerp(ev.before.x, ev.after.x, frac),
          y: lerp(ev.before.y, ev.after.y, frac),
          heading: ((ev.before.heading + headingDelta * frac) % 360 + 360) % 360,
        };
      }
    }
    return { ...this.events[this.events.length - 1].after };
  }

  scrubTo(t) {
    this.pause();
    this.playhead = Math.max(0, Math.min(t, this.duration()));
    this._emitPose();
    this._emitTick();
  }

  stepForward() {
    this.pause();
    const next = this.events.find((ev) => ev.tEnd > this.playhead + 1e-6);
    this.playhead = next ? next.tEnd : this.duration();
    this._emitPose();
    this._emitTick();
  }

  stepBackward() {
    this.pause();
    const prior = [...this.events].reverse().find((ev) => ev.tStart < this.playhead - 1e-6);
    this.playhead = prior ? prior.tStart : 0;
    this._emitPose();
    this._emitTick();
  }

  play() {
    if (this.playing || this.duration() === 0) return;
    if (this.playhead >= this.duration()) this.playhead = 0;
    this.playing = true;
    this._lastFrameMs = null;
    const step = (nowMs) => {
      if (!this.playing) return;
      if (this._lastFrameMs !== null) {
        const deltaS = ((nowMs - this._lastFrameMs) / 1000) * this.speed;
        this.playhead += deltaS;
      }
      this._lastFrameMs = nowMs;
      if (this.playhead >= this.duration()) {
        this.playhead = this.duration();
        this._emitPose();
        this._emitTick();
        this.pause();
        if (this.onEnd) this.onEnd();
        return;
      }
      this._emitPose();
      this._emitTick();
      this._rafId = requestAnimationFrame(step);
    };
    this._rafId = requestAnimationFrame(step);
  }

  pause() {
    this.playing = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _emitPose() {
    if (this.onPose) this.onPose(this.poseAt(this.playhead));
  }

  _emitTick() {
    if (this.onTick) this.onTick(this.playhead, this.duration());
  }
}
