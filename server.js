const protocol = require('./protocol');
// Client States
const BEGIN = -1
const REGISTER_WAIT = 0
const IDLE = 1
const FETCH_WAIT = 2
const ACK_WAIT = 3

// State Questions:
// Can a client send a PROBE or FETCH before being registered?
// In the sequence PROBE (timeout) UNREGISTER, how do you differentiate the ACK
// responses?
//

// Commands
const REGISTER = 1;
const REGISTERED = 2;
const FETCH = 3;
const FETCH_RESPONSE = 4;
const UNREGISTER = 5;
const PROBE = 6;
const ACK = 7;

// Message Handlers //
function register_callback(msg, rinfo):
  data = protocol.unpackRegistered(msg);
  // transition to IDLE


function fetch_callback(msg, rinfo):
  data = protocol.unpackFetch(msg);
  // transition to IDLE

function probe_callback(msg, rinfo):
  send_ack();

function ack_callback(msg, rinfo):
  // transition to IDLE

// Command Handlers //
function send_register():
  msg = protocol.packRegister(service_addr, service_data, service_name);
  send(msg, function(){
    // transition to REGISTER_WAIT
  });

function send_fetch():
  msg = protocol.packFetch(service_name);
  send(msg, function(){
    // transition to FETCH_WAIT
  });

function send_unregister():
  msg = protocol.packUnregister(service_addr);
  send(msg, function(){
    // transition to ACK_WAIT
  });

function send_probe():
  msg = packProbe(); // NEED TO MAKE THIS FUNCTION
  send(msg, function(){
    // transition to ACK_WAIT
  });

function send_ack():
  msg = packAck();
  send(msg, function(){
  
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

// need to bind socket etc.
