/**
 * Audio Playback Service - Maneja la reproducción de audio en cola
 */

export class AudioPlaybackService {
    constructor() {
        this.audioContext = null;
        this.audioQueue = [];
        this.isPlayingQueue = false;
        this.initializeAudioContext();
    }

    initializeAudioContext() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    async playAudioChunk(blobOrArrayBuffer) {
        try {
            console.log('[AudioPlaybackService] Received audio chunk, type:', blobOrArrayBuffer instanceof Blob ? 'Blob' : 'ArrayBuffer', 'size:', blobOrArrayBuffer.size || blobOrArrayBuffer.byteLength);

            let blob;
            if (blobOrArrayBuffer instanceof Blob) {
                blob = blobOrArrayBuffer;
            } else {
                blob = new Blob([blobOrArrayBuffer], { type: 'audio/webm;codecs=opus' });
            }

            this.audioQueue.push(blob);

            if (!this.isPlayingQueue) {
                this.playNextInQueue();
            }
        } catch (e) {
            console.error('[AudioPlaybackService] Error queueing audio chunk:', e);
        }
    }

    async playNextInQueue() {
        if (this.audioQueue.length === 0) {
            this.isPlayingQueue = false;
            return;
        }

        this.isPlayingQueue = true;
        const blob = this.audioQueue.shift();

        try {
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);

            if (this.audioContext && this.audioContext.state === 'suspended') {
                console.log('[AudioPlaybackService] Resuming suspended AudioContext');
                await this.audioContext.resume();
            }

            audio.onended = () => {
                console.log('[AudioPlaybackService] Chunk playback ended, queue length:', this.audioQueue.length);
                URL.revokeObjectURL(url);
                this.playNextInQueue();
            };

            audio.onerror = (e) => {
                console.error('[AudioPlaybackService] Audio playback error:', e, audio.error);
                URL.revokeObjectURL(url);
                this.playNextInQueue();
            };

            await audio.play();
            console.log('[AudioPlaybackService] Playing audio chunk from queue');
        } catch (err) {
            console.error('[AudioPlaybackService] Error playing audio from queue:', err);
            this.playNextInQueue();
        }
    }

    clearQueue() {
        this.audioQueue = [];
        this.isPlayingQueue = false;
    }

    getQueueLength() {
        return this.audioQueue.length;
    }
}