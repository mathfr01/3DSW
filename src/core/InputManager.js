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
        this.gamepadIndex = null;
        this.gamepadConnected = false;
        this.deadzone = 0.15;
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

        // Gamepad support
        window.addEventListener('gamepadconnected', (e) => {
            console.log('Gamepad connected:', e.gamepad.id);
            this.gamepadIndex = e.gamepad.index;
            this.gamepadConnected = true;
        });

        window.addEventListener('gamepaddisconnected', (e) => {
            console.log('Gamepad disconnected:', e.gamepad.id);
            if (this.gamepadIndex === e.gamepad.index) {
                this.gamepadIndex = null;
                this.gamepadConnected = false;
            }
        });
    }

    updateGamepad() {
        if (!this.gamepadConnected || this.gamepadIndex === null) return;

        const gamepad = navigator.getGamepads()[this.gamepadIndex];
        if (!gamepad) return;

        // Apply deadzone
        const applyDeadzone = (value) => {
            if (Math.abs(value) < this.deadzone) return 0;
            return value;
        };

        // Left stick (movement) - typically axes 0 (horizontal) and 1 (vertical)
        const leftStickX = applyDeadzone(gamepad.axes[0]);
        const leftStickY = applyDeadzone(gamepad.axes[1]);

        // Right stick (camera) - typically axes 2 (horizontal) and 3 (vertical)
        const rightStickX = applyDeadzone(gamepad.axes[2]);
        const rightStickY = applyDeadzone(gamepad.axes[3]);

        // Map left stick to movement controls
        this.controls.joyMoveX = leftStickX;
        this.controls.joyMoveY = leftStickY;

        // Map right stick to camera controls
        this.controls.joyCamX = rightStickX;
        this.controls.joyCamY = rightStickY;

        // Map buttons (standard Xbox/PlayStation layout)
        // Button 0: A/Cross - Jump
        this.controls.jump = gamepad.buttons[0].pressed;

        // Button 1: B/Circle - Run toggle
        if (gamepad.buttons[1].pressed && !this.prevButton1) {
            this.controls.run = !this.controls.run;
        }
        this.prevButton1 = gamepad.buttons[1].pressed;

        // Button 2: X/Square - Not used currently
        // Button 3: Y/Triangle - Not used currently

        // Button 4: Left bumper - Not used currently
        // Button 5: Right bumper - Not used currently

        // Button 6: Left trigger - Not used currently
        // Button 7: Right trigger - Not used currently

        // Button 8: Select/Back - Toggle camera mode
        if (gamepad.buttons[8].pressed && !this.prevButton8) {
            // Trigger camera toggle event
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
        }
        this.prevButton8 = gamepad.buttons[8].pressed;

        // Button 9: Start - Start fishing (R key)
        if (gamepad.buttons[9].pressed && !this.prevButton9) {
            // Trigger fishing start event (R key)
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
        }
        this.prevButton9 = gamepad.buttons[9].pressed;

        // Button 3: Quit 
        if (gamepad.buttons[3].pressed && !this.prevButton3) {
            // Trigger fishing start event (R key)
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
        }
        this.prevButton3 = gamepad.buttons[3].pressed;

        // Button 10: Left stick press - Not used currently
        // Button 11: Right stick press - Not used currently

        // D-pad (buttons 12-15)
        // Button 12: D-pad up
        this.controls.forward = gamepad.buttons[12].pressed;
        // Button 13: D-pad down
        this.controls.backward = gamepad.buttons[13].pressed;
        // Button 14: D-pad left
        this.controls.left = gamepad.buttons[14].pressed;
        // Button 15: D-pad right
        this.controls.right = gamepad.buttons[15].pressed;
    }
}

export const inputManager = new InputManager();