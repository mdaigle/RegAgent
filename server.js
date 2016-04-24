const protocol = require('./protocol');
// Client States
// const BEGIN = -1
// const REGISTER_WAIT = 0
// const IDLE = 1
// const FETCH_WAIT = 2
// const ACK_WAIT = 3

const args = process.argv.slice(1);
assert(args.length == 1);

var service_port = args[0];

const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});
rl.pause();

const dgram = require('dgram');
const socket_out = dgram.createSocket('udp4');
const socket_in = dgram.createSocket('udp4');

socket_out.on('error', (err) => {
    console.log('Socket error');
    socket_out.close();
    socket_in.close();
    process.exit(1);
});

socket_in.on('error', (err) => {
    console.log('Socket error');
    socket_out.close();
    socket_in.close();
    process.exit(1);
});

var num_listening = 0;

socket_out.on('listening', () => {
    num_listening++;
    if (num_listening == 2) {
        rl.resume();
    }
});

socket_in.on('listening', () => {
    num_listening++;
    if (num_listening == 2) {
        rl.resume();
    }
});

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

msg_timeout = 1
last_msg_sent = -1;

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
function send_register(){
  msg = protocol.packRegister(service_addr, service_data, service_name);
  send(msg, socket_out, function(){
    last_msg_sent = protocol.REGISTER;
  });
}

function send_fetch(){
  msg = protocol.packFetch(service_name);
  send(msg, socket_out, function(){
    last_msg_sent = protocol.FETCH;
  });
}

function send_unregister(){
  msg = protocol.packUnregister(service_addr);
  send(msg, socket_out, function(){
    last_msg_sent = protocol.UNREGISTER;
  });
}

function send_probe(){
  msg = packProbe(); // NEED TO MAKE THIS FUNCTION
  send(msg, socket_out, function(){
    last_msg_sent = protocol.PROBE;
  });
}

function send_ack(socket){
  msg = packAck();
  send(msg, function(){

  });
}

rl.on('line', (line) => {
    var arguments = line.split(" ");
    switch (arguments[0]) {
        case "r":
            var portnum = parseInt(arguments[1]);
            var data = arguments[2];
            var service_name = arguments[3];
            send_register(/*ip, port, data, name*/);
            break;
        case "u":
            var portnum = parseInt(arguments[1]);
            send_unregister();
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
            console.log("Unrecognized command.");
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
MSG_HANDLER = {"2": register_callback, "4": fetch_callback, "6", probe_callback, "7": ack_callback};

// function arguments:
//    socket
//
CMD_HANDLER = {"1": send_register, "3": send_fetch, "5": send_unregister, "6": send_probe, "7": send_ack};

const dgram = require('dgram');
const socket = dgram.createSocket('udp4');

function check_received_command(command){
  if (command == 2 || command == 4 || command == 6 || command == 7){
    return true;
  }
  return false;
}

// This may need to be changed to match spec behavior for invalid sequence
function check_sequence(seq_num){
  return seq_num > protocol.sequence_number;
}

socket.on('message', (msg, rinfo) => {
  header = unpackMessage(msg);
  if (header != null && header.magic == protocol.MAGIC){
    if (check_sequence(header.seq_num) && check_received_command(header.command)){
      // valid packet
      MSG_HANDLER[command](msg, rinfo);
    }
  }

});


// IO and IO EVENT BINDINGS
// -------------------------------------------------------------------------- //

var rand_port = random(2000, 5000);
socket_out.bind(rand_port);
socket_in.bind(rand_port + 1);
