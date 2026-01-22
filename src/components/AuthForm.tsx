"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { LogIn, Mail, Lock, Zap, UserPlus } from "lucide-react";

export default function AuthForm() {
    const [mode, setMode] = useState<"login" | "signup">("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage("");

        if (mode === "signup" && password !== confirmPassword) {
            setMessage("Passwords do not match!");
            return;
        }

        setLoading(true);

        try {
            if (mode === "login") {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            } else {
                const { error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
                setMessage("Success! Check your email for a confirmation link.");
            }
        } catch (error: any) {
            setMessage(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-transparent">
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-full max-w-sm space-y-8 text-center"
            >
                <div className="flex flex-col items-center space-y-2">
                    <motion.div
                        layoutId="logo-glow"
                        className="bg-primary/20 p-4 rounded-2xl neo-blue-glow mb-2"
                    >
                        <Zap className="w-12 h-12 text-primary" />
                    </motion.div>
                    <h1 className="text-4xl font-black tracking-tight text-white italic">
                        AERO<span className="text-primary not-italic">RUN</span>
                    </h1>
                    <p className="text-white/60 text-sm">
                        {mode === "login" ? "Your journey to elite performance starts here." : "Join the elite running community today."}
                    </p>
                </div>

                <div className="glass p-8 space-y-6 relative overflow-hidden">
                    {/* Mode Toggle */}
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 mb-2">
                        <button
                            onClick={() => setMode("login")}
                            className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${mode === "login" ? "bg-primary text-black" : "text-white/40 hover:text-white"}`}
                        >
                            Log In
                        </button>
                        <button
                            onClick={() => setMode("signup")}
                            className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${mode === "signup" ? "bg-primary text-black" : "text-white/40 hover:text-white"}`}
                        >
                            Sign Up
                        </button>
                    </div>

                    <form onSubmit={handleAuth} className="space-y-4 text-left">
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase font-black tracking-[0.2em] text-white/20 ml-1">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                                <input
                                    type="email"
                                    required
                                    placeholder="runner@example.com"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-primary transition-colors text-sm"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] uppercase font-black tracking-[0.2em] text-white/20 ml-1">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                                <input
                                    type="password"
                                    required
                                    placeholder="••••••••"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-primary transition-colors text-sm"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        <AnimatePresence mode="popLayout">
                            {mode === "signup" && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0, y: -10 }}
                                    animate={{ opacity: 1, height: "auto", y: 0 }}
                                    exit={{ opacity: 0, height: 0, y: -10 }}
                                    className="space-y-2 overflow-hidden"
                                >
                                    <label className="text-[10px] uppercase font-black tracking-[0.2em] text-white/20 ml-1">Confirm Password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                                        <input
                                            type="password"
                                            required
                                            placeholder="••••••••"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-primary transition-colors text-sm"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full font-black py-4 rounded-xl flex items-center justify-center space-x-2 transition-all mt-4 border-2 shadow-lg ${mode === "login"
                                ? "bg-primary text-black border-primary neo-blue-glow shadow-[0_0_20px_rgba(0,229,255,0.3)] active:scale-95"
                                : "bg-white/5 text-white border-white/10 hover:bg-white/10 active:scale-95"}`}
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <>
                                    {mode === "login" ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                                    <span className="uppercase tracking-widest text-xs italic">{mode === "login" ? "LOG IN" : "CREATE ACCOUNT"}</span>
                                </>
                            )}
                        </button>
                    </form>

                    <AnimatePresence>
                        {message && (
                            <motion.p
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`text-center text-xs font-bold py-3 px-4 rounded-lg bg-white/5 border ${message.includes("Success") ? "text-primary border-primary/20" : "text-red-400 border-red-400/20"}`}
                            >
                                {message}
                            </motion.p>
                        )}
                    </AnimatePresence>
                </div>

                <div className="flex flex-col items-center space-y-4">
                    <p className="text-white/20 text-[10px] uppercase font-bold tracking-widest">
                        By continuing, you agree to our Terms of Service
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
