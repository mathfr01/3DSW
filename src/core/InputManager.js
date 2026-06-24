export class VirtualJoystick {
    constructor(baseElement, knobElement, onChange) {
        this.base = baseElement;
        this.knob = knobElement;
        this.onChange = onChange;
        this.active = false;
        this.touchId = null;
        this.value = { x: 0, y: 0 };
        this.center = { x: 0, y: 0 };
        this.radius = 70; // Half of 140px width

        if (!this.base) return;

        this.base.addEventListener('touchstart', this.handleStart.bind(this), { passive: false });
        this.base.addEventListener('touchmove', this.handleMove.bind(this), { passive: false });
        this.base.addEventListener('touchend', this.handleEnd.bind(this));
        this.base.addEventListener('touchcancel', this.handleEnd.bind(this));
    }

    handleStart(e) {
        e.preventDefault();
        if (this.active) return;

        const rect = this.base.getBoundingClientRect();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];

            if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
                touch.clientY >= rect.top && touch.clientY <= rect.bottom) {

                this.active = true;
                this.touchId = touch.identifier;
                this.center = {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                };
                this.radius = rect.width / 2;
                this.updatePosition(touch.clientX, touch.clientY);
                break;
            }
        }
    }

    handleMove(e) {
        if (!this.active) return;
        e.preventDefault();

        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === this.touchId) {
                this.updatePosition(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
                break;
            }
        }
    }

    handleEnd(e) {
        if (!this.active) return;

        let touchEnded = false;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === this.touchId) {
                touchEnded = true;
                break;
            }
        }

        if (touchEnded || e.touches.length === 0) {
            this.active = false;
            this.touchId = null;
            this.value = { x: 0, y: 0 };
            this.knob.style.transform = `translate(-50%, -50%)`;
            if (this.onChange) this.onChange(this.value);
        }
    }

    updatePosition(clientX, clientY) {
        let dx = clientX - this.center.x;
        let dy = clientY - this.center.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > this.radius) {
            dx = (dx / distance) * this.radius;
            dy = (dy / distance) * this.radius;
        }

        this.value = {
            x: dx / this.radius,
            y: dy / this.radius
        };

        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        if (this.onChange) this.onChange(this.value);
    }
}

class InputManager {
    constructor() {
        this.keys = {};
        this.controls = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            run: false,
            jump: false,
            autoMove: false,
            autoRun: false,
            joyMoveX: 0,
            joyMoveY: 0,
            joyCamX: 0,
            joyCamY: 0
        };
        this.leftJoystick = null;
        this.rightJoystick = null;
    }

    init() {
        window.addEventListener('keydown', (event) => {
            this.keys[event.code] = true;
            if (event.code === 'KeyW' || event.code === 'KeyS') {
                this.controls.autoMove = false;
                this.controls.autoRun = false;
            }
            if (event.code === 'KeyF') {
                this.controls.autoMove = true;
                this.controls.autoRun = false;
            }
            if (event.code === 'KeyG') {
                this.controls.autoMove = false;
                this.controls.autoRun = true;
            }
            if (event.code === 'Space') {
                event.preventDefault();
            }
        });

        window.addEventListener('keyup', (event) => {
            this.keys[event.code] = false;
            if (event.code === 'KeyW' || event.code === 'KeyS') {
                this.controls.autoMove = false;
                this.controls.autoRun = false;
            }
        });

        const leftJoyBase = document.getElementById('joystickLeft');
        const leftJoyKnob = document.getElementById('joystickLeftKnob');
        if (leftJoyBase && leftJoyKnob) {
            this.leftJoystick = new VirtualJoystick(leftJoyBase, leftJoyKnob, (val) => {
                this.controls.joyMoveX = val.x;
                this.controls.joyMoveY = val.y;
            });
        }

        const rightJoyBase = document.getElementById('joystickRight');
        const rightJoyKnob = document.getElementById('joystickRightKnob');
        if (rightJoyBase && rightJoyKnob) {
            this.rightJoystick = new VirtualJoystick(rightJoyBase, rightJoyKnob, (val) => {
                this.controls.joyCamX = val.x;
                this.controls.joyCamY = val.y;
            });
        }

        const mobileButtons = document.querySelectorAll('.action-btn');
        mobileButtons.forEach(button => {
            const action = button.dataset.action;
            if (!action) return;

            button.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.controls[action] = true;
            });

            button.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.controls[action] = false;
            });

            button.addEventListener('mousedown', () => {
                this.controls[action] = true;
            });

            button.addEventListener('mouseup', () => {
                this.controls[action] = false;
            });
        });
    }
}

export const inputManager = new InputManager();