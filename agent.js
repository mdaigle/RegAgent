const assert = require('assert');
const dgram = require('dgram');
const dns = require('dns');
const os = require('os');
const protocol = require('./protocol');
const readline = require('readline');

// Standard timeout for a response to a request.
const msg_timeout = 1;

const args = process.argv.slice(2);
assert(args.length == 2);

const socket_out = dgram.createSocket('udp4');
const socket_in = dgram.createSocket('udp4');

const service_hostname = args[0];
const service_port = args[1];

const local_address = getThisHostIP();

var service_address;
dns.lookup(service_hostname, (err, address, family) => {
    if (err) {
        console.log("error resolving service hostname");
        process.exit(0);
    }

    addr = address;

    console.log('regServerIP:', address);
    console.log('thisHostIP:', local_address);

    bind_sockets();
});

// Holds mappings from port number to an object holding {service name, service
// data, and a timer id}. The timer id specifies a timer object used for
// reregistering the service.
var port_map = new Map();
var seq_num = 0;
var last_msg_sent = -1;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});
rl.setPrompt('Enter r(egister), u(nregister), f(etch), p(robe), or q(uit): ');
rl.pause();

// service_port and service_addr are globals
function send(msg, socket, callback){
  socket.send(msg, service_port, service_addr, callback);
}

function protocolError(){
  console.log("Protocol Error");
  socket_out.close();
  socket_in.close();
  process.exit(1);
}

// Message Handlers //
function register_callback(msg, rinfo){
  if (last_msg_sent != protocol.REGISTER){
    protocolError();
  }
  data = protocol.unpackRegistered(msg);
  setTimeout(send_register, data.timeout-msg_timeout);
  console.log("Register successful.");
}

function fetch_callback(msg, rinfo){
  if (last_msg_sent != protocol.FETCH) {
    protocolError();
  }
  data = protocol.unpackFetch(msg);
  // do stuff
}

function probe_callback(msg, rinfo){
  send_ack(socket_in);
}

function ack_callback(msg, rinfo){
  if (last_msg_sent == protocol.PROBE){
    last_msg_sent = -1;
    console.log("Probe successful.");
  }else if(last_msg_sent == protocol.UNREGISTER){
    last_msg_sent = -1;
    console.log("Unregister sucessful.");
  }else{
    protocolError();
  }
}

// Command Handlers //
function send_register(port, service_data, service_name){
  msg = protocol.packRegister(seq_num++, ip, port, service_data, service_name);
  send(msg, socket_out, function(){
    last_msg_sent = protocol.REGISTER;
  });
}

function send_fetch(){
  msg = protocol.packFetch(seq_num++, service_name);
  send(msg, socket_out, function(){
    last_msg_sent = protocol.FETCH;
  });
}

function send_unregister(port){
  msg = protocol.packUnregister(seq_num++, ip, port);
  send(msg, socket_out, function(){
    last_msg_sent = protocol.UNREGISTER;
  });
}

function send_probe(){
  msg = packProbe(seq_num++);
  send(msg, socket_out, function(){
    last_msg_sent = protocol.PROBE;
  });
}

function send_ack(socket){
  msg = packAck();
  send(msg, function(){

  });
}

// IO and IO EVENT BINDINGS
// -------------------------------------------------------------------------- //
rl.on('line', (line) => {
    rl.pause();
    var arguments = line.split(" ");
    switch (arguments[0]) {
        case "r":
            var port = parseInt(arguments[1]);
            var service_data = arguments[2];
            var service_name = arguments[3];
            send_register(port, service_data, service_name);
            break;
        case "u":
            var portnum = parseInt(arguments[1]);
            send_unregister(port);
            break;
        case "f":
            var service_name = arguments[1];
            send_fetch();
            break;
        case "p":
            send_probe();
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
  var header = unpackMainFields(buf);
  if (header != null && header.magic == protocol.MAGIC){
    if (sequence_num_ok(header.seq_num) && command_ok(header.command)){
      // valid packet
      MSG_HANDLER[command](msg, rinfo);
      rl.prompt();
      rl.resume();
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
