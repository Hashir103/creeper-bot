const EventEmitter = require('events');

class AudioQueue extends EventEmitter{

    constructor() {
        super();
        this.queue = [];
        this.names = [];
    }

    add(url, name) {
        this.queue.push(url);
        this.names.push(name);
        this.emit('queueUpdated');
    }

    remove(index) {
        if (index >= 0 && index < this.queue.length) {
            this.queue.splice(index, 1);
            this.names.splice(index, 1);
            this.emit('queueUpdated');
        }
    }

    fullClear() {
        this.queue = [];
        this.names = [];
        this.emit('queueUpdated');
    }

    clear() {
        // remove all elements from the queue except the first one
        this.queue = this.queue.slice(0, 1);
        this.names = this.names.slice(0, 1);
        this.emit('queueUpdated');
    }

    getQueue() {
        return this.names;
    }

    getNext() {
        this.emit('queueUpdated');
        this.names.shift();
        this.queue.shift();
        return this.queue[0];
    }

    isEmpty() {
        return this.queue.length === 0;
    }

    emitQueueStatusUpdate() {
        this.emit('queueUpdated')
    }
}

module.exports = new AudioQueue();
