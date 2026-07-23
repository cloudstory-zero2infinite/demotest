import React, { useState, useEffect, useRef } from 'react';

import { FaGithub } from "react-icons/fa";

import * as SupabaseService from '../../services/supabase';

if (typeof window !== 'undefined') {
    (window as any).SupabaseService = SupabaseService;
}

// Continent datasets for 3D globe projection (approx spherical coordinates)
const CONTINENTS = [
    // Africa
    [
        [-17, 32], [-13, 32], [-6, 35], [10, 37], [20, 32], [25, 31], [31, 31],
        [32, 27], [34, 27], [36, 30], [43, 12], [49, 12], [51, 11], [46, -10],
        [39, -20], [34, -34], [20, -35], [12, -30], [8, -8], [9, 5], [5, 5],
        [-9, 4], [-17, 15], [-17, 32]
    ],
    // Europe
    [
        [-10, 36], [-9, 43], [-5, 43], [-2, 49], [-5, 50], [-5, 56], [5, 58],
        [8, 63], [10, 58], [20, 60], [25, 70], [30, 70], [35, 68], [40, 60],
        [30, 45], [25, 40], [20, 38], [15, 40], [12, 36], [5, 36], [-10, 36]
    ],
    // Asia
    [
        [40, 60], [50, 70], [60, 72], [80, 73], [100, 76], [120, 77], [140, 75],
        [160, 70], [170, 66], [175, 60], [165, 50], [140, 50], [140, 35],
        [120, 38], [120, 23], [108, 18], [105, 20], [100, 15], [96, 20],
        [90, 22], [80, 10], [76, 10], [72, 20], [60, 25], [58, 12], [48, 12],
        [45, 23], [35, 30], [30, 45], [40, 60]
    ],
    // North America
    [
        [-168, 65], [-150, 70], [-120, 75], [-100, 70], [-80, 75], [-60, 60],
        [-55, 50], [-65, 45], [-80, 25], [-90, 15], [-100, 18], [-105, 25],
        [-115, 30], [-120, 34], [-125, 48], [-140, 60], [-168, 65]
    ],
    // South America
    [
        [-80, 10], [-72, 11], [-60, 5], [-45, -5], [-35, -7], [-40, -20],
        [-60, -40], [-70, -53], [-74, -53], [-72, -40], [-70, -30], [-80, -10],
        [-80, 0], [-80, 10]
    ],
    // Australia
    [
        [113, -26], [115, -34], [120, -35], [135, -38], [145, -38], [150, -34],
        [150, -25], [142, -10], [137, -10], [135, -15], [130, -12], [120, -15],
        [115, -20], [113, -26]
    ],
    // Greenland
    [
        [-70, 78], [-60, 83], [-30, 83], [-10, 80], [-20, 70], [-40, 60],
        [-50, 60], [-70, 78]
    ],
    // Madagascar
    [
        [47, -25], [49, -25], [50, -15], [48, -12], [47, -25]
    ]
];

