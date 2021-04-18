/*
 * The Donut.
 *
 * Idea stol... I mean, inspired by:
 *   https://www.a1k0n.net/2011/07/20/donut-math.html
 */
class Vector {
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  scale(s) {
    return new Vector(this.x * s, this.y * s, this.z * s);
  }

  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  cross(v) {
    return new Vector(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x,
    );
  }

  normalize() {
    return this.scale(1 / Math.sqrt(this.dot(this)));
  }

  add(v) {
    return new Vector(
      this.x + v.x,
      this.y + v.y,
      this.z + v.z,
    );
  }
};

const X_AXIS = new Vector(1, 0, 0);
const Y_AXIS = new Vector(0, 1, 0);
const Z_AXIS = new Vector(0, 0, 1);

class Quaternion {
  static forRotation(angle, axis) {
    const a = angle / 2;
    return new Quaternion(Math.cos(a), axis.normalize().scale(Math.sin(a)));
  }
  constructor(scalar, vector) {
    this.scalar = scalar;
    this.vector = vector;
  }

  mult(q) {
    return new Quaternion(
      this.scalar * q.scalar - this.vector.dot(q.vector),
      q.vector.scale(this.scalar)
          .add(this.vector.scale(q.scalar))
          .add(this.vector.cross(q.vector)),
    );
  }

  conjugate() {
    return new Quaternion(this.scalar, this.vector.scale(-1));
  }

  rotate(v) {
    const r = new Quaternion(0, v);
    return this.mult(r).mult(this.conjugate()).vector;
  }
};

class Plotter {
  constructor(size, scale, distance, palette) {
    this.size = size + 1;
    this.bounds = {min: -size/2, max: size/2};
    this.scale = scale;
    this.distance = distance;
    this.palette = palette;
    this.reset();
  }

  reset() {
    this.zbuf = new Array(this.size * this.size);
    this.points = new Array(this.size * this.size);
  }

  plot(point, color) {
    if (color < 0 || color >= this.palette.length) {
      return;
    }
    const xp = Math.round(this.distance * point.x / point.z);
    if (xp < this.bounds.min || xp > this.bounds.max) {
      return;
    }
    const yp = Math.round(this.distance * point.y / point.z);
    if (yp < this.bounds.min || yp > this.bounds.max) {
      return;
    }
    const idx = (yp - this.bounds.min) * this.size + (xp - this.bounds.min);
    if (this.zbuf[idx] <= point.z) {
      return;
    }
    this.zbuf[idx] = point.z;
    this.points[idx] = {x: xp, y: yp, c: color};
  }

  render(ctx) {
    const colors = new Array(this.palette.length);
    for (let i = 0; i < colors.length; i++) {
      colors[i] = [];
    }
    this.points.forEach(p =>  colors[p.c].push(p));
    colors.forEach((ps, c) => {
      ctx.fillStyle = this.palette[c];
      ps.forEach(p => {
        ctx.fillRect(this.scale * (p.x - .5), this.scale * (.5 - p.y),
            this.scale, this.scale);
      });
    });
    this.reset();
  }
};

function makeColor(level) {
  return `rgb(${Math.max(level, 20)}%, ${Math.max(level/2, 10)}%, ${level/4}%)`;
};

function makePalette(size) {
  const palette = new Array(size);
  for(let i = 0; i < palette.length; i++) {
    palette[i] = makeColor(Math.round(i * 100)/(size - 1));
  }
  return palette;
};

class Donut {
  constructor(canvas, {
      scale = 8,
      size = 80,
      distance = 30,
      colors = 10,
  } = {}) {
    const displaySize = size * scale;
    this.width = this.height = displaySize;
    this.left = -this.width / 2;
    this.top = -this.height / 2;
    canvas.width = this.width;
    canvas.height = this.height;
    this.ctx = canvas.getContext('2d');
    this.ctx.translate(-this.left, -this.top);
    this.plotter = new Plotter(size, scale, distance, makePalette(colors));
    this.lastTs = null;
    this.a = 1;
    this.b = 1;
    this.R1 = 1;
    this.R2 = 2;
    this.CENTER = new Vector(0, 0, 5);
    this.LIGHT = new Vector(0, -1, 1).normalize();
    this.MAX_COLOR = colors - 1;
    this.PHI_INC = Math.PI / 160;
    this.T_INC = Math.PI / 80;
    this.FPS = 60;
  }

  update(ts) {
    const elapsed = ts - (this.lastTs || ts);
    this.lastTs = ts;
    const dt = elapsed * this.FPS / 1000;
    this.a += 0.07 * dt;
    this.b += 0.03 * dt;
    this.draw();
  }

  draw() {
    this.ctx.clearRect(this.left, this.top, this.width, this.height);
    
    const wobble = Quaternion.forRotation(this.b, Z_AXIS).mult(
        Quaternion.forRotation(this.a, X_AXIS)); 

    for (let phi = 0; phi < 2 * Math.PI; phi += this.PHI_INC) {
      const body = wobble.mult(Quaternion.forRotation(phi, Y_AXIS));
      for (let t = 0; t < 2 * Math.PI; t += this.T_INC) {
        const rim = Quaternion.forRotation(t, Z_AXIS);
        
        const donut = body.rotate(
          rim.rotate(X_AXIS.scale(this.R1)).add(X_AXIS.scale(this.R2))
        ).add(this.CENTER);
        
        const normal = body.rotate(rim.rotate(X_AXIS));
        const color = Math.max(0,
            Math.round(-this.LIGHT.dot(normal) * this.MAX_COLOR));
        
        this.plotter.plot(donut, color);
      }
    }
    this.plotter.render(this.ctx);
  }
};

window.onload = (e) => {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const donut = new Donut(canvas);
  const frame = function(ts) {
    donut.update(ts);
    window.requestAnimationFrame(frame);
  };
  window.requestAnimationFrame(frame);
};
