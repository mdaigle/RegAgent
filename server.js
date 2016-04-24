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

// Message Handlers //
function register_callback(msg, rinfo):
  data = protocol.unpackRegistered(msg);


function fetch_callback(msg, rinfo):
  data = protocol.unpackFetch(msg);

function probe_callback(msg, rinfo):
  send_ack();

function ack_callback(msg, rinfo):

// Command Handlers //
function send_register():
  msg = protocol.packRegister(service_addr, service_data, service_name);
  send(msg, function(){
  });

function send_fetch():
  msg = protocol.packFetch(service_name);
  send(msg, function(){
  });

function send_unregister():
  msg = protocol.packUnregister(service_addr);
  send(msg, function(){
  });

function send_probe():
  msg = packProbe(); // NEED TO MAKE THIS FUNCTION
  send(msg, function(){
  });

function send_ack():
  msg = packAck();
  send(msg, function(){

  });

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
