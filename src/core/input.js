import { vec2 } from 'gl-matrix';

class Input {
  constructor() {
    this.look = vec2.create();
    this.pointer = {
      movement: vec2.create(),
      position: vec2.create(),
    };
    window.addEventListener('mousedown', this.onMouseDown.bind(this), false);
    window.addEventListener('mousemove', this.onMouseMove.bind(this), false);
    window.addEventListener('mouseup', this.onMouseUp.bind(this), false);
  }

  onMouseDown({ button }) {
    const { pointer } = this;
    pointer.isDown = button === 0;
  }

  onMouseMove({ clientX, clientY, movementX, movementY }) {
    const { pointer: { movement, position } } = this;
    const sensitivity = 0.003;
    movement[0] -= movementX * sensitivity;
    movement[1] -= movementY * sensitivity;
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

  update() {
    const { pointer, look } = this;
    vec2.copy(look, pointer.movement);
    vec2.set(pointer.movement, 0, 0);
  }
}

export default Input;
