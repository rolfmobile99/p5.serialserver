/**
 * p5.serialserver.js
 * Updated for compatibility with serialport v10+ and modern Node.js (v18+)
 *
 * Original authors: Shawn Van Every <Shawn.Van.Every@nyu.edu>, Jiwon Shin <jiwon.shin@nyu.edu>
 * Updated for serialport v10+ API by: Claude (Anthropic)
 *
 * Key changes from v9 to v10+:
 *  - `const SerialPort = require('serialport')` → `const { SerialPort } = require('serialport')`
 *  - `SerialPort.list()` → now returns a Promise; use `await SerialPort.list()`
 *  - Constructor: `new SerialPort(path, options)` → `new SerialPort({ path, baudRate, ... })`
 *  - `autoOpen: false` still works
 *  - Parsers: `SerialPort.parsers.Readline` → `require('@serialport/parser-readline').ReadlineParser`
 *  - `port.open(cb)` still works
 *  - `port.write(data)` still works
 *  - `port.close(cb)` still works
 *  - Error event still works
 *  - `data` event on `port` now emits Buffer (same as v9)
 */

'use strict';

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const WebSocket = require('ws');

const WS_PORT = 8081;

let wss;
let ports = {}; // open serial ports keyed by path

/**
 * Create and start the WebSocket server.
 * @param {number} [wsPort=8081] - The port for the WebSocket server.
 * @returns {WebSocket.Server}
 */
function startServer(wsPort) {
  wsPort = wsPort || WS_PORT;

  wss = new WebSocket.Server({ port: wsPort }, function () {
    console.log('p5.serialserver: WebSocket server started on port ' + wsPort);
  });

  wss.on('connection', function (ws) {
    console.log('p5.serialserver: Client connected');

    ws.on('message', function (data) {
      // data arrives as a Buffer in ws v8+
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (e) {
        console.error('p5.serialserver: Could not parse message:', data.toString());
        return;
      }
      console.log('DEBUG: p5.serialserver: msg received: ' + JSON.stringify(msg));  // DEBUG -rolf
      handleMessage(ws, msg);
    });

    ws.on('close', function () {
      console.log('p5.serialserver: Client disconnected');
    });

    ws.on('error', function (err) {
      console.error('p5.serialserver: WebSocket error:', err.message);
    });

    // Send a 'connected' handshake immediately
    sendToClient(ws, { method: 'echo', data: 'connected' });
  });

  return wss;
}

/**
 * Stop the WebSocket server and close all open serial ports.
 */
function stopServer() {
  Object.keys(ports).forEach(function (path) {
    try {
      if (ports[path] && ports[path].isOpen) {
        ports[path].close();
      }
    } catch (e) { /* ignore */ }
  });
  ports = {};
  if (wss) {
    wss.close();
    wss = null;
  }
}

/**
 * Route an incoming WebSocket message to the correct handler.
 */
function handleMessage(ws, msg) {
  if (!msg || !msg.method) return;

  switch (msg.method) {
    case 'list':
      listPorts(ws);
      break;
    //case 'open':
    case 'openserial':
      openPort(ws, msg.data);
      break;
    case 'write':
      writeToPort(ws, msg.data);
      break;
    case 'close':
      closePort(ws, msg.data);
      break;
    case 'echo':
      sendToClient(ws, { method: 'echo', data: msg.data });
      break;
    default:
      console.warn('p5.serialserver: Unknown method:', msg.method);
  }
}

/**
 * List available serial ports and send them to the client.
 */
function listPorts(ws) {
  SerialPort.list()
    .then(function (portList) {
      // portList is an array of PortInfo objects: { path, manufacturer, ... }
      const paths = portList.map(function (p) { return p.path; });
      sendToClient(ws, { method: 'list', data: paths });
    })
    .catch(function (err) {
      console.error('p5.serialserver: Error listing ports:', err.message);
      sendToClient(ws, { method: 'error', data: 'Error listing ports: ' + err.message });
    });
}

