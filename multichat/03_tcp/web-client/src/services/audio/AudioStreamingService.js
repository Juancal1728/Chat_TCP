/**
 * Audio Streaming Service - Maneja el streaming PCM de audio
 */

export class AudioStreamingService {
    constructor(signalingService) {
        this.signalingService = signalingService;
        this.localStream = null;
        this.pcmProcessor = null;
        this.pcmAudioContext = null;
        this.mediaRecorder = null;
    }

    async startStreamingPCM(target) {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

            if (this.signalingService.ws && this.signalingService.ws.readyState === WebSocket.OPEN) {
                this.signalingService.ws.send(`START_STREAM|${target}|format=pcm`);
            }

            this.pcmAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.pcmAudioContext.createMediaStreamSource(this.localStream);
            const bufferSize = 4096;
            this.pcmProcessor = this.pcmAudioContext.createScriptProcessor(bufferSize, 1, 1);
            source.connect(this.pcmProcessor);

            this.pcmProcessor.onaudioprocess = (e) => {
                const left = e.inputBuffer.getChannelData(0);
                const pcmBuffer = this.convertFloat32ToInt16(left);
                if (this.signalingService.ws && this.signalingService.ws.readyState === WebSocket.OPEN) {
                    this.signalingService.ws.send(pcmBuffer.buffer);
                }
            };

            console.log('[AudioStreamingService] PCM streaming started to', target);
            return { format: 'pcm' };
        } catch (err) {
            console.error('[AudioStreamingService] Error starting PCM streaming:', err);
            throw err;
        }
    }

    async startStreaming(target) {
        console.log('[AudioStreamingService] Starting PCM streaming (WebM chunks are not playable individually)');
        return await this.startStreamingPCM(target);
    }

    stopStreaming() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.pcmProcessor) {
            try {
                this.pcmProcessor.disconnect();
            } catch (e) { }
            this.pcmProcessor = null;
        }

        if (this.pcmAudioContext) {
            try {
                this.pcmAudioContext.close();
            } catch (e) { }
            this.pcmAudioContext = null;
        }

        if (this.signalingService.ws && this.signalingService.ws.readyState === WebSocket.OPEN) {
            this.signalingService.ws.send('STOP_STREAM');
        }
    }

    convertFloat32ToInt16(float32Array) {
        const l = float32Array.length;
        const buffer = new ArrayBuffer(l * 2);
        const view = new DataView(buffer);
        let offset = 0;
        for (let i = 0; i < l; i++, offset += 2) {
            let s = Math.max(-1, Math.min(1, float32Array[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
        return new Int16Array(buffer);
    }
}