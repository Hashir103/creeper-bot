class AudioQueue {
    constructor() {
        this.queue = [];
        this.names = [];
    }

    add(url, name) {
        this.queue.push(url);
        this.names.push(name);
    }

    remove(index) {
        if (index >= 0 && index < this.queue.length) {
            this.queue.splice(index, 1);
            this.names.splice(index, 1);
        }
    }

    clear() {
        // remove all elements from the queue except the first one
        this.queue = this.queue.slice(0, 1);
        this.names = this.names.slice(0, 1);
    }

    getQueue() {
        return this.names;
    }

    getNext() {
        this.names.shift();
        this.queue.shift();
        return this.queue[0];
    }

    isEmpty() {
        return this.queue.length === 0;
    }
}

module.exports = new AudioQueue();
