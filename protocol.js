// Protocol constants
const MAGIC = 0xC461;
const REGISTER = 1;
const REGISTERED = 2;
const FETCH = 3;
const FETCHRESPONSE = 4;
const UNREGISTER = 5;
const PROBE = 6;
const ACK = 7;

sequence_number = 0; // move later

function packMainFields(buffer, seq_num, command) {
    buffer.writeUInt16BE(MAGIC, 0);
    buffer.writeUInt8(seq_num, 2);
    buffer.writeUInt8(command, 3);
    return buffer;
}

// Unpacks the critical fields from a message (magic number, sequence number,
// and command). Use this for all message to verify them. Use exclusively this
// for unpacking PROBE and ACK messages.
function unpackMainFields(message_buffer) {
    if (message_buffer.length < 4) { return null; }

    return {
        magic: message_buffer.readUInt16(0),
        seq_num: message_buffer.readUInt8(2),
        command: message_buffer.readUInt8(3),
    }
}

// Packs a new message with the requisite fields for a REGISTER.
// service_addr: string, ip address of remote service
function packRegister(service_addr, service_data, service_name) {
    msg = Buffer(15 + name_len);
    packMainFields(msg, seq_num, REGISTER);

    name_len = service_name.length;
    //TODO: fix address writing
    msg.writeUInt32BE(service_addr.address, 4);
    msg.writeUInt16BE(service_addr.port, 8);
    msg.writeUInt32BE(service_data, 10);
    msg.writeUInt8(name_len, 14);
    for (i = 0; i < name_len; i++){
        msg.writeUInt8(service_name.charAt(i), 15 + i);
    }
    return msg;
}

// Unpacks field from a REGISTERED message. Assumes that message_buffer has already been checked for validity.
function unpackRegistered(message_buffer) {
    //Verify that message is of the expected length.
    if (message_buffer.length != 6) { return null; }

    return {
        magic: buffer.readUInt16(0),
        seq_num: buffer.readUInt8(2),
        command: buffer.readUInt8(3),
        lifetime: buffer.readUInt16(4),
    }
}

function packUnregister(service_addr) {
    var buffer = new Buffer(10);
    packMainFields(buffer, seq_num, UNREGISTER);

    buffer.writeUInt32BE(service_addr.address, 4);
    buffer.writeUInt16BE(service_addr.port, 8);
    return buffer;
}


function packFetch(service_name){
    name_len = len(service_name);
    msg = Buffer(5 + name_len);
    packMainFields(buffer, seq_num, FETCH);

    // really should check that name_len < 255
    msg.writeUInt8(name_len);
    msg.write(service_name, 5, name_len);
    return msg;
}

function unpackFetch(msg) {
    if (msg.length < 5 || (msg.length - 5)%10 != 0) {
        return null;
    }
    msg = {
        magic: msg.readUInt16BE(0),
        seq_num: msg.readUInt8(2),
        command: msg.readUInt8(3),
        num_entries: msg.readUInt8(4),
        entries: []
    };
    for (i = 0; i < num_entries; i++) {
        entry_offset = 5 + 10*i;
        entry = {
            service_addr: {
                address: msg.readUInt32BE(entry_offset),
                port: msg.readUInt16BE(entry_offset + 4),
            }
            service_data: readUInt32BE(entry_offset + 6)
        };
        msg.entries.push(entry);
    }
    return msg;
}
