const assert = require('assert');
const dgram = require('dgram');
const dns = require('dns');
const os = require('os');
const protocol = require('./protocol');
const readline = require('readline');

// Standard timeout for a response to a request.
const msg_timeout = 1000;

const args = process.argv.slice(2);
assert(args.length == 2);

const socket_out = dgram.createSocket('udp4');
const socket_in = dgram.createSocket('udp4');

const reg_service_hostname = args[0];
const reg_service_port = args[1];

const local_address = getThisHostIP();

var reg_service_address;
dns.lookup(reg_service_hostname, (err, address, family) => {
    if (err) {
        console.log("error resolving service hostname");
        process.exit(0);
    }

    reg_service_address = address;

    console.log('regServerIP:', address);
    console.log('thisHostIP:', local_address);

    bind_sockets();
});

// Holds mappings from port number to an object holding {service name, service
// data, and a timer id}. The timer id specifies a timer object used for
// reregistering the service.
// var port_map = new Map();
port_map = {};
last_register_msg = {};
last_msg_timeout = null;
var seq_num = 0;
var last_msg_sent = -1;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});
rl.setPrompt('Enter r(egister), u(nregister), f(etch), p(robe), or q(uit): ');
rl.pause();

messageQueue = [];
function processQueue(messageAction){
  rl.pause(); // ?
  if (messageAction != undefined) {
    messageQueue.push(messageAction);
  }
  if (messageQueue.length > 0) {
    nextAction = messageQueue.shift();
    if (nextAction != undefined) {
      nextAction();
    }
  }
}

function protocolError(){
    console.log("Protocol Error");
    socket_out.close();
    socket_in.close();
    process.exit(1);
}

function msgTimeout(errMsg){
  console.log(errMsg);
  last_msg_timeout = {};
  last_register_msg = null;
  last_msg_sent = -1;
  processQueue();
  rl.prompt();
  rl.resume();
}

// Message Handlers //
function register_callback(msg, rinfo){
    setTimeout(function(){console.log("timeout");}, 0);
    if (last_msg_sent != protocol.REGISTER || !last_register_msg){
        protocolError();
    }
    clearTimeout(last_msg_sent);
    data = protocol.unpackRegistered(msg);
    if (data == null) { protocolError();}
    // change if switch to map
    port = last_register_msg.service_port;
    if (port in port_map && 'timeout' in port_map[port] && port_map[port].timeout != null){
      clearTimeout(port_map[port].timeout);
    }
    port_map[port] = last_register_msg;
    service_data = last_register_msg['service_data'];
    service_name = last_register_msg['service_name'];
    // needs to account for state and wait until response received for
    // outstanding messages
    // Needs to have a global message queue which is triggered by msgTimeout, a
    // response, user input or a re-register. Any time a new message is wanting
    // to be sent we add it to the queue and start a recursive function which
    // empties the queue
    port_map[port]['timeout'] = setTimeout(function(){
      // add_to_queue((port, service_data, service_name) => send_register)
      // processQueue([callback]) {
      //  push(callback);
      //  first = pop()
      //  first();
      //}
      //called in re-register timeout, on user input and on-message-response
      processQueue(function(){
        send_register(port, service_data, service_name)});}, msg_timeout);
    last_register_msg = {};
    console.log("Register successful.");
}

function fetch_callback(msg, rinfo){
    if (last_msg_sent != protocol.FETCH) {
      protocolError();
    }
    clearTimeout(last_msg_timeout);
    data = protocol.unpackFetchResponse(msg);
    if (data == null) {protocolError();}
    console.log(data.entries);
  // do stuff
}

function probe_callback(msg, rinfo){
    send_ack(socket_in);
}

function ack_callback(msg, rinfo){
    if (last_msg_sent == protocol.PROBE){
        clearTimeout(last_msg_timeout);
        last_msg_sent = -1;
        console.log("Probe successful.");
    }else if(last_msg_sent == protocol.UNREGISTER){
        clearTimeout(last_msg_timeout);
        last_msg_sent = -1;
        console.log("Unregister sucessful.");
    }else{
        protocolError();
    }
}

function send(msg, socket, callback){
    console.log(msg);
    socket.send(msg, 0, msg.length, reg_service_port, reg_service_address, callback);
}

// Command Handlers //
function send_register(port, service_data, service_name){
    console.log("sending register");
    last_register_msg = {"service_port": port, "service_name": service_name, "service_data": service_data, "timeout": null};
    msg = protocol.packRegister(seq_num++, local_address, port, service_data, service_name);
    send(msg, socket_out, function(err){
      console.log("sent message");
      console.log(err);
      last_msg_sent = protocol.REGISTER;
    });
    errMsg = "Register unsuccessful";
    last_msg_timeout = setTimeout(function(){msgTimeout(errMsg);}, msg_timeout);
}

function send_fetch(service_name){
    msg = protocol.packFetch(seq_num++, service_name);
    send(msg, socket_out, function() {
      last_msg_sent = protocol.FETCH;
    });
    errMsg = "Fetch unsuccessful.";
    last_msg_timeout = setTimeout((errMsg) => msgTimeout, msg_timeout);
}

