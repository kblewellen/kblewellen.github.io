// field.js
//
// Overhead canvas rendering: a gridded field with the robot drawn as a box,
// heading shown with a directional tick. Coordinate convention: x/y in mm,
// origin at field center, heading in degrees where 0 = up/"north" on
// screen and increasing clockwise (so RIGHT turns increase heading).

class FieldView {
  constructor(canvas, { fieldSizeMM = 3600, robotWidthMM = 380, robotLengthMM = 380 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.fieldSizeMM = fieldSizeMM;
    this.robotWidthMM = robotWidthMM;
    this.robotLengthMM = robotLengthMM;
    this.pose = { x: 0, y: 0, heading: 0 };
    this._resizeToDisplaySize();
    this.draw();
  }

  _resizeToDisplaySize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const size = Math.max(rect.width, 200);
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.pxPerMM = size / this.fieldSizeMM;
  }

  setPose(pose) {
    this.pose = pose;
    this.draw();
  }

  toPx(xMM, yMM) {
    const size = this.canvas.width / (window.devicePixelRatio || 1);
    return { x: size / 2 + xMM * this.pxPerMM, y: size / 2 + yMM * this.pxPerMM };
  }

  draw() {
    this._resizeToDisplaySize();
    const ctx = this.ctx;
    const size = this.canvas.width / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, size, size);

    // field background + grid
    ctx.fillStyle = "#0e1015";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#23263080";
    ctx.lineWidth = 1;
    const gridStepMM = this.fieldSizeMM / 12;
    for (let i = 0; i <= 12; i++) {
      const p = i * gridStepMM * this.pxPerMM;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }
    // center axes, brighter
    ctx.strokeStyle = "#343847";
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();

    // robot box
    const center = this.toPx(this.pose.x, this.pose.y);
    const wPx = this.robotWidthMM * this.pxPerMM;
    const lPx = this.robotLengthMM * this.pxPerMM;
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate((this.pose.heading * Math.PI) / 180);
    ctx.fillStyle = "#3d6ad8";
    ctx.strokeStyle = "#9fb4ec";
    ctx.lineWidth = 2;
    ctx.fillRect(-wPx / 2, -lPx / 2, wPx, lPx);
    ctx.strokeRect(-wPx / 2, -lPx / 2, wPx, lPx);
    // heading marker: a small triangle pointing toward heading 0 (up)
    ctx.fillStyle = "#e8c46a";
    ctx.beginPath();
    ctx.moveTo(0, -lPx / 2);
    ctx.lineTo(-wPx * 0.18, -lPx / 2 + wPx * 0.28);
    ctx.lineTo(wPx * 0.18, -lPx / 2 + wPx * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
