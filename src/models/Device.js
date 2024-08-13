class Device {
  qrcode;
  device_status;

  constructor(Socket) {
    this.Socket = Socket;
    this.qrcode;
    this.device_status;

    this.Socket.on('qrcode', qrcode => {
      this.qrcode = qrcode;
    });

    this.Socket.on('device_status', device_status => {
      this.device_status = device_status;
    });
  }

  getCurrentQRCode() {
    return new Promise((resolve, reject) => {
      try {
        this.Socket.emit('whatsapp:qrcode', qrcode => {
          this.qrcode = qrcode;
          resolve(qrcode);
        });
      } catch (error) {
        console.error('Error to get current qrcode', error);
        reject(error);
      }
    });
  }

  getCurrentDeviceStatus() {
    return new Promise((resolve, reject) => {
      try {
        this.Socket.emit('whatsapp:device_status', device_status => {
          this.device_status = device_status;
          resolve(device_status);
        });
      } catch (error) {
        console.error('Error to get current device status', error);
        reject(error);
      }
    });
  }
}

export default Device;