/**
 * Open a serial port.
 * @param {WebSocket} ws
 * @param {object} options - { port, baudRate, bufferSize }
 */
function openPort(ws, options) {
  if (!options || !options.serialport) {    // note: this WAS !options.port which was not found. -rolf
    sendToClient(ws, { method: 'error', data: 'No port specified' });
    return;
  }

  const path = options.serialport;
  const baudRate = options.baudRate || 9600;

  // If already open for this client, close first
  if (ports[path] && ports[path].isOpen) {
    console.log('p5.serialserver: Port already open, closing first:', path);
    ports[path].close(function () {
      doOpen(ws, path, baudRate, options);
    });
  } else {
    doOpen(ws, path, baudRate, options);
  }
}

function doOpen(ws, path, baudRate, options) {
  // serialport v10+: constructor takes a single options object
  const port = new SerialPort({
    path: path,
    baudRate: baudRate,
    autoOpen: false
  });

  port.open(function (err) {
    if (err) {
      console.error('p5.serialserver: Error opening port:', err.message);
      sendToClient(ws, { method: 'openerror', data: { portname: path, error: err.message } });
      return;
    }

    console.log('p5.serialserver: Opened port:', path, 'at', baudRate, 'baud');
    ports[path] = port;
    sendToClient(ws, { method: 'open', data: path });

    // Listen for raw data and forward to client
    port.on('data', function (data) {
      // data is a Buffer; convert to a string or array as needed
      sendToClient(ws, { method: 'data', data: data.toString() });
    });

    port.on('error', function (err) {
      console.error('p5.serialserver: Serial port error on', path, ':', err.message);
      sendToClient(ws, { method: 'error', data: { portname: path, error: err.message } });
    });

    port.on('close', function () {
      console.log('p5.serialserver: Port closed:', path);
      delete ports[path];
      sendToClient(ws, { method: 'close', data: path });
    });
  });
}

/**
 * Write data to an open serial port.
 * @param {WebSocket} ws
 * @param {object} options - { port, data }
 */
function writeToPort(ws, options) {
  if (!options || !options.serialport) {
    sendToClient(ws, { method: 'error', data: 'No port specified for write' });
    return;
  }

  const path = options.serialport;
  const port = ports[path];

  if (!port || !port.isOpen) {
    sendToClient(ws, { method: 'error', data: 'Port not open: ' + path });
    return;
  }

  const payload = options.data !== undefined ? options.data : '';

  port.write(payload, function (err) {
    if (err) {
      console.error('p5.serialserver: Write error on', path, ':', err.message);
      sendToClient(ws, { method: 'error', data: { portname: path, error: err.message } });
    }
    // Optionally drain to ensure data is flushed
    port.drain(function (drainErr) {
      if (drainErr) {
        console.error('p5.serialserver: Drain error on', path, ':', drainErr.message);
      }
    });
  });
}

/**
 * Close a serial port.
 * @param {WebSocket} ws
 * @param {object|string} options - { port } or just the port path string
 */
function closePort(ws, options) {
  const path = (typeof options === 'string') ? options : (options && options.serialport);

  if (!path) {
    sendToClient(ws, { method: 'error', data: 'No port specified for close' });
    return;
  }

  const port = ports[path];
  if (!port) {
    sendToClient(ws, { method: 'error', data: 'Port not found: ' + path });
    return;
  }

  if (port.isOpen) {
    port.close(function (err) {
      if (err) {
        console.error('p5.serialserver: Close error on', path, ':', err.message);
        sendToClient(ws, { method: 'error', data: { portname: path, error: err.message } });
      }
      // The 'close' event on the port will handle cleanup and sending the close message
    });
  } else {
    delete ports[path];
    sendToClient(ws, { method: 'close', data: path });
  }
}

/**
 * Helper: send a JSON message to a WebSocket client.
 */
function sendToClient(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(obj));
    } catch (e) {
      console.error('p5.serialserver: Error sending to client:', e.message);
    }
  }
}

module.exports = {
  startServer: startServer,
  stopServer: stopServer
};
