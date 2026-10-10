# Test evidence checklist

Firmware build verified locally with ESP32 Arduino core 3.3.11:

- Program storage: 980,375 bytes (74%).
- Dynamic memory: 49,148 bytes (14%).
- Build result: successful.

Capture screenshots or logs for these cases before submission:

| Test | Stimulus | Expected result | Evidence |
| --- | --- | --- | --- |
| Startup latch | Start simulation | Relay off; startup state shown | [figures/13](figures/13_mqtt_connected.png) |
| Healthy reset | Nominal V/I, request reset | Relay on after configured delay | [figures/01](figures/01_normal_operation_load_on.png) |
| Over-voltage | Raise voltage above `v_max` | Immediate trip and latched fault | [figures/03](figures/03_overvoltage_fault_trip.png), [figures/04](figures/04_oled_overvoltage_detail.png), [figures/08](figures/08_web_dashboard_fault_history.png) |
| Under-voltage | Lower voltage below `v_min` | Immediate trip and latched fault | [figures/10](figures/10_undervoltage_fault_trip.png) |
| Over-current | Raise current above `i_max` | Immediate trip and latched fault | [figures/02](figures/02_overcurrent_fault_trip.png), [figures/08](figures/08_web_dashboard_fault_history.png) |
| Sudden surge | Increase voltage by `surge_step_v` between samples | Surge trip | [figures/09](figures/09_web_dashboard_activity_log.png) |
| Unsafe reset | Request reset while fault remains | Relay stays off and reset is rejected | [figures/16](figures/16_unsafe_reset_rejected.png) |
| Fault recovery | Return readings to normal after a trip | Load remains off; yellow manual-reset indicator turns on | [figures/11](figures/11_fault_cleared_reset_required.png) |
| Keypad settings | Edit and save each field | OLED confirmation and persistence | [figures/05](figures/05_settings_menu_overview.png), [figures/06](figures/06_settings_menu_edit_min_voltage.png) |
| Invalid settings | Submit an unsafe threshold combination | Settings are rejected | [figures/12](figures/12_invalid_settings_rejected.png) |
| Remote settings | Publish profile from dashboard | Device acknowledgement and new limits | [figures/07](figures/07_web_dashboard_normal_operation.png) |
| MQTT connection | Start the network connection | OLED shows online and Serial Monitor confirms connection | [figures/13](figures/13_mqtt_connected.png) |
| MQTT outage | Disconnect network/broker | Local protection remains operational | [figures/17](figures/17_mqtt_outage_local_protection.png) |
| Master power OFF | Press blue power button / `P` | Relay/load, LEDs and OLED turn off | [figures/14](figures/14_system_power_off.png) |
| Master power ON | Press blue power button / `P` again | Blue LED on; yellow reset-required state; load remains off | [figures/15](figures/15_system_power_on.png) |

All listed test cases now have linked evidence.

After a fault clears but before reset, serial output intentionally separates the
live condition from the safety latch, for example:

```text
V: 233.3 I: 4.93 LOAD: OFF ACTIVE: NORMAL LATCHED: OVER CURRENT RESET: REQUIRED
```

This means the measurement is healthy now, while the load remains disconnected
until the operator requests a safe reset.

## Indicator-state verification

| Electrical condition | Red fault LED | Yellow reconnect LED | Green protected load | Relay |
| --- | --- | --- | --- | --- |
| Active fault | ON | OFF | OFF | Open |
| Fault cleared, reset required | OFF | ON | OFF | Open |
| Reset requested, waiting delay | OFF | ON | OFF | Open |
| Healthy and reconnected | OFF | OFF | ON | Closed |
| Fault returns during delay | ON | OFF | OFF | Open; reset cancelled |

The reset command is rejected while an electrical fault is active. The buzzer
sounds only with the red active-fault state and stops when the readings recover.
