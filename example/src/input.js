import { vec2 } from 'gl-matrix';

class Input {
  constructor() {
    this.look = {
      state: vec2.fromValues(Math.PI * 0.5, 0),
      target: vec2.fromValues(Math.PI * 0.5, 0),
    };
    this.pointer = {
      movement: vec2.create(),
      position: vec2.create(),
    };
    this.zoom = {
      state: 0.75,
      target: 0.75,
    };
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onMouseWheel = this.onMouseWheel.bind(this);
    window.addEventListener('mousedown', this.onMouseDown, false);
    window.addEventListener('mousemove', this.onMouseMove, false);
    window.addEventListener('mouseup', this.onMouseUp, false);
    window.addEventListener('wheel', this.onMouseWheel, { passive: false });
  }

  destroy() {
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('wheel', this.onMouseWheel);
  }

  onMouseDown({ button }) {
    const { pointer } = this;
    pointer.isDown = button === 0;
  }

  onMouseMove({ clientX, clientY, movementX, movementY }) {
    const { sensitivity } = Input;
    const { pointer: { movement, position } } = this;
    movement[0] -= movementX * sensitivity.look;
    movement[1] -= movementY * sensitivity.look;
    vec2.set(
      position,
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
  }

  onMouseUp({ button }) {
    const { pointer } = this;
    if (button === 0) {
      pointer.isDown = false;
    }
  }

  onMouseWheel(e) {
    if (e.ctrlKey) {
      e.preventDefault();
    }
    const { sensitivity, minZoom, zoomRange } = Input;
    const { zoom } = this;
    const logZoom = Math.min(
      Math.max(
        ((Math.log(zoom.target) - minZoom) / zoomRange) + (e.deltaY * sensitivity.zoom),
        0
      ),
      1
    );
    zoom.target = Math.exp(minZoom + logZoom * zoomRange);
  }

  update(delta) {
    const { minPhi, maxPhi } = Input;
    const { pointer, look, zoom } = this;
    if (pointer.isDown) {
      look.target[1] += pointer.movement[0];
      look.target[0] = Math.min(Math.max(look.target[0] + pointer.movement[1], minPhi), maxPhi);
    } else {
      look.target[1] += delta * 0.3;
    }
    const damp = 1 - Math.exp(-10 * delta);
    vec2.lerp(look.state, look.state, look.target, damp);
    zoom.state = zoom.state * (1 - damp) + zoom.target * damp;
    vec2.set(pointer.movement, 0, 0);
  }
}

Input.sensitivity = {
  look: 0.003,
  zoom: 0.0003,
};
Input.minPhi = 0.000001;
Input.maxPhi = Math.PI - 0.000001;
Input.minZoom = Math.log(0.25);
Input.maxZoom = Math.log(1.5);
Input.zoomRange = Input.maxZoom - Input.minZoom;

export default Input;
