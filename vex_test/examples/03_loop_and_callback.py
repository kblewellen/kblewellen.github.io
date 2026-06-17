# Library imports
from vex import *

brain = Brain()
left_drive_smart = Motor(Ports.PORT1, GearSetting.RATIO_18_1, False)
right_drive_smart = Motor(Ports.PORT11, GearSetting.RATIO_18_1, True)
drivetrain = SmartDrive(left_drive_smart, right_drive_smart, wheel_travel=300,
                        track_width=320, wheel_base=320, units=MM)
controller_1 = Controller(PRIMARY)


def stop_and_spin(direction):
    drivetrain.stop()
    drivetrain.turn_for(direction, 180, DEGREES)


def on_button_a():
    brain.screen.print("Button A pressed!")
    stop_and_spin(RIGHT)


controller_1.buttonA.pressed(on_button_a)

# This is the kind of infinite loop a real competition template uses - the
# simulator's time-limit watchdog cuts it off cleanly rather than hanging
# the tab. To see on_button_a() fire mid-run, add a Mid-run input change:
# Controller: A, down at t=1.0s (leave "up at" blank), then re-run - the
# robot should stop driving forward and spin in place once the clock
# passes 1.0s.
while True:
    drivetrain.drive_for(FORWARD, 50, MM)
    wait(20, MSEC)
