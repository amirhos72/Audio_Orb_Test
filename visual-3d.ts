/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Analyser} from './analyser';

/**
 * 3D live audio visual (CSS-based Orb).
 */
@customElement('gdm-live-audio-visuals-3d')
export class GdmLiveAudioVisuals3D extends LitElement {
  private inputAnalyser!: Analyser;
  private outputAnalyser!: Analyser;
  private animationId: number = 0;
  private currentVolume = 0;

  private _outputNode!: AudioNode;

  @property({attribute: false})
  set outputNode(node: AudioNode) {
    this._outputNode = node;
    if (this._outputNode) {
      this.outputAnalyser = new Analyser(this._outputNode);
    }
  }

  get outputNode() {
    return this._outputNode;
  }

  private _inputNode!: AudioNode;

  @property({attribute: false})
  set inputNode(node: AudioNode) {
    this._inputNode = node;
    if (this._inputNode) {
      this.inputAnalyser = new Analyser(this._inputNode);
    }
  }

  get inputNode() {
    return this._inputNode;
  }

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      background: #ffffff;
      position: absolute;
      inset: 0;
      overflow: hidden;
    }

    .sphere-container-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        will-change: transform, filter;
        /* transition: transform 0.1s linear; */ /* Removing transition for snappier vibration */
    }
    
    .sphere-container-wrapper * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }

    .sphere-container {
        position: relative;
        width: 400px;
        height: 400px;
        animation: primary-logo-breathe 8s ease-in-out infinite;
    }

    .glass-sphere {
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background: radial-gradient(circle at 30% 30%,
            rgba(255, 255, 255, 0.5) 0%,
            rgba(255, 255, 255, 0.05) 50%,
            transparent 70%);
        box-shadow:
            inset 0 0 60px 10px rgba(255, 255, 255, 0.8),
            0 30px 60px rgba(0, 0, 0, 0.05);
        overflow: hidden;
    }

    .orb {
        position: absolute;
        border-radius: 50%;
        filter: blur(60px);
        opacity: 1;
        mix-blend-mode: hard-light;
        animation-timing-function: ease-in-out;
        animation-iteration-count: infinite;
        will-change: transform;
    }

    .orb-1 {
        width: 380px;
        height: 380px;
        background: radial-gradient(circle,
            rgba(135, 217, 255, 1) 60%,
            rgba(135, 217, 255, 0) 80%);
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        animation: primary-logo-float-1 8s infinite;
        animation-delay: -2s;
    }

    .orb-2 {
        width: 400px;
        height: 400px;
        background: radial-gradient(circle,
            rgba(16, 185, 129, 1) 60%,
            rgba(16, 185, 129, 0) 80%);
        top: 35%;
        left: 35%;
        animation: primary-logo-float-2 10s infinite;
    }

    .orb-3 {
        width: 400px;
        height: 400px;
        background: radial-gradient(circle,
            rgba(255, 201, 146, 1) 60%,
            rgba(255, 201, 146, 0) 80%);
        top: 55%;
        left: 55%;
        animation: primary-logo-float-3 7s infinite;
        animation-delay: -4s;
    }

    .ring {
        position: absolute;
        width: 85%;
        height: 85%;
        top: 7.5%;
        left: 7.5%;
        border: 2px solid rgba(255, 255, 255, 0.9);
        border-radius: 50%;
        filter: blur(1px);
        animation: primary-logo-float-ring 6s ease-in-out infinite;
        box-shadow: 0 0 15px 3px rgba(255, 255, 255, 0.7);
    }

    @keyframes primary-logo-float-1 {
        0%, 100% { transform: translate(-50%, -50%); }
        50% { transform: translate(-40%, -60%); }
    }

    @keyframes primary-logo-float-2 {
        0%, 100% { transform: translate(0, 0); }
        50% { transform: translate(30%, 20%); }
    }

    @keyframes primary-logo-float-3 {
        0%, 100% { transform: translate(0, 0); }
        50% { transform: translate(-20%, -30%); }
    }

    @keyframes primary-logo-breathe {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
    }

    .glass-sphere::before {
        content: '';
        position: absolute;
        top: 10%;
        left: 15%;
        width: 40%;
        height: 40%;
        background: radial-gradient(circle, rgba(255, 255, 255, 0.8) 0%, transparent 60%);
        border-radius: 50%;
        filter: blur(35px);
        animation: primary-logo-shimmer 5s ease-in-out infinite alternate;
    }

    @keyframes primary-logo-shimmer {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 0.8; }
    }

    @keyframes primary-logo-float-ring {
        0% {
            transform: translateY(0px) scale(1);
        }
        50% {
            transform: translateY(-15px) scale(0.98);
        }
        100% {
            transform: translateY(0px) scale(1);
        }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.animation();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    cancelAnimationFrame(this.animationId);
  }

  private animation() {
    this.animationId = requestAnimationFrame(() => this.animation());

    // Re-initialize analysers if lost (should be handled by setters, but safety check)
    if (!this.inputAnalyser && this.inputNode) {
        this.inputAnalyser = new Analyser(this.inputNode);
    }
    if (!this.outputAnalyser && this.outputNode) {
        this.outputAnalyser = new Analyser(this.outputNode);
    }

    if (!this.inputAnalyser || !this.outputAnalyser) return;

    this.inputAnalyser.update();
    this.outputAnalyser.update();

    const getAvg = (data: Uint8Array) => {
        let sum = 0;
        for(let i=0; i<data.length; i++) sum += data[i];
        return sum / data.length / 255;
    };

    // Sensitivity multipliers
    const inVol = getAvg(this.inputAnalyser.data) * 2; 
    const outVol = getAvg(this.outputAnalyser.data) * 2;
    
    const targetVolume = Math.max(inVol, outVol);

    // Smooth the volume (Lerp)
    // Lowered from 0.03 to 0.01 for much smoother animation
    this.currentVolume += (targetVolume - this.currentVolume) * 0.01;

    const wrapper = this.renderRoot?.querySelector('.sphere-container-wrapper') as HTMLElement;
    if (wrapper) {
        // Base scale logic to fit screen
        const minDim = Math.min(window.innerWidth, window.innerHeight);
        // Target size around 200px (Half of the original 400px target)
        // We cap scale at 0.5 to ensure it is "half of this" as requested.
        const scaleFactor = Math.min(0.5, (minDim * 0.8) / 400);
        
        const audioBump = Math.min(0.3, this.currentVolume * 0.5); 
        
        // Vibration effect: slightly rotate based on volume intensity
        // Using sine wave instead of random for smoother animation
        const time = Date.now() * 0.002;
        const rotation = Math.sin(time) * (this.currentVolume * 10);

        // Glow effect: drop-shadow based on volume
        // We use a cyan/blueish glow to match the orb colors
        const glowOpacity = Math.min(0.8, this.currentVolume * 1.2);
        const glowRadius = 10 + (this.currentVolume * 50);
        
        wrapper.style.transform = `scale(${scaleFactor + audioBump}) rotate(${rotation}deg)`;
        wrapper.style.filter = `drop-shadow(0 0 ${glowRadius}px rgba(197, 237, 255, ${glowOpacity}))`;
    }
  }

  protected render() {
    return html`
      <div class="sphere-container-wrapper">
        <div class="sphere-container">
            <div class="glass-sphere">
                <div class="orb orb-1"></div>
                <div class="orb orb-2"></div>
                <div class="orb orb-3"></div>
                <div class="ring"></div>
            </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gdm-live-audio-visuals-3d': GdmLiveAudioVisuals3D;
  }
}