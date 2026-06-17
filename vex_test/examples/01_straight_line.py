# Library imports
from vex import *

# Robot configuration code
brain = Brain()
left_drive_smart = Motor(Ports.PORT1, GearSetting.RATIO_18_1, False)
right_drive_smart = Motor(Ports.PORT11, GearSetting.RATIO_18_1, True)
drivetrain = SmartDrive(left_drive_smart, right_drive_smart, wheel_travel=300,
                        track_width=320, wheel_base=320, units=MM)

# begin project code
drivetrain.drive_for(FORWARD, 600, MM)
drivetrain.turn_for(RIGHT, 90, DEGREES)
drivetrain.drive_for(FORWARD, 300, MM)
drivetrain.turn_for(LEFT, 90, DEGREES)
drivetrain.drive_for(REVERSE, 200, MM)
brain.screen.print("done!")