function send_unregister(port){
    msg = protocol.packUnregister(seq_num++, local_address, port);
    send(msg, socket_out, function(){
      last_msg_sent = protocol.UNREGISTER;
    });
    delete port_map[port];
    errMsg = "Unregister unsuccessful.";
    last_msg_timeout = setTimeout((errMsg) => msgTimeout, msg_timeout);
}

function send_probe(){
    console.log("sending probe");
    msg = protocol.packProbe(seq_num++);
    send(msg, socket_out, function(){
      last_msg_sent = protocol.PROBE;
    });
    errMsg = "Probe unsuccessful.";
    last_msg_timeout = setTimeout((errMsg) => msgTimeout, msg_timeout);
}

function send_ack(socket){
    msg = protocol.packAck();
    send(msg, socket, function(){
    });
}

// IO and IO EVENT BINDINGS
// -------------------------------------------------------------------------- //
rl.on('line', (line) => {
    rl.pause();
    var arguments = line.split(" ");
    switch (arguments[0]) {
        case "r":
            if (arguments.length != 4) {
                console.log("Register command format is: r port service_data service_name");
                rl.prompt();
                rl.resume();
                break;
            }
            var port = parseInt(arguments[1]);
            var service_data = arguments[2];
            var service_name = arguments[3];
            processQueue(function(){
              send_register(port, service_data, service_name);
            });
            break;
        case "u":
            if (arguments.length != 2) {
              console.log("Unregister command format is: u service_port");
              rl.prompt();
              rl.resume();
              break;
            }
            var portnum = parseInt(arguments[1]);
            processQueue(function(){
              send_unregister(portnum);
            });
            break;
        case "f":
            if (arguments.length != 2) {
              console.log("Fetch command format is: f service_name");
              rl.prompt();
              rl.resume();
              break;
            }
            var service_name = arguments[1];
            processQueue(function(){
              send_fetch(service_name);
            });
            break;
        case "p":
            // Note: Not really necessary to wrap this
            processQueue(function(){
              send_probe();
            });
            break;
        case "q":
            rl.close();
            break;
        default:
            console.log("Unrecognized Command");
            rl.resume();
            break;
    }
});

rl.on('close', () => {
    socket_in.close();
    socket_out.close();
    process.exit(1);
});

// function arguments:
//    msg
//    rinfo
MSG_HANDLER = {"2": register_callback, "4": fetch_callback, "6": probe_callback, "7": ack_callback};

// function arguments:
//    socket
//
CMD_HANDLER = {"1": send_register, "3": send_fetch, "5": send_unregister, "6": send_probe, "7": send_ack};

// Only used here so that we know when both sockets are listening.
var num_listening = 0;

socket_out.on('listening', () => {
    console.log('socket_out listening');
    num_listening++;
    if (num_listening == 2) {
        rl.prompt();
        rl.resume();
    }
});

socket_in.on('listening', () => {
    num_listening++;
    if (num_listening == 2) {
        rl.prompt();
        rl.resume();
    }
});

socket_out.on('error', (err) => {
    sock_err(err);
});

socket_in.on('error', (err) => {
    sock_err(err);
});

function sock_err(err) {
    console.log('Socket error');
    console.log(err);
    socket_out.close();
    socket_in.close();
    process.exit(1);
}

socket_out.on('message', (buf, rinfo) => {
    console.log('got a message');
    var header = unpackMainFields(buf);
    //console.log(protocol.MAGIC);
    //console.log(header);
    //console.log(buf);
    if (header != null && header.magic == protocol.MAGIC){
      console.log("valid header"); 
    if (command_ok(header.command)){//sequence_num_ok(header.seq_num) && command_ok(header.command)){
      console.log('valid packet');
      // valid packet
      MSG_HANDLER[header.command](buf, rinfo);
      processQueue();
      rl.prompt();
      rl.resume();
    }
    }
});

socket_in.on('message', (buf, rinfo) => {
    console.log('got a message on socket_in');
    header = unpackMainFields(buf);
    if (header != null && header.magic == protocol.MAGIC) {
      console.log("valid header");
      if (header.command == protocol.PROBE) {
        MSG_HANDLER[header.command](buf, rinfo);
        // processQueue(); // ? yes  or no ?
      }
    }
});

function command_ok(command){
    if (command == 2 || command == 4 || command == 6 || command == 7){
        return true;
    }
    return false;
}

// This may need to be changed to match spec behavior for invalid sequence
function sequence_ok(seq_num){
    return seq_num > protocol.sequence_number;
}

function getThisHostIP() {
    var interfaces = os.networkInterfaces();
    var addresses = [];
    for (var i in interfaces) {
        for (var j in interfaces[i]) {
            var address = interfaces[i][j];
            if (address.family === 'IPv4' && !address.internal) {
                addresses.push(address.address);
            }
        }
    }
    return addresses[0];
}

function bind_sockets() {
    var rand_port = (Math.random() * 3000) + 2000;
    socket_out.bind(rand_port);
    socket_in.bind(rand_port + 1);
}
