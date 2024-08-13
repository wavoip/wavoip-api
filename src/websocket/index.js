import { io } from 'socket.io-client';

import { baseURL } from '../config';
class Socket {
  constructor(device_token) {
    this.device_token = device_token;
    this.socket = null;
    this.socket_audio_transport;

    this.start();
  }

  start() {
    this.socket = io(baseURL, {
      transports: ['websocket'],
      path: `/${this.device_token}/websocket`,
    });


    this.socket.on('audio_transport:create', ({ room, ip, port }) => {
      console.info('[*] creating audio transport');
      
      this.socket_audio_transport = io(`${ip}:${port}/call-${room}`, {
        transports: ['websocket'],
        path: `/${this.device_token}/websocket`,
        forceNew: true,
      });
    });

    this.socket.on('audio_transport:terminate', ({ room }) => {
      // console.info('[*] terminating audio transport');
    });
  }
}

export default Socket;
