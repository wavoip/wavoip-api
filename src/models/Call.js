import { checkResponseResult } from '../utils/functions.js';

class Call {
  constructor(Socket) {
    this.Socket = Socket;
  }

  callStart({ whatsappid }) {
    return new Promise((resolve, reject) => {
      try {
        this.Socket.emit('calls:start', whatsappid, response => {
          try {
            if (checkResponseResult(response)) {
              resolve(response);
            } else {
              resolve(response);
            }
          } catch (error) {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  endCall() {
    return new Promise((resolve, reject) => {
      this.Socket.emit('calls:end', {}, response => {
        if (checkResponseResult(response)) {
          resolve(response);
        } else {
          reject(response);
        }
      });
    });
  }

  acceptCall() {
    return new Promise((resolve, reject) => {
      this.Socket.emit('calls:accept', {}, response => {
        if (checkResponseResult(response)) {
          resolve(response);
        } else {
          reject(response);
        }
      });
    });
  }

  rejectCall() {
    return new Promise((resolve, reject) => {
      this.Socket.emit('calls:reject', {}, response => {
        if (checkResponseResult(response)) {
          resolve(response);
        } else {
          reject(response);
        }
      });
    });
  }

  mute() {
    return new Promise((resolve, reject) => {
      this.Socket.emit('calls:mute', {}, response => {
        if (checkResponseResult(response)) {
          resolve(response);
        } else {
          reject(response);
        }
      });
    });
  }

  unMute() {
    return new Promise((resolve, reject) => {
      this.Socket.emit('calls:unmute', {}, response => {
        if (checkResponseResult(response)) {
          resolve(response);
        } else {
          reject(response);
        }
      });
    });
  }
}

export default Call;
