// basic-analog-out
// this reads a value from pin A0 and outputs it to the serial port, repeatedly
// author: Rolf Widenfelt 2023

// note: the baud rate set with Serial.begin should match the value in the receiving code

// recent changes (as of Mar 9 2026)
// - changed speed to 9600 (was 115200)
// - changed delay to 5 ms (was 200 ms)
// - ESP32 range is 0-4095 so we use "map" to bring it back to 0-1023
// - seems to work!

// recommended circuit:
// you can wire up any kind of sensor to the Arduino pin A0 that you like.
// a simple thing to do is to connect a potentiometer where the "slider" pin
// is attached to A0, while the outer pins of the "pot" are attached to +5V and GND.

void setup() {
  Serial.begin(9600);
}

void loop() {
  int analogValue = analogRead(A0);
  analogValue = map(analogValue, 0, 4095, 0, 1023); // reduce range! (ESP32 range is 0-4095)
  Serial.println(analogValue);

  delay(5);
}
