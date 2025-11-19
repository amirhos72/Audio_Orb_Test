
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

  private async toggleRecording(e: Event) {
    e.preventDefault();
    if (this.isProcessing) return;

    if (this.isRecording) {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  private async startRecording() {
    if (this.isRecording || this.isProcessing) return;

    this.inputAudioContext.resume();
    this.audioChunks = [];
    this.recordingLength = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

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
      this.isRecording = false;
      this.cleanupAudio();
    }
  }

  private async stopRecording() {
    if (!this.isRecording) return;

    this.isRecording = false;
    this.isProcessing = true;

    this.cleanupAudio();

    // Process Audio
    try {
      const mergedAudio = mergeBuffers(this.audioChunks, this.recordingLength);
      
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
            @click=${this.toggleRecording}
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
                  <!-- Stop/Send Icon (Square) -->
                   <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px">
                    <path d="M320-320h320v-320H320v320ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z"/>
                  </svg>` 
                : html`
                  <!-- Mic Icon (Idle) -->
                  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px">
                    <path d="M480-480q-33 0-56.5-23.5T400-560v-240q0-33 23.5-56.5T480-880q33 0 56.5 23.5T560-800v240q0 33-23.5 56.5T480-480Zm0 294q-79 0-149-30t-122.5-82.5Q156-351 126-421T96-566q0-11 2.5-20.5t6.5-18.5l54 54Q155-531 155-511q0 136 95 231.5T480-184q70 0 131-28.5t109-81.5l42 42q-58 65-135.5 102.5T480-186Zm313-326L66-886l42-42 727 727-42 42Z" style="display:none"/> <!-- Hidden logic -->
                    <path d="M480-480q-33 0-56.5-23.5T400-560v-240q0-33 23.5-56.5T480-880q33 0 56.5 23.5T560-800v240q0 33-23.5 56.5T480-480Zm0 294q-79 0-149-30t-122.5-82.5Q156-351 126-421T96-566q0-11 2.5-20.5t6.5-18.5l54 54Q155-531 155-511q0 136 95 231.5T480-184q70 0 131-28.5t109-81.5l42 42q-58 65-135.5 102.5T480-186Zm313-326L66-886l42-42 727 727-42 42Z" style="display:none"/>
                    <path d="M480-480q-33 0-56.5-23.5T400-560v-240q0-33 23.5-56.5T480-880q33 0 56.5 23.5T560-800v240q0 33-23.5 56.5T480-480Zm0 400q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480h80q0 133 93.5 226.5T480-160q133 0 226.5-93.5T800-480h80q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z"/>
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
