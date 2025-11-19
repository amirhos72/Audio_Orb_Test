/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import OpenAI from 'openai';
import {LitElement, css, html, nothing} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {decode, decodeAudioData, encodeWAV, mergeBuffers} from './utils';
import './visual-3d';

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() isProcessing = false;
  @state() error = '';

  private client: OpenAI;
  
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private scriptProcessorNode: ScriptProcessorNode;
  
  // Audio accumulation for API
  private audioChunks: Float32Array[] = [];
  private recordingLength = 0;
  
  // Track if the user is physically holding the button
  private isHolding = false;

  static styles = css`
    #status {
      position: absolute;
      bottom: 20px;
      left: 0;
      right: 0;
      z-index: 10;
      text-align: center;
      color: #ef4444; /* Red for errors */
      font-family: sans-serif;
      font-size: 12px;
      pointer-events: none;
    }

    .controls {
      z-index: 10;
      position: absolute;
      bottom: 60px;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Button Animations */
    @keyframes pulse-record {
      0% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(225, 29, 72, 0.4);
      }
      70% {
        transform: scale(1.1);
        box-shadow: 0 0 0 12px rgba(225, 29, 72, 0);
      }
      100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(225, 29, 72, 0);
      }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    button {
      outline: none;
      border: none;
      background: #ffffff;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      cursor: pointer;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      
      /* Hold button specific styles */
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    }

    button:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    }

    button:active {
      transform: scale(0.95);
    }

    button.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Recording State */
    button.recording {
      background: #FFF1F2;
      color: #E11D48;
      animation: pulse-record 2s infinite;
    }

    /* Processing State */
    button.processing {
      background: #F3F4F6;
    }
    
    button.processing svg {
      fill: #6B7280;
      animation: spin 1s linear infinite;
    }
    
    button svg {
      width: 20px;
      height: 20px;
      fill: #4B5563;
      transition: all 0.3s ease;
    }

    button.recording svg {
      fill: #E11D48;
      transform: scale(0.9);
    }
  `;

  constructor() {
    super();
    this.initClient();
  }

  private initClient() {
    // Hardcoded as per user request
    const apiKey = 'aa-zwwGzs2I3m9MTuEyK33kpVSm19PYT1Fczhz05IvcTjAT7E9b';
    const baseURL = 'https://api.avalai.ir/v1';

    this.client = new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL,
      dangerouslyAllowBrowser: true // Required for client-side usage
    });

    this.outputNode.connect(this.outputAudioContext.destination);
  }

  private updateError(msg: string) {
    this.error = msg;
  }

  private async startRecording(e?: Event) {
    // Prevent default to ensure touch events don't fire emulated mouse events
    if (e) e.preventDefault();
    
    if (this.isRecording || this.isProcessing) return;

    this.isHolding = true;
    this.inputAudioContext.resume();
    this.audioChunks = [];
    this.recordingLength = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      // Check if user released the button while we were waiting for permission
      // If they did, we abort immediately.
      if (!this.isHolding) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      this.mediaStream = stream;

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 4096;
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);
        
        // Clone the data because inputBuffer is reused
        const chunk = new Float32Array(inputData);
        this.audioChunks.push(chunk);
        this.recordingLength += chunk.length;
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);

      this.isRecording = true;
      this.error = '';
    } catch (err) {
      console.error('Error starting recording:', err);
      this.updateError(`Error: ${err.message}`);
      // Reset state on error
      this.isRecording = false;
      this.isHolding = false;
      this.cleanupAudio();
    }
  }

  private async stopRecording(e?: Event) {
    if (e) e.preventDefault();
    
    this.isHolding = false;

    // If recording hasn't started yet (e.g., still initializing stream), do nothing.
    // The startRecording check for !isHolding will handle the cleanup.
    if (!this.isRecording) return;

    this.isRecording = false;
    this.isProcessing = true;

    this.cleanupAudio();

    // Process Audio
    try {
      const mergedAudio = mergeBuffers(this.audioChunks, this.recordingLength);
      // If recording was extremely short, we might want to ignore it, but for now we proceed.
      
      const wavData = encodeWAV(mergedAudio, 16000);
      const base64Audio = this.arrayBufferToBase64(wavData.buffer);

      await this.sendToAPI(base64Audio);

    } catch (e) {
      console.error("Error processing audio", e);
      this.updateError("Failed to process audio.");
    } finally {
      this.isProcessing = false;
    }
  }

  private cleanupAudio() {
    if (this.scriptProcessorNode && this.sourceNode) {
      this.scriptProcessorNode.disconnect();
      this.sourceNode.disconnect();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
  }

  // Updated signature to accept ArrayBufferLike to fix build error
  private arrayBufferToBase64(buffer: ArrayBuffer | ArrayBufferLike) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private async sendToAPI(base64Audio: string) {
    try {
      const completion = await this.client.chat.completions.create({
        model: "gpt-audio-mini-2025-10-06",
        modalities: ["text", "audio"],
        audio: { voice: "alloy", format: "pcm16" }, // pcm16 matches our decoder
        messages: [
          {
            role: "user",
            content: [
              { 
                type: "input_audio", 
                input_audio: { 
                  data: base64Audio, 
                  format: "wav" 
                } 
              }
            ]
          }
        ]
      });

      const audioResponse = completion.choices[0].message.audio;
      
      if (audioResponse && audioResponse.data) {
        await this.playAudio(audioResponse.data);
      }

    } catch (e) {
      console.error("API Error:", e);
      this.updateError(e.message || "API Error");
    }
  }

  private async playAudio(base64Data: string) {
    const audioBuffer = await decodeAudioData(
      decode(base64Data),
      this.outputAudioContext,
      24000, 
      1, 
    );

    const source = this.outputAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputNode);
    source.start();
  }

  render() {
    return html`
      <div>
        <div class="controls">
          <button
            class="${this.isRecording ? 'recording' : ''} ${this.isProcessing ? 'processing' : ''}"
            @mousedown=${this.startRecording}
            @touchstart=${this.startRecording}
            @mouseup=${this.stopRecording}
            @touchend=${this.stopRecording}
            @mouseleave=${this.stopRecording}
            @contextmenu=${(e: Event) => e.preventDefault()}
            ?disabled=${this.isProcessing}
          >
            ${this.isProcessing
              ? html`
                  <!-- Spinner Icon -->
                  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px">
                    <path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8Z"/>
                  </svg>
                `
              : this.isRecording 
                ? html`
                  <!-- Mic Icon (Active) -->
                  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px">
                    <path d="M480-480ZM320-200v-560l440 280-440 280Z" style="display:none"/> <!-- Hidden Play icon path -->
                    <path d="M320-200v-560l440 280-440 280Z"/>
                  </svg>` 
                : html`
                  <!-- Mic Icon (Idle) -->
                  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px">
                    <path d="M320-200v-560l440 280-440 280Z"/>
                  </svg>`
            }
          </button>
        </div>

        ${this.error ? html`<div id="status">${this.error}</div>` : nothing}
        
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
      </div>
    `;
  }
}
