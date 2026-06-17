# Library imports
from vex import *

brain = Brain()
left_drive_smart = Motor(Ports.PORT1, GearSetting.RATIO_18_1, False)
right_drive_smart = Motor(Ports.PORT11, GearSetting.RATIO_18_1, True)
drivetrain = SmartDrive(left_drive_smart, right_drive_smart, wheel_travel=300,
                        track_width=320, wheel_base=320, units=MM)
bumper = Bumper(Ports.PORT2)

# Run once first with no scheduling (the loop always takes the "drive"
# branch). Then in the Inputs panel, under Mid-run input changes, add a
# Sensor: Bumper press window (e.g. down at t=0.3s, up at t=0.7s) and
# re-run to see the middle iteration(s) take the "turn away" branch
# instead.
for i in range(4):
    if bumper.pressing():
        brain.screen.print("bumper pressed - turning away")
        drivetrain.turn_for(RIGHT, 90, DEGREES)
    else:
        drivetrain.drive_for(FORWARD, 200, MM)
    wait(200, MSEC)