const InteractiveGlobe: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
    const rotationRef = useRef({ x: 0.2, y: 0.5 }); // Initial angles (lat/long in rad)
    
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            const width = window.innerWidth;
            const height = window.innerHeight;
            const dx = (e.clientX - width / 2) / (width / 2); // range [-1, 1]
            const dy = (e.clientY - height / 2) / (height / 2); // range [-1, 1]
            
            // Set target Y-rotation (longitude) and X-rotation (latitude)
            mouseRef.current.targetY = dx * Math.PI * 0.8;
            mouseRef.current.targetX = dy * Math.PI * 0.4;
        };
        
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        const R = 260; // radius of globe
        const cx = 400; // center X
        const cy = 400; // center Y
        const autoSpin = 0.0025; // Auto spin speed

        const render = () => {
            const mouse = mouseRef.current;
            const rot = rotationRef.current;
            
            // Smoothly move towards cursor targets
            rot.y += (mouse.targetY - rot.y) * 0.04 + autoSpin;
            rot.x += (mouse.targetX - rot.x) * 0.04;

            ctx.clearRect(0, 0, 800, 800);

            // Draw backlight glow
            const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 380);
            glowGrad.addColorStop(0, 'rgba(20, 184, 166, 0.18)');
            glowGrad.addColorStop(0.5, 'rgba(20, 184, 166, 0.04)');
            glowGrad.addColorStop(1, 'rgba(20, 184, 166, 0)');
            ctx.fillStyle = glowGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, 380, 0, 2 * Math.PI);
            ctx.fill();

            // Project 3D to 2D function
            const project = (lonDeg: number, latDeg: number) => {
                const lon = (lonDeg * Math.PI) / 180;
                const lat = (latDeg * Math.PI) / 180;
                
                const x = Math.cos(lat) * Math.sin(lon);
                const y = Math.sin(lat);
                const z = Math.cos(lat) * Math.cos(lon);

                // Rotate longitude (around Y axis)
                const x1 = x * Math.cos(rot.y) - z * Math.sin(rot.y);
                const z1 = x * Math.sin(rot.y) + z * Math.cos(rot.y);

                // Rotate latitude (around X axis)
                const y2 = y * Math.cos(rot.x) + z1 * Math.sin(rot.x);
                const z2 = -y * Math.sin(rot.x) + z1 * Math.cos(rot.x);

                return {
                    x: cx + x1 * R,
                    y: cy - y2 * R,
                    z: z2
                };
            };

            // Clip drawing to sphere circle
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, 2 * Math.PI);
            ctx.clip();

            // 1. Draw Globe Sphere Background
            ctx.fillStyle = '#070c15';
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, 2 * Math.PI);
            ctx.fill();

            // 2. Draw Sphere Grid Lines (Latitudes and Longitudes)
            ctx.strokeStyle = '#115e59';
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.35;

            // Latitudes
            [-60, -30, 0, 30, 60].forEach(lat => {
                ctx.beginPath();
                for (let lon = -180; lon <= 180; lon += 5) {
                    const p = project(lon, lat);
                    if (p.z > 0) {
                        if (lon === -180) ctx.moveTo(p.x, p.y);
                        else ctx.lineTo(p.x, p.y);
                    }
                }
                ctx.stroke();
            });

            // Longitudes
            for (let lon = -180; lon < 180; lon += 30) {
                ctx.beginPath();
                for (let lat = -90; lat <= 90; lat += 5) {
                    const p = project(lon, lat);
                    if (p.z > 0) {
                        if (lat === -90) ctx.moveTo(p.x, p.y);
                        else ctx.lineTo(p.x, p.y);
                    }
                }
                ctx.stroke();
            }
            ctx.globalAlpha = 1.0;

            // 3. Draw Continents
            ctx.strokeStyle = '#2dd4bf';
            ctx.lineWidth = 1.5;
            
            // Create continent gradient
            const continentGrad = ctx.createLinearGradient(0, 0, 800, 800);
            continentGrad.addColorStop(0, 'rgba(20, 184, 166, 0.28)');
            continentGrad.addColorStop(1, 'rgba(13, 148, 136, 0.08)');
            ctx.fillStyle = continentGrad;

            CONTINENTS.forEach(poly => {
                let totalZ = 0;
                poly.forEach(pt => {
                    const proj = project(pt[0], pt[1]);
                    totalZ += proj.z;
                });
                const avgZ = totalZ / poly.length;

                // Draw polygon only if it's generally facing the front
                if (avgZ > -0.2) {
                    ctx.beginPath();
                    poly.forEach((pt, idx) => {
                        const p = project(pt[0], pt[1]);
                        if (idx === 0) ctx.moveTo(p.x, p.y);
                        else ctx.lineTo(p.x, p.y);
                    });
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                }
            });

            ctx.restore(); // remove clip

            // 4. Draw outer border of the sphere
            ctx.strokeStyle = '#14b8a6';
            ctx.lineWidth = 1.8;
            ctx.globalAlpha = 0.45;
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.globalAlpha = 1.0;

            // 5. Draw center shield & checkmark (with a slight responsive parallax float)
            const shieldOffset = {
                x: (mouse.targetY - rot.y) * 10,
                y: (mouse.targetX - rot.x) * 10
            };
            
            ctx.save();
            ctx.translate(shieldOffset.x, shieldOffset.y);
            
            // Glow filter simulation
            ctx.shadowColor = '#2dd4bf';
            ctx.shadowBlur = 12;
            
            // Draw Shield path
            ctx.strokeStyle = '#2dd4bf';
            ctx.fillStyle = '#070c15';
            ctx.lineWidth = 2.5;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(370, 375);
            ctx.quadraticCurveTo(385, 378, 400, 380);
            ctx.quadraticCurveTo(415, 378, 430, 375);
            ctx.bezierCurveTo(433, 397, 430, 418, 400, 435);
            ctx.bezierCurveTo(370, 418, 367, 397, 370, 375);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Disable shadow for checkmark to keep it sharp
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#2dd4bf';
            ctx.lineWidth = 3.2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(386, 402);
            ctx.lineTo(397, 413);
            ctx.lineTo(414, 394);
            ctx.stroke();

            ctx.restore();

            animationFrameId = requestAnimationFrame(render);
        };

        render();
        return () => cancelAnimationFrame(animationFrameId);
    }, []);

    return (
        <canvas 
            ref={canvasRef} 
            width={800} 
            height={800}
            className="w-[550px] h-[550px] sm:w-[700px] sm:h-[700px] md:w-[900px] md:h-[900px] lg:w-[1100px] lg:h-[1100px]"
        />
    );
};



interface NameEntryModalProps {

    isOpen: boolean;

}



const PASSWORD_RULES = [

    { test: (p: string) => p.length >= 8, label: 'At least 8 characters' },

    { test: (p: string) => /[A-Z]/.test(p), label: 'One uppercase letter' },

    { test: (p: string) => /[a-z]/.test(p), label: 'One lowercase letter' },

    { test: (p: string) => /[0-9]/.test(p), label: 'One number' },

    { test: (p: string) => /[^A-Za-z0-9]/.test(p), label: 'One special character' },

];



type EmailMode = 'signin' | 'signup' | 'setpassword';



