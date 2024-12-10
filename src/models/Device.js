import axios from "axios";
class Device {
  qrcode;
  device_status;

  constructor(Socket, token) {
    this.Socket = Socket;
    this.qrcode;
    this.device_status;
    this.all_info;
    this.token = token;

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

  getAllInfo() {
    return new Promise((resolve, reject) => {
      try {
        const url = `https://devices.wavoip.com/${this.token}/whatsapp/all_info`;

        const config = {
          headers: {
            'Authorization': 'Bearer SEU_TOKEN_AQUI', // Adicione o token se necessário
            'Content-Type': 'application/json'
          },
        };

        axios.get(url, config)
          .then(response => {
            resolve(response.data);
          })
          .catch(error => {
            reject(error)
          });

      } catch (error) {
        console.error('Error to get current all infos', error);
        reject(error);
      }
    });
  }
}

export default Device;
