// example of p5.SerialPort connecting to an Arduino with a sensor

// this code WORKS.
// but it does print a mysterious error that I have not tracked down:
//   Unknown Method: [object Object]
// this happens after the callback gotList() is called successfully,
// and the port is opened.
// -rolf


// variable for p5.SerialPort object
let serial;

// variable for latest incoming data
let latestData = 'waiting for incoming data';

// variable for serialPortName
// note: sometimes it wants the "tty" instead of "cu" port name.
// check with the list before choosing one!

//let serialPortName = '/dev/tty.usbmodem1101';
let serialPortName = '/dev/tty.usbmodem101';  // for esp32 xiao board

// variable for HTML DOM input for serial port name
let htmlInputPortName;

// variable for HTML DOM button for entering new serial port name
let htmlButtonPortName;

let incomingData = -1;


function setup() {
  createCanvas(300, 300);

  // set text alignment
  textAlign(LEFT, CENTER);

  // p5.js to create HTML input and set initial value
  htmlInputPortName = createInput(serialPortName);

  // p5.js to create HTML button and set message
  button = createButton('update port');

  // p5.js to add callback function for mouse press
  button.mousePressed(updatePort);

  // create instance of p5.SerialPort
  serial = new p5.SerialPort();

  // print version of p5.SerialPort library
  // note: this no longer works
  //console.log('p5.serialport.js version: ' + serial.version);

  // here are the callbacks that you can register

  // when we connect to the underlying server
  serial.on('connected', gotServerConnection);

  // when we get a list of serial ports that are available
  serial.on('list', gotList);

  // When we some data from the serial port
  serial.on('data', gotData);  // is this needed??

  // When or if we get an error
  serial.on('error', gotError);

  // When our serial port is opened and ready for read/write
  serial.on('open', gotOpen);

  serial.on('close', gotClose);

  // Callback to get the raw data, as it comes in for handling yourself
  serial.on('rawdata', gotRawData);


  // get a list the ports available
  // you should have a callback defined to see the results
  serial.list();
}


function draw() {
  background("yellow");

  let cx = width/2;
  let cy = height/2;

  let minsize = int(width*0.2);
  let maxsize = int(width*0.8);

  if (incomingData != -1) {
    let sensorValue = incomingData;
    let esize = map(sensorValue, 0, 1023, minsize, maxsize);
    
    noStroke();
    fill("cyan");
    ellipse(cx, cy, esize, esize);

    fill("black");
    text("sensor value: " + str(sensorValue), 20, 30);
  }
}


// callback function to update serial port name
function updatePort() {
  // retrieve serial port name from the text area
  serialPortName = htmlInputPortName.value();
  // open the serial port
  serial.open(serialPortName);
}

// We are connected and ready to go
function gotServerConnection() {
  print('connected to server');
}

// Got the list of ports
function gotList(list) {
  print('list of serial ports:');
  // list is an array of their names
  for (let i = 0; i < list.length; i++) {
    print(list[i]);
  }
}

// Connected to our serial device
function gotOpen() {
  print('serial port is open');
}

function gotClose() {
  print('serial port is closed');
  latestData = 'serial port is closed';
}

// Oops, here is an error, let's log it
function gotError(e) {
  print('error: ' + e);
}

// there is data available to work with from the serial port
function gotData() {
  // read the incoming string
  let currentString = serial.readLine();
  // remove any trailing whitespace
  trim(currentString);
  // if the string is empty, do no more
  if (!currentString) {
    return;
  }
  // print the string
  console.log(currentString);
  // save it for the draw method
  latestData = currentString;
}

// we got raw from the serial port
function gotRawData(data) {
  //print('gotRawData: ' + data);
  incomingData = data;
}
