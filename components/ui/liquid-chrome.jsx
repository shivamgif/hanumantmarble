"use client";

import React from 'react';

export function LiquidChrome({
  baseColor = [0.922, 0.961, 0.953],  // cool cream #ebf0f5
  accentColor = [0.039, 0.039, 0.475], // brand navy #f8fafc
  speed = 0.35,
  amplitude = 0.45,
  frequency = 3.2,
  interactive = true,
  className = '',
  style = {},
}) {
  const canvasRef = React.useRef(null);
  const mouseRef = React.useRef({ x: 0.5, y: 0.5 });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: true, premultipliedAlpha: false });
    if (!gl) return;

    const vertSrc = `
      attribute vec2 aPos;
      varying vec2 vUv;
      void main() {
        vUv = aPos * 0.5 + 0.5;
        gl_Position = vec4(aPos, 0.0, 1.0);
      }
    `;

    const fragSrc = `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform vec2 uRes;
      uniform vec2 uMouse;
      uniform vec3 uBase;
      uniform vec3 uAccent;
      uniform float uAmp;
      uniform float uFreq;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        vec2 uv = vUv;
        vec2 p = uv;
        p.x *= uRes.x / uRes.y;

        vec2 mouse = uMouse;
        mouse.x *= uRes.x / uRes.y;
        float md = distance(p, mouse);
        float mInf = exp(-md * 2.5) * 0.35;

        float t = uTime * 0.4;
        vec2 q = p * uFreq;
        float n1 = noise(q + vec2(t, 0.0));
        float n2 = noise(q * 0.7 + vec2(0.0, t * 0.6));

        vec2 distort = vec2(n1, n2) * uAmp + (mouse - p) * mInf;
        vec2 sp = p + distort;

        float band = sin(sp.x * 6.0 + sp.y * 3.0 + uTime * 0.6) * 0.5 + 0.5;
        band = pow(band, 1.6);

        float highlight = exp(-md * 3.5) * 0.6;

        vec3 col = mix(uBase, uAccent, band * 0.18 + highlight * 0.25);

        float vign = 1.0 - distance(uv, vec2(0.5)) * 0.6;
        col *= vign;

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('LiquidChrome shader error', gl.getShaderInfoLog(s));
      }
      return s;
    }

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertSrc));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(program);
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, 'uTime');
    const uRes = gl.getUniformLocation(program, 'uRes');
    const uMouse = gl.getUniformLocation(program, 'uMouse');
    const uBase = gl.getUniformLocation(program, 'uBase');
    const uAccent = gl.getUniformLocation(program, 'uAccent');
    const uAmp = gl.getUniformLocation(program, 'uAmp');
    const uFreq = gl.getUniformLocation(program, 'uFreq');

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.parentElement ? canvas.parentElement.clientWidth : canvas.clientWidth;
      const h = canvas.parentElement ? canvas.parentElement.clientHeight : canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    // ResizeObserver tracks parent container so the canvas re-measures when
    // dynamic sections load in (window resize alone misses those changes)
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement || canvas);

    let smoothMouse = { x: 0.5, y: 0.5 };
    function onMove(e) {
      if (!interactive) return;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: 1 - (e.clientY - rect.top) / rect.height,
      };
    }
    window.addEventListener('mousemove', onMove);

    const start = performance.now();
    let raf;
    function tick() {
      const t = ((performance.now() - start) / 1000) * speed;
      smoothMouse.x += (mouseRef.current.x - smoothMouse.x) * 0.06;
      smoothMouse.y += (mouseRef.current.y - smoothMouse.y) * 0.06;

      gl.uniform1f(uTime, t);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uMouse, smoothMouse.x, smoothMouse.y);
      gl.uniform3f(uBase, baseColor[0], baseColor[1], baseColor[2]);
      gl.uniform3f(uAccent, accentColor[0], accentColor[1], accentColor[2]);
      gl.uniform1f(uAmp, amplitude);
      gl.uniform1f(uFreq, frequency);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        ...style,
      }}
    />
  );
}
