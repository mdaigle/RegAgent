// TODO:
// - standardize indentations to 2 or 4 spaces
// - BUG: If you register a service with the same name, port etc twice there is
// no output and the user must press Enter again at which point "Unrecognized
// Command" is displayed and the user is prompted for a new command
// - Remove all auxilary output

const assert = require('assert');
const dgram = require('dgram');
const dns = require('dns');
const os = require('os');
const protocol = require('./protocol');
const readline = require('readline');

// Standard timeout for a response to a request.
const msg_timeout = 5000;

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
var last_msg_timeout = null;
var seq_num = 0;
var last_msg_sent = -1;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});
var shouldPrompt = true;
rl.setPrompt('Enter r(egister), u(nregister), f(etch), p(robe), or q(uit): ');
rl.pause();

messageQueue = [];
function processQueue(messageAction){
    //console.log("in processQueue");
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

function protocolError(location){
    console.log("Protocol Error");
    console.log("Thrown by", location);
    clearTimeout(last_msg_timeout); // added
    socket_out.close();
    socket_in.close();
    process.exit(1);
}

function msgTimeout(errMsg){
  console.log(errMsg);
  last_msg_timeout = null; // shouldnt this be = 0? or = null?, changed from {}
  if (last_register_msg) {
      port = last_register_msg['service_port'];
      if (port in port_map &&
          'timeout' in port_map[port] &&
          port_map[port].timeout != null){
          //console.log("clearing timeout");
          console.log("clearing timeout for", port);
        clearTimeout(port_map[port].timeout);
      }
      //last_register_msg = null;
  }
  last_msg_sent = -1;
  processQueue();
  rl.prompt();
  rl.resume();
}

// Message Handlers //
function process_registered(msg, rinfo){
    if (last_msg_sent != protocol.REGISTER || !last_register_msg){
        // console.log(last_msg_sent);
        // console.log(last_register_msg);
        protocolError("process_registered");
    }

    //console.log("clearing response timeout");
    clearTimeout(last_msg_timeout); // changed from last_msg_sent

    data = protocol.unpackRegistered(msg);
    if (data == null) { protocolError("null data in process_registered");}

    port = last_register_msg.service_port;

    if (!(port in port_map) ||
        port_map[port]['service_data'] != last_register_msg['service_data'] ||
        port_map[port]['service_name'] != last_register_msg['service_name']) {
        console.log("Register successful.");
        rl.prompt();
    }
    else if ('timeout' in port_map[port] && port_map[port].timeout != null){
        //console.log("clearing timeout");
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

    var reregister_time = (.5) * data.lifetime;
    port_map[port]['timeout'] = setTimeout(function(){
      // add_to_queue((port, service_data, service_name) => send_register)
      // processQueue([callback]) {
      //  push(callback);
      //  first = pop()
      //  first();
      //}
      //called in re-register timeout, on user input and on-message-response
        processQueue(function(){
            send_register(port, service_data, service_name)
        });
    }, reregister_time);
    last_register_msg = {};
}

function process_fetchresponse(msg, rinfo){
    if (last_msg_sent != protocol.FETCH) {
      protocolError("process_fetchresponse");
    }
    clearTimeout(last_msg_timeout);
    data = protocol.unpackFetchResponse(msg);
    if (data == null) {protocolError("null data in process_fetchresponse");}
    console.log(data.entries);
    rl.prompt();
  // do stuff
}

function process_probe(msg, rinfo){
    send_ack(socket_in);
}

function process_ack(msg, rinfo){
    if (last_msg_sent == protocol.PROBE){
        clearTimeout(last_msg_timeout);
        last_msg_sent = -1;
        console.log("Probe successful.");
    }else if(last_msg_sent == protocol.UNREGISTER){
        clearTimeout(last_msg_timeout);
        last_msg_sent = -1;
        console.log("Unregister sucessful.");
    }else{
        protocolError("process_ack");
    }
    rl.prompt();
}

function send(msg, socket, callback){
    //console.log(msg);
    socket.send(msg, 0, msg.length, reg_service_port, reg_service_address, callback);
}

// Command Handlers //
var num_registers_sent = 0;
function send_register(port, service_data, service_name){
    // If this is a re-registration, don't print anything out
    if (!(port in port_map)) {
        console.log("sending register");
    }
    last_register_msg = {"service_port": port, "service_name": service_name, "service_data": service_data, "timeout": null};
    msg = protocol.packRegister(get_sequence_num(), local_address, port, service_data, service_name);
    send(msg, socket_out, function(err){
      //console.log("sent message");
      //console.log(err);
      last_msg_sent = protocol.REGISTER;
    });
    // console.log(++num_registers_sent);
    // console.log("Seq_num is", seq_num);
    errMsg = "Register unsuccessful";
    clearTimeout(last_msg_timeout); // do we need to clear this here?
    // Technically we should never enter this function when last_msg_timeout !=
    // null or 0
    last_msg_timeout = setTimeout(function(){msgTimeout(errMsg);}, msg_timeout);
}

function send_fetch(service_name){
    msg = protocol.packFetch(get_sequence_num(), service_name);
    send(msg, socket_out, function() {
      last_msg_sent = protocol.FETCH;
    });
    errMsg = "Fetch unsuccessful.";
    clearTimeout(last_msg_timeout);
    last_msg_timeout = setTimeout((errMsg) => msgTimeout, msg_timeout);
}

function send_unregister(port){
    if (port in port_map) {
        clearTimeout(port_map[port]['timeout']);
    }
    delete port_map[port];

    msg = protocol.packUnregister(get_sequence_num(), local_address, port);
    send(msg, socket_out, function(){
      last_msg_sent = protocol.UNREGISTER;
    });
    errMsg = "Unregister unsuccessful.";
    clearTimeout(last_msg_timeout);
    last_msg_timeout = setTimeout((errMsg) => msgTimeout, msg_timeout);
}

function send_probe(){
    console.log("sending probe");
    msg = protocol.packProbe(get_sequence_num());
    send(msg, socket_out, function(){
      last_msg_sent = protocol.PROBE;
    });
    errMsg = "Probe unsuccessful.";
    clearTimeout(last_msg_timeout);
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
            rl.prompt();
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
MSG_HANDLER = {"2": process_registered, "4": process_fetchresponse, "6": process_probe, "7": process_ack};

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

// Should be called if either socket ever experiences an error. Prints an error
// message, closes the sockets, and exits the program.
function sock_err(err) {
    console.log('Socket error');
    console.log(err);
    socket_out.close();
    socket_in.close();
    process.exit(1);
}

socket_out.on('message', (buf, rinfo) => {
    // Check if this message was solicited
    if (last_msg_sent == -1) {
        //processQueue();
        return;
    }

    var header = unpackMainFields(buf);
    if (header != null && header.magic == protocol.MAGIC){
      //console.log("valid header");
    if (command_ok(header.command) && sequence_num_ok(header.seq_num)){
      //console.log('valid packet');
      // valid packet
      MSG_HANDLER[header.command](buf, rinfo);
      processQueue();
      rl.resume();
    }
    }
});

socket_in.on('message', (buf, rinfo) => {
    console.log('got a message on socket_in');
    header = unpackMainFields(buf);
    if (header != null && header.magic == protocol.MAGIC) {
      //console.log("valid header");
      if (header.command == protocol.PROBE) {
        MSG_HANDLER[header.command](buf, rinfo);
        // processQueue(); // ? yes  or no ?
      }
    }
});

// Checks that the given command is one an agent would expect to receive
// (not one a registration service would expect).
function command_ok(command){
    if (command == 2 || command == 4 || command == 6 || command == 7){
        return true;
    }
    return false;
}

// This may need to be changed to match spec behavior for invalid sequence
// Checks that the given sequence number matches the expected sequence number.
function sequence_num_ok(received_seq_num){
    if (received_seq_num == 255 && seq_num == 0) {
        return true;
    }
    return received_seq_num == (seq_num - 1);
}

function get_sequence_num() {
    var result = seq_num;
    seq_num++;
    // Wrap if we exceed 255
    if (seq_num > 255) {
        seq_num = 0;
    }
    return result;
}

// Returns the IPv4 address of this machine.
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

// Binds socket_out and socket_in to sequential ports.
function bind_sockets() {
    var rand_port = (Math.random() * 3000) + 2000;
    socket_out.bind(rand_port);
    socket_in.bind(rand_port + 1);
}
