export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: canvas.width / 2, y: canvas.height / 2 };
    this.mousePressed = new Set();

    canvas.addEventListener('mousemove', (event) => {
      const bounds = canvas.getBoundingClientRect();
      this.mouse.x = (event.clientX - bounds.left) * canvas.width / bounds.width;
      this.mouse.y = (event.clientY - bounds.top) * canvas.height / bounds.height;
    });

    canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0) this.mousePressed.add('mouse1');
    });

    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (event.code === 'Escape') event.preventDefault();
      if (!event.repeat) this.pressed.add(key);
      if (!event.repeat && event.code) this.pressed.add(event.code.toLowerCase());
      this.keys.add(key);
    });

    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.key.toLowerCase());
    });
  }

  axis() {
    return {
      x: Number(this.keys.has('d') || this.keys.has('arrowright')) - Number(this.keys.has('a') || this.keys.has('arrowleft')),
      y: Number(this.keys.has('s') || this.keys.has('arrowdown')) - Number(this.keys.has('w') || this.keys.has('arrowup'))
    };
  }

  isDown(key) {
    return this.keys.has(key.toLowerCase());
  }

  wasPressed(key) {
    return this.pressed.has(key.toLowerCase());
  }

  wasMousePressed(button) {
    return this.mousePressed.has(button);
  }

  mouseWorld(camera) {
    return { x: this.mouse.x + camera.position.x, y: this.mouse.y + camera.position.y };
  }

  endFrame() {
    this.pressed.clear();
    this.mousePressed.clear();
  }
}