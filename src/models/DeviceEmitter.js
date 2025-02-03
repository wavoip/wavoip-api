class EventEmitter {
    constructor() {
      this.events = {};
    }
  
    // Adiciona um listener para o evento
    on(event, listener) {
      if (!this.events[event]) {
        this.events[event] = [];
      }
      this.events[event].push(listener);
    }
  
    // Emite o evento, chamando todos os listeners
    emit(event, ...args) {
      if (this.events[event]) {
        this.events[event].forEach((listener) => listener(...args));
      }
    }
  
    // Remove um listener específico
    off(event, listenerToRemove) {
      if (this.events[event]) {
        this.events[event] = this.events[event].filter(
          (listener) => listener !== listenerToRemove
        );
      }
    }
}

export default EventEmitter;