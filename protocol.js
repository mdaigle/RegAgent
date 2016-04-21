const MAGIC = 0xC461;
sequence_number = 0; // move later

function unpackMessage(message_buffer) {
	if (message_buffer.length < 4) { return null; }

	return {
		magic: message_buffer.readUInt16(0),
		seq_num: message_buffer.readUInt8(2),
		command: message_buffer.readUInt8(3),
	}
}

// Packs a new message with the requisite fields for a REGISTER.
// service_addr: string, ip address of remote service
// service_data: 
function packRegister(service_addr, service_data, service_name) {
	name_len = service_name.length;
	msg = Buffer(15 + name_len);
	msg.writeUInt16BE(MAGIC, 0);
	msg.writeUInt8(sequence_number, 2);
	msg.writeUInt8(1, 3);
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