export const NameEntryModal: React.FC<NameEntryModalProps> = ({ isOpen }) => {

    const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);

    const [isGitHubSigningIn, setIsGitHubSigningIn] = useState(false);



    // Email auth state

    const [showEmail, setShowEmail] = useState(false);

    const [emailMode, setEmailMode] = useState<EmailMode>('signin');

    const [email, setEmail] = useState('');

    const [password, setPassword] = useState('');

    const [confirmPassword, setConfirmPassword] = useState('');

    const [emailLoading, setEmailLoading] = useState(false);

    const [emailMessage, setEmailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const [isAutoRedirecting, setIsAutoRedirecting] = useState(() => {
        return isOpen && typeof window !== 'undefined' && window.location.href.includes('type=invite');
    });

    const [autoRedirectStatus, setAutoRedirectStatus] = useState('');

    useEffect(() => {
        if (!isOpen) return;

        const handleInviteAutoRedirect = async () => {
            const fullUrl = window.location.href;
            if (!fullUrl.includes('type=invite')) {
                setIsAutoRedirecting(false);
                return;
            }

            try {
                setIsAutoRedirecting(true);
                setAutoRedirectStatus('Verifying invitation token...');

                // 1. Handle cases where the URL hash is malformed (e.g. /#/ or ##)
                const accessToken = fullUrl.match(/[?&#]access_token=([^&]*)/)?.[1];
                const refreshToken = fullUrl.match(/[?&#]refresh_token=([^&]*)/)?.[1];

                if (accessToken && refreshToken) {
                    try {
                        await SupabaseService.supabase.auth.setSession({
                            access_token: accessToken,
                            refresh_token: refreshToken
                        });
                    } catch (e) {
                        console.error("Manual session set failed during auto-redirect check", e);
                    }
                }

                // 2. Try to get email from session
                let userEmail: string | null = null;
                const { data } = await SupabaseService.supabase.auth.getUser();
                if (data.user?.email) {
                    userEmail = data.user.email;
                } else {
                    // Try second time with a short propagation delay
                    await new Promise(resolve => setTimeout(resolve, 500));
                    const { data: secondTry } = await SupabaseService.supabase.auth.getUser();
                    if (secondTry.user?.email) {
                        userEmail = secondTry.user.email;
                    }
                }

                if (!userEmail) {
                    console.warn("Could not retrieve invited user's email");
                    setIsAutoRedirecting(false);
                    return;
                }

                // Populate email state
                setEmail(userEmail);

                // 3. Determine redirect behavior based on email
                const emailLower = userEmail.toLowerCase();
                
                if (emailLower.includes('@gmail.com')) {
                    setAutoRedirectStatus('Redirecting to Google Sign-In...');
                    await handleGoogleSignIn();
                } else {
                    setAutoRedirectStatus('Checking authentication provider...');
                    // Check if associated with GitHub
                    let isGitHub = emailLower.endsWith('@github.com') || emailLower.includes('github');
                    if (!isGitHub) {
                        try {
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 1200); // 1.2s timeout
                            const res = await fetch(`https://api.github.com/search/users?q=${encodeURIComponent(userEmail)}+in:email`, {
                                signal: controller.signal
                            });
                            clearTimeout(timeoutId);
                            if (res.ok) {
                                const searchData = await res.json();
                                isGitHub = searchData && searchData.total_count > 0;
                            }
                        } catch (e) {
                            console.error("GitHub search API check failed:", e);
                        }
                    }

                    if (isGitHub) {
                        setAutoRedirectStatus('Redirecting to GitHub Sign-In...');
                        await handleGitHubSignIn();
                    } else {
                        // For all other email domains, redirect to normal email login flow (Set Password mode)
                        setShowEmail(true);
                        setEmailMode('setpassword');
                        setIsAutoRedirecting(false);
                    }
                }
            } catch (err) {
                console.error("Failed handling auto redirect for invite:", err);
                setIsAutoRedirecting(false);
            }
        };

        handleInviteAutoRedirect();
    }, [isOpen]);



    if (!isOpen) return null;

    if (isAutoRedirecting) {
        return (
            <div className="fixed inset-0 bg-[#070c15] z-[100] flex items-center justify-center p-6" aria-modal="true" role="dialog">
                
                {/* Embedded CSS for smooth SVG animations */}
                <style>{`
                    @keyframes spin-clockwise {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                    @keyframes spin-counter {
                        from { transform: rotate(360deg); }
                        to { transform: rotate(0deg); }
                    }
                    @keyframes pulse-shield {
                        0%, 100% { opacity: 0.95; filter: drop-shadow(0 0 4px rgba(45,212,191,0.5)); }
                        50% { opacity: 1; filter: drop-shadow(0 0 16px rgba(45,212,191,0.9)); }
                    }
                    .animate-spin-slow-clockwise {
                        animation: spin-clockwise 100s linear infinite;
                    }
                    .animate-spin-slow-counter {
                        animation: spin-counter 80s linear infinite;
                    }
                    .animate-spin-slow-clockwise-3 {
                        animation: spin-clockwise 120s linear infinite;
                    }
                    .animate-pulse-shield {
                        animation: pulse-shield 4s ease-in-out infinite;
                    }
                `}</style>

                {/* Interactive security globe background (Centered behind the login loader) */}
                <div className="absolute inset-0 w-full h-full flex items-center justify-center pointer-events-none select-none overflow-hidden">
                    <div className="relative w-[550px] h-[550px] sm:w-[700px] sm:h-[700px] md:w-[900px] md:h-[900px] lg:w-[1100px] lg:h-[1100px] flex items-center justify-center">
                        <InteractiveGlobe />
                        
                        {/* Overlay rotating orbits */}
                        <svg className="absolute inset-0 w-full h-full text-teal-500/20" viewBox="0 0 800 800" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <g className="animate-spin-slow-clockwise origin-center">
                                <ellipse cx="400" cy="400" rx="300" ry="115" stroke="#2dd4bf" strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="4 8" transform="rotate(-30 400 400)" />
                                <rect x="220" y="303" width="7" height="7" fill="#2dd4bf" transform="rotate(-30 400 400) translate(-3.5 -3.5)" stroke="#070c15" strokeWidth="1" />
                                <rect x="580" y="497" width="7" height="7" fill="#2dd4bf" transform="rotate(-30 400 400) translate(-3.5 -3.5)" stroke="#070c15" strokeWidth="1" />
                            </g>
                            <g className="animate-spin-slow-counter origin-center">
                                <ellipse cx="400" cy="400" rx="335" ry="145" stroke="#2dd4bf" strokeOpacity="0.4" strokeWidth="1.2" strokeDasharray="3 6" transform="rotate(20 400 400)" />
                                <rect x="180" y="476" width="7" height="7" fill="#2dd4bf" transform="rotate(20 400 400) translate(-3.5 -3.5)" stroke="#070c15" strokeWidth="1" />
                                <rect x="620" y="324" width="7" height="7" fill="#2dd4bf" transform="rotate(20 400 400) translate(-3.5 -3.5)" stroke="#070c15" strokeWidth="1" />
                            </g>
                            <g className="animate-spin-slow-clockwise-3 origin-center">
                                <ellipse cx="400" cy="400" rx="315" ry="85" stroke="#2dd4bf" strokeOpacity="0.3" strokeWidth="1.2" strokeDasharray="1 10" transform="rotate(75 400 400)" />
                                <rect x="400" y="85" width="7" height="7" fill="#2dd4bf" transform="rotate(75 400 400) translate(-3.5 -3.5)" stroke="#070c15" strokeWidth="1" />
                                <rect x="400" y="715" width="7" height="7" fill="#2dd4bf" transform="rotate(75 400 400) translate(-3.5 -3.5)" stroke="#070c15" strokeWidth="1" />
                            </g>
                        </svg>
                    </div>
                </div>

                {/* Loading Container (Centered & Highly Translucent Glassmorphism) */}
                <div className="w-full max-w-md bg-[#070e17]/25 backdrop-blur-[2.5px] border border-[#1e3a5f]/40 rounded-2xl shadow-2xl p-8 text-center animate-in fade-in zoom-in-95 duration-300 z-10 text-white mx-auto">
                    <div className="flex flex-col items-center">
                        <img src="/logo.png" alt="Zero to Infinite" className="h-16 w-16 object-contain mb-6 animate-pulse" />
                        <div className="relative flex items-center justify-center mb-6">
                            <div className="h-12 w-12 rounded-full border-4 border-teal-500/20 border-t-teal-500 animate-spin" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-100 mb-2">Accepting Your Invitation</h3>
                        <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
                            {autoRedirectStatus || 'Verifying your invitation details and preparing your workspace...'}
                        </p>
                    </div>
                </div>
            </div>
        );
    }



    const validatePassword = (pwd: string): string | null => {

        const failing = PASSWORD_RULES.filter(r => !r.test(pwd));

        if (failing.length > 0) return `Password requires: ${failing.map(r => r.label.toLowerCase()).join(', ')}`;

        return null;

    };



    const handleEmailSignIn = async (e: React.FormEvent) => {

        e.preventDefault();

        setEmailMessage(null);



        try {

            setEmailLoading(true);

            sessionStorage.setItem('freshLogin', 'true');

            sessionStorage.setItem('loginProvider', 'email');



            const { error } = await SupabaseService.supabase.auth.signInWithPassword({

                email,

                password,

            });

            if (error) throw error;

        } catch (err: any) {

            setEmailMessage({ type: 'error', text: err?.message || 'Sign-in failed. Please try again.' });

        } finally {

            setEmailLoading(false);

        }

    };



    const handleResetPassword = async () => {
        setEmailMessage(null);
        if (!email) {
            setEmailMessage({ type: 'error', text: 'Enter your email above first.' });
            return;
        }
        try {
            setEmailLoading(true);
            const { error } = await SupabaseService.supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/`,
            });
            if (error) throw error;
            setEmailMessage({ type: 'success', text: 'Password reset link sent to your email.' });
        } catch (err: any) {
            setEmailMessage({ type: 'error', text: err?.message || 'Failed to send reset email.' });
        } finally {
            setEmailLoading(false);
        }
    };



    const handleSetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setEmailMessage(null);

        const pwdError = validatePassword(password);
        if (pwdError) {
            setEmailMessage({ type: 'error', text: pwdError });
            return;
        }

        if (password !== confirmPassword) {
            setEmailMessage({ type: 'error', text: 'Passwords do not match.' });
            return;
        }

        try {
            setEmailLoading(true);
            
            // Robustly extract tokens from URL regardless of malformed hashes/slashes
            const fullUrl = window.location.href;
            const accessToken = fullUrl.match(/[?&#]access_token=([^&]*)/)?.[1];
            const refreshToken = fullUrl.match(/[?&#]refresh_token=([^&]*)/)?.[1];

            if (accessToken && refreshToken) {
                await SupabaseService.supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken
                });
            }

            // Check session again
            const { data: sessionData } = await SupabaseService.supabase.auth.getSession();
            if (!sessionData.session) {
                throw new Error('Your invitation session has expired or is invalid. Please try clicking the link in your email again.');
            }

            const { error } = await SupabaseService.supabase.auth.updateUser({
                password: password,
            });

            if (error) throw error;

            setEmailMessage({ 
                type: 'success', 
                text: 'Password set successfully! You can now sign in with your email and password.' 
            });
            
            // Clear the invitation hash from the URL so normal login can proceed
            if (window.location.hash.includes('type=invite')) {
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }

            // Switch to signin mode after success
            setTimeout(() => {
                setEmailMode('signin');
                setPassword('');
                setConfirmPassword('');
            }, 2000);

        } catch (err: any) {
            setEmailMessage({ type: 'error', text: err?.message || 'Failed to set password. Please try again.' });
        } finally {
            setEmailLoading(false);
        }
    };



    const handleEmailSignUp = async (e: React.FormEvent) => {

        e.preventDefault();

        setEmailMessage(null);



        const pwdError = validatePassword(password);

        if (pwdError) {

            setEmailMessage({ type: 'error', text: pwdError });

            return;

        }

        if (password !== confirmPassword) {

            setEmailMessage({ type: 'error', text: 'Passwords do not match.' });

            return;

        }



        try {

            setEmailLoading(true);

            const { data, error } = await SupabaseService.supabase.auth.signUp({

                email,

                password,

                options: { emailRedirectTo: `${window.location.origin}/` },

            });

            if (error) throw error;



            // Supabase returns a user with identities=[] if email already exists (when email confirmations are on)

            if (data.user && data.user.identities && data.user.identities.length === 0) {

                setEmailMessage({ type: 'error', text: 'This email is already registered. If you were invited, please check your email for the invitation link, or use the "Forgot Password" option below.' });

                return;

            }



            setEmailMessage({ type: 'success', text: 'Check your email to verify your account, then sign in.' });

            setPassword('');

            setConfirmPassword('');

        } catch (err: any) {

            setEmailMessage({ type: 'error', text: err?.message || 'Signup failed. Please try again.' });

        } finally {

            setEmailLoading(false);

        }

    };



    const handleGoogleSignIn = async () => {

        try {

            setIsGoogleSigningIn(true);

            if (!SupabaseService.supabase || !SupabaseService.supabase.auth) {

                throw new Error('Authentication service is not available. Please check your configuration.');

            }

            sessionStorage.setItem('freshLogin', 'true');

            sessionStorage.setItem('loginProvider', 'google');



            try {

                await SupabaseService.logAllActivity({

                    action: 'google_login_initiated', module: 'Authentication',

                    entity_name: 'User', event_data: { provider: 'google' }

                });

            } catch (logErr) { console.error('Failed to log login initiation activity', logErr); }



            await SupabaseService.supabase.auth.signInWithOAuth({

                provider: 'google',

                options: { redirectTo: `${window.location.origin}/`, scopes: 'profile email' }

            });

        } catch (err: any) {

            console.error('Sign-in error:', err?.message || err);

            setIsGoogleSigningIn(false);

            try {

                await SupabaseService.logAllActivity({

                    action: 'google_login_failed', module: 'Authentication',

                    entity_name: 'Unknown User', severity: 'warning',

                    event_data: { provider: 'google', error: err?.message || 'Sign-in initiation failed' }

                });

            } catch (logErr) { console.error('Failed to log failed login activity', logErr); }

            alert(`Sign-in error: ${err?.message || 'Failed to initiate sign-in. Please try again.'}`);

        }

    };



    const handleGitHubSignIn = async () => {

        try {

            setIsGitHubSigningIn(true);

            if (!SupabaseService.supabase || !SupabaseService.supabase.auth) {

                throw new Error('Authentication service is not available. Please check your configuration.');

            }

            sessionStorage.setItem('freshLogin', 'true');

            sessionStorage.setItem('loginProvider', 'github');



            try {

                await SupabaseService.logAllActivity({

                    action: 'github_login_initiated', module: 'Authentication',

                    entity_name: 'User', event_data: { provider: 'github' }

                });

            } catch (logErr) { console.error('Failed to log login initiation activity', logErr); }



            await SupabaseService.supabase.auth.signInWithOAuth({

                provider: 'github',

                options: { redirectTo: `${window.location.origin}/`, scopes: 'user:email' }

            });

        } catch (err: any) {

            console.error('Sign-in error:', err?.message || err);

            setIsGitHubSigningIn(false);

            try {

                await SupabaseService.logAllActivity({

                    action: 'github_login_failed', module: 'Authentication',

                    entity_name: 'Unknown User', severity: 'warning',

                    event_data: { provider: 'github', error: err?.message || 'Sign-in initiation failed' }

                });

            } catch (logErr) { console.error('Failed to log failed login activity', logErr); }

            alert(`Sign-in error: ${err?.message || 'Failed to initiate sign-in. Please try again.'}`);

        }

    };



    const passwordStrength = password ? PASSWORD_RULES.filter(r => r.test(password)).length : 0;



    return (

        <div className="fixed inset-0 bg-[#070c15] text-slate-100 z-[100] flex items-center justify-center p-6 overflow-hidden select-none" aria-modal="true" role="dialog">

            {/* Embedded CSS for smooth SVG animations */}

            <style>{`
                @keyframes spin-clockwise {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes spin-counter {
                    from { transform: rotate(360deg); }
                    to { transform: rotate(0deg); }
                }
                @keyframes pulse-shield {
                    0%, 100% { opacity: 0.95; filter: drop-shadow(0 0 4px rgba(45,212,191,0.5)); }
                    50% { opacity: 1; filter: drop-shadow(0 0 16px rgba(45,212,191,0.9)); }
                }
                .animate-spin-slow-clockwise {
                    animation: spin-clockwise 100s linear infinite;
                }
                .animate-spin-slow-counter {
                    animation: spin-counter 80s linear infinite;
                }
                .animate-spin-slow-clockwise-3 {
                    animation: spin-clockwise 120s linear infinite;
                }
                .animate-pulse-shield {
                    animation: pulse-shield 4s ease-in-out infinite;
                }
            `}</style>

            {/* Interactive security globe background (Centered behind the login card) */}
            <div className="absolute inset-0 w-full h-full flex items-center justify-center pointer-events-none select-none overflow-hidden">
                <div className="relative w-[550px] h-[550px] sm:w-[700px] sm:h-[700px] md:w-[900px] md:h-[900px] lg:w-[1100px] lg:h-[1100px] flex items-center justify-center">
                    <InteractiveGlobe />
                    
                    {/* Overlay rotating orbits */}
                    <svg className="absolute inset-0 w-full h-full text-teal-500/20" viewBox="0 0 800 800" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <g className="animate-spin-slow-clockwise origin-center">
                            <ellipse cx="400" cy="400" rx="300" ry="115" stroke="#2dd4bf" strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="4 8" transform="rotate(-30 400 400)" />
                            <rect x="220" y="303" width="7" height="7" fill="#2dd4bf" transform="rotate(-30 400 400) translate(-3.5 -3.5)" stroke="#070c15" strokeWidth="1" />
                            <rect x="580" y="497" width="7" height="7" fill="#2dd4bf" transform="rotate(-30 400 400) translate(-3.5 -3.5)" stroke="#070c15" strokeWidth="1" />
                        </g>
                        <g className="animate-spin-slow-counter origin-center">
                            <ellipse cx="400" cy="400" rx="335" ry="145" stroke="#2dd4bf" strokeOpacity="0.4" strokeWidth="1.2" strokeDasharray="3 6" transform="rotate(20 400 400)" />
                            <rect x="180" y="476" width="7" height="7" fill="#2dd4bf" transform="rotate(20 400 400) translate(-3.5 -3.5)" stroke="#070c15" strokeWidth="1" />
                            <rect x="620" y="324" width="7" height="7" fill="#2dd4bf" transform="rotate(20 400 400) translate(-3.5 -3.5)" stroke="#070c15" strokeWidth="1" />
                        </g>
                        <g className="animate-spin-slow-clockwise-3 origin-center">
                            <ellipse cx="400" cy="400" rx="315" ry="85" stroke="#2dd4bf" strokeOpacity="0.3" strokeWidth="1.2" strokeDasharray="1 10" transform="rotate(75 400 400)" />
                            <rect x="400" y="85" width="7" height="7" fill="#2dd4bf" transform="rotate(75 400 400) translate(-3.5 -3.5)" stroke="#070c15" strokeWidth="1" />
                            <rect x="400" y="715" width="7" height="7" fill="#2dd4bf" transform="rotate(75 400 400) translate(-3.5 -3.5)" stroke="#070c15" strokeWidth="1" />
                        </g>
                    </svg>
                </div>
            </div>

            {/* Login Card (Centered & Highly Translucent Glassmorphism) */}
            <div className="w-full max-w-md bg-[#070e17]/25 backdrop-blur-[2.5px] border border-[#1e3a5f]/40 rounded-2xl shadow-2xl p-8 z-10 text-white relative mx-auto transition-all duration-300">

                {/* Header */}

                <div className="flex items-center gap-3 mb-4">

                    <img src="/logo.png" alt="Zero to Infinite" className="h-10 w-10 object-contain flex-shrink-0" />

                    <div>

                        <h2 className="text-lg font-bold text-white">Zero to Infinite</h2>

                        <p className="text-xs text-slate-400 uppercase tracking-widest">Governance Risk Compliance</p>

                    </div>

                </div>



                <p className="text-sm text-slate-300 mb-5">Sign in to get started.</p>



                {/* Continue with IDPs */}

                <div className="space-y-2.5 mb-4">

                    <button type="button" onClick={handleGoogleSignIn} disabled={isGoogleSigningIn} aria-live="polite"

                        className="w-full inline-flex items-center justify-center gap-3 px-5 py-3 bg-[#111a28]/45 hover:bg-[#152234]/70 border border-[#21344d]/60 hover:border-teal-500/50 rounded-full shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-60 transition duration-200">

                        <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><path fill='%23ea4335' d='M24 9.5c3.9 0 6.6 1.7 8.1 3.1l6-5.9C35.9 3.6 30.4 1 24 1 14.7 1 6.9 6.7 3.1 14.9l7.1 5.5C12.9 15.1 18 9.5 24 9.5z'/><path fill='%2334a853' d='M46.5 24c0-1.6-.1-2.9-.4-4.2H24v8.1h12.5c-.5 2.9-2.4 5.3-5.1 6.9l7.9 6.1C43.5 36.2 46.5 30.6 46.5 24z'/><path fill='%234a90e2' d='M10.2 29.3A14.8 14.8 0 0 1 9 24c0-1.1.2-2.1.4-3.1l-7.1-5.5C1.2 17.1 0 20.4 0 24c0 3.6 1.2 6.9 3.3 9.6l6.9-4.3z'/><path fill='%23fbbc05' d='M24 46.9c6.4 0 11.9-2.1 15.9-5.7l-7.9-6.1c-2 1.3-4.6 2.1-8 2.1-6 0-11.1-4.4-12.9-10.1l-7.1 5.5C6.9 41.2 14.7 46.9 24 46.9z'/></svg>" alt="Google" className="h-5 w-5 rounded-full" />

                        <span className="flex-1 text-sm font-semibold text-slate-100 text-left">Continue with Google</span>

                        {isGoogleSigningIn && (

                            <svg className="animate-spin h-5 w-5 text-teal-400" viewBox="0 0 24 24">

                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>

                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>

                            </svg>

                        )}

                    </button>



                    <button type="button" onClick={handleGitHubSignIn} disabled={isGitHubSigningIn} aria-live="polite"

                        className="w-full inline-flex items-center justify-center gap-3 px-5 py-3 bg-[#111a28]/45 hover:bg-[#152234]/70 border border-[#21344d]/60 hover:border-teal-500/50 rounded-full shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-60 transition duration-200">

                        <div className="h-5 w-5 flex-shrink-0 text-slate-100"><FaGithub size={20} /></div>

                        <span className="flex-1 text-sm font-semibold text-slate-100 text-left">Continue with GitHub</span>

                        {isGitHubSigningIn && (

                            <svg className="animate-spin h-5 w-5 text-teal-400" viewBox="0 0 24 24">

                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>

                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>

                            </svg>

                        )}

                    </button>

                </div>



                {/* Divider */}

                <div className="flex items-center gap-3 my-4">

                    <div className="flex-1 h-px bg-[#1b2f4a]" />

                    <span className="text-xs text-slate-400 uppercase">or</span>

                    <div className="flex-1 h-px bg-[#1b2f4a]" />

                </div>



                {/* Email sign-in / sign-up toggle */}

                {!showEmail ? (

                    <button type="button" onClick={() => { 

                        setShowEmail(true); 

                        if (window.location.href.includes('type=invite')) {

                            setEmailMode('setpassword');

                            // FIX: Handle cases where the URL hash is malformed (e.g. /#/ or ##)

                            const normalizeAndSetSession = async () => {

                                const fullUrl = window.location.href;

                                const accessToken = fullUrl.match(/[?&#]access_token=([^&]*)/)?.[1];

                                const refreshToken = fullUrl.match(/[?&#]refresh_token=([^&]*)/)?.[1];

                                if (accessToken && refreshToken) {

                                    try {

                                        await SupabaseService.supabase.auth.setSession({

                                            access_token: accessToken,

                                            refresh_token: refreshToken

                                        });

                                    } catch (e) {

                                        console.error("Manual session set failed", e);

                                    }

                                }

                            };

                            normalizeAndSetSession().then(() => {

                                // Try to get email from session

                                const fetchUser = async () => {

                                    const { data } = await SupabaseService.supabase.auth.getUser();

                                    if (data.user?.email) {

                                        setEmail(data.user.email);

                                    } else {

                                        setTimeout(async () => {

                                            const { data: secondTry } = await SupabaseService.supabase.auth.getUser();

                                            if (secondTry.user?.email) setEmail(secondTry.user.email);

                                        }, 500);

                                    }

                                };

                                fetchUser();

                            });

                        } else {

                            setEmailMode('signin');

                        }

                        setEmailMessage(null); 

                    }}

                        className="w-full inline-flex items-center justify-center gap-3 px-5 py-3 bg-[#111a28]/45 hover:bg-[#152234]/70 border border-[#21344d]/60 hover:border-teal-500/50 rounded-full shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition duration-200">

                        <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">

                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />

                        </svg>

                        <span className="flex-1 text-sm font-semibold text-slate-100 text-left">Login with Email</span>

                    </button>

                ) : (

                    <div className="border border-[#1b2f4a]/50 bg-[#0c1421]/45 rounded-xl p-5">

                        {/* Tabs */}

                        <div className="flex gap-4 mb-4 border-b border-[#1e2f47] pb-2">

                            <button type="button" onClick={() => { setEmailMode('signin'); setEmailMessage(null); }}

                                className={`text-sm font-medium pb-1.5 transition ${emailMode === 'signin' ? 'text-teal-400 border-b-2 border-teal-400 font-semibold' : 'text-slate-400 hover:text-slate-300'}`}>

                                Sign in

                            </button>

                            <button type="button" onClick={() => { setEmailMode('signup'); setEmailMessage(null); }}

                                className={`text-sm font-medium pb-1.5 transition ${emailMode === 'signup' ? 'text-teal-400 border-b-2 border-teal-400 font-semibold' : 'text-slate-400 hover:text-slate-300'}`}>

                                Sign up

                            </button>

                            {emailMode === 'setpassword' && (

                                <button type="button" disabled

                                    className="text-sm font-medium pb-1.5 text-teal-400 border-b-2 border-teal-400 ml-auto">

                                    Set Password

                                </button>

                            )}

                        </div>



                        {emailMessage && (

                            <p className={`text-xs px-3 py-2 rounded-md mb-3 border ${emailMessage.type === 'success' ? 'bg-green-950/40 text-green-400 border-green-800/30' : 'bg-red-950/40 text-red-400 border-red-800/30'}`}>

                                {emailMessage.text}

                            </p>

                        )}



                        <form onSubmit={emailMode === 'signin' ? handleEmailSignIn : (emailMode === 'signup' ? handleEmailSignUp : handleSetPassword)} className="space-y-3">

                            <input type="email" placeholder="Email" required value={email} onChange={e => setEmail(e.target.value)}

                                disabled={emailMode === 'setpassword'}

                                className="w-full px-3.5 py-2.5 text-sm bg-[#0e1726]/40 border border-[#21344d]/60 text-slate-100 placeholder-slate-500 rounded-lg focus:outline-none focus:border-teal-500/60 focus:ring-1 focus:ring-teal-500/30 disabled:bg-[#070c14] disabled:text-slate-500 transition duration-150" />

                            

                            <input type="password" placeholder={emailMode === 'setpassword' ? "New Password" : "Password"} required value={password} onChange={e => setPassword(e.target.value)}

                                className="w-full px-3.5 py-2.5 text-sm bg-[#0e1726]/40 border border-[#21344d]/60 text-slate-100 placeholder-slate-500 rounded-lg focus:outline-none focus:border-teal-500/60 focus:ring-1 focus:ring-teal-500/30 transition duration-150" />



                            {(emailMode === 'signup' || emailMode === 'setpassword') && (

                                <>

                                    <input type="password" placeholder="Confirm password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}

                                        className="w-full px-3.5 py-2.5 text-sm bg-[#0e1726]/40 border border-[#21344d]/60 text-slate-100 placeholder-slate-500 rounded-lg focus:outline-none focus:border-teal-500/60 focus:ring-1 focus:ring-teal-500/30 transition duration-150" />

                                    {/* Password strength indicator */}

                                    {password && (

                                        <div className="space-y-2.5 pt-1">

                                            <div className="flex gap-1">

                                                {PASSWORD_RULES.map((_, i) => (

                                                    <div key={i} className={`h-1 flex-1 rounded-full ${i < passwordStrength ? 'bg-teal-500' : 'bg-slate-800'}`} />

                                                ))}

                                            </div>

                                            <ul className="text-[10px] text-slate-400 space-y-0.5">

                                                {PASSWORD_RULES.map(r => (

                                                    <li key={r.label} className={r.test(password) ? 'text-teal-400' : ''}>

                                                        {r.test(password) ? '\u2713' : '\u2022'} {r.label}

                                                    </li>

                                                ))}

                                            </ul>

                                        </div>

                                    )}

                                </>

                            )}



                            <button type="submit" disabled={emailLoading}

                                className={`w-full py-2.5 text-sm font-semibold rounded-lg transition disabled:opacity-50 duration-200 ${

                                    emailMode === 'signin' || emailMode === 'setpassword'

                                        ? 'bg-teal-600/75 hover:bg-teal-500/90 text-white shadow-lg shadow-teal-900/20'

                                        : 'bg-[#131f30]/45 hover:bg-[#18273b]/70 border border-[#203652]/60 text-slate-300'

                                }`}>

                                {emailLoading ? 'Please wait...' : (emailMode === 'signin' ? 'Sign in' : (emailMode === 'signup' ? 'Create Account' : 'Set Password'))}

                            </button>

                        </form>



                        <div className="flex items-center justify-between mt-3 pt-1">

                            <button type="button" onClick={() => { setShowEmail(false); setEmailMessage(null); setPassword(''); setConfirmPassword(''); }}

                                className="text-[11px] text-slate-400 hover:text-slate-300 underline transition duration-150">

                                Back

                            </button>

                            {emailMode === 'signin' && (

                                <button type="button" onClick={handleResetPassword} disabled={emailLoading}

                                    className="text-[11px] text-slate-400 hover:text-slate-300 underline disabled:opacity-50 transition duration-150">

                                    Forgot password?

                                </button>

                            )}

                        </div>

                    </div>

                )}

            </div>

        </div>

    );

};