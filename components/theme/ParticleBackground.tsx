'use client';

import {useEffect, useRef} from "react";

// Ambient drifting-particle field rendered behind all content — ported from the Stitch
// "Cyber-Fin Tech Core" reference dashboard. Fixed, full-viewport, non-interactive.
type ParticleBackgroundProps = {
    color?: string;    // 6-digit hex from the active palette (brand)
    reduced?: boolean; // the in-app reduce-motion setting; OS preference is honoured too
};

const hexToRgbTriplet = (hex: string): string => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return '125, 244, 255';
    const n = parseInt(m[1], 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
};

const ParticleBackground = ({color = '#7df4ff', reduced = false}: ParticleBackgroundProps) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const prefersReducedMotion = reduced || (
            typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
        const rgb = hexToRgbTriplet(color);

        type Particle = {x: number; y: number; vx: number; vy: number; size: number; life: number};
        let particles: Particle[] = [];
        let raf = 0;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        const spawn = (): Particle => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            size: Math.random() * 2,
            life: Math.random() * 0.5 + 0.2,
        });

        const initParticles = () => {
            // Scale count to viewport area so large screens don't feel sparse, capped for perf.
            const count = Math.min(80, Math.round((canvas.width * canvas.height) / 26000));
            particles = Array.from({length: Math.max(40, count)}, spawn);
        };

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (const p of particles) {
                ctx.fillStyle = `rgba(${rgb}, ${p.life})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
        };

        const tick = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (const p of particles) {
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
                    Object.assign(p, spawn());
                }
                ctx.fillStyle = `rgba(${rgb}, ${p.life})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
            raf = requestAnimationFrame(tick);
        };

        const onResize = () => {
            resize();
            initParticles();
            if (prefersReducedMotion) draw();   // resizing clears the canvas; the static frame must be repainted
        };

        resize();
        initParticles();

        if (prefersReducedMotion) {
            // Render a single static frame instead of animating.
            draw();
        } else {
            raf = requestAnimationFrame(tick);
        }

        window.addEventListener('resize', onResize);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', onResize);
        };
    }, [color, reduced]);

    return <canvas ref={canvasRef} id="bg-canvas" aria-hidden="true" />;
};

export default ParticleBackground;
