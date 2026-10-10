# Test evidence

These screenshots were captured from the Wokwi simulation and the web
dashboard. They show the main protection, control, and communication tests.

## Build result

The firmware compiled successfully with ESP32 Arduino core 3.3.11.

- Program storage: 980,375 bytes (74%)
- Dynamic memory: 49,148 bytes (14%)

## Test results

| Test | Result | Evidence |
| --- | --- | --- |
| Startup | The system starts with the relay open and waits for a manual reset. | [Figure 13](figures/13_mqtt_connected.png) |
| Normal operation | A valid reset reconnects the load after the healthy delay. | [Figure 01](figures/01_normal_operation_load_on.png) |
| Over-voltage | The relay opens and the fault is latched. | [Figure 03](figures/03_overvoltage_fault_trip.png), [Figure 04](figures/04_oled_overvoltage_detail.png) |
| Under-voltage | The relay opens and an under-voltage fault is shown. | [Figure 10](figures/10_undervoltage_fault_trip.png) |
| Over-current | The relay opens and the protected load turns off. | [Figure 02](figures/02_overcurrent_fault_trip.png) |
| Sudden voltage rise | The surge trip is recorded in the activity log. | [Figure 09](figures/09_web_dashboard_activity_log.png) |
| Fault cleared | The load stays off and the yellow LED requests a manual reset. | [Figure 11](figures/11_fault_cleared_reset_required.png) |
| Unsafe reset | A reset request is rejected while the fault is still active. | [Figure 16](figures/16_unsafe_reset_rejected.png) |
| Local settings | The keypad menu can view and edit limits, while unsafe values are rejected. | [Figure 05](figures/05_settings_menu_overview.png), [Figure 06](figures/06_settings_menu_edit_min_voltage.png), [Figure 12](figures/12_invalid_settings_rejected.png) |
| Remote dashboard | The webpage shows measurements, limits, indicators, graphs, and activity. | [Figure 07](figures/07_web_dashboard_normal_operation.png), [Figure 08](figures/08_web_dashboard_fault_history.png), [Figure 09](figures/09_web_dashboard_activity_log.png) |
| MQTT connection | The OLED and Serial Monitor confirm that MQTT is online. | [Figure 13](figures/13_mqtt_connected.png) |
| MQTT outage | Local protection still trips correctly while MQTT is offline. | [Figure 17](figures/17_mqtt_outage_local_protection.png) |
| System power | The blue button turns the simulated system off and on. | [Figure 14](figures/14_system_power_off.png), [Figure 15](figures/15_system_power_on.png) |

All listed tests have linked evidence.

## Indicator states

- **Red:** an electrical fault is active.
- **Yellow:** the fault has cleared, but a manual reset is required.
- **Green:** the relay is closed and the protected load is connected.
- **Blue:** the protection system is on.
