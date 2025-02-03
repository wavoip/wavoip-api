import Socket from './websocket/index.js';
import Call from './models/Call.js';
import Audio from './models/AudioClass.js';
import Device from './models/Device.js';
import Microphone from './models/Microphone.js';
import DeviceEmitter from "./models/DeviceEmitter.js";

class Wavoip {
  connect = deviceToken => {
    const SocketInstance = new Socket(deviceToken);
    const deviceEmitter = new DeviceEmitter();

    const AudioInstance = new Audio(SocketInstance, deviceEmitter);
    const CallModel = new Call(SocketInstance.socket);
    const DeviceModel = new Device(SocketInstance.socket, deviceToken);

    Microphone.init(SocketInstance, 16000, deviceEmitter);
    
    SocketInstance.socket.on('connect', () => {});

    SocketInstance.socket.on('disconnect', reason => {});

    SocketInstance.socket.on('signaling', data => {});

    SocketInstance.socket.on(
      'audio_transport:create',
      ({ room, sampleRate }) => {
        AudioInstance.start(16000, room);

        Microphone.init(SocketInstance, 16000, deviceEmitter);
        Microphone.start();
      }
    );

    SocketInstance.socket.on('audio_transport:terminate', ({ room }) => {
      AudioInstance.stop();
      Microphone.stop();
    });

    const wavoip_api = {
      socket: SocketInstance.socket,
      getCurrentDeviceStatus: function() {
        return DeviceModel.getCurrentDeviceStatus();
      },
      getCurrentQRCode: function() {
        return DeviceModel.getCurrentQRCode();
      },
      getAllInfo: function() {
        return DeviceModel.getAllInfo();
      },
      callStart: function(params) {
        AudioInstance.checkError();
        return CallModel.callStart(params);
      },
      endCall: () => {
        return CallModel.endCall();
      },
      acceptCall: () => {
        return CallModel.acceptCall();
      },
      rejectCall: () => {
        return CallModel.rejectCall();
      },
      mute: () => {
        return CallModel.mute();
      },
      unMute: () => {
        return CallModel.unMute();
      },
      Microphone: Microphone,
      Audio: AudioInstance,
      deviceEmitter: deviceEmitter
    };

    if(!window.wavoip_api) {
      window.wavoip_api = {};
    }

    window.wavoip_api[deviceToken] = wavoip_api;

    return wavoip_api;
  };
}

export default Wavoip;
