"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { LogIn, Mail, Lock, Zap } from "lucide-react";

export default function AuthForm() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMessage(error.message);
        setLoading(false);
    };

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) setMessage("Check your email for the confirmation link!");
        else setMessage("Account created!");
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-transparent">
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-full max-w-sm space-y-8 text-center"
            >
                <div className="flex flex-col items-center space-y-2">
                    <div className="bg-primary/20 p-4 rounded-2xl neo-blue-glow">
                        <Zap className="w-12 h-12 text-primary" />
                    </div>
                    <h1 className="text-4xl font-black tracking-tight text-white italic">AERO<span className="text-primary not-italic">RUN</span></h1>
                    <p className="text-white/60">Your journey to elite performance starts here.</p>
                </div>

                <form className="space-y-4 text-left">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white/40 ml-1">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                            <input
                                type="email"
                                placeholder="runner@example.com"
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-primary transition-colors"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white/40 ml-1">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                            <input
                                type="password"
                                placeholder="••••••••"
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-primary transition-colors"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleLogin}
                        disabled={loading}
                        className="w-full bg-primary text-black font-bold py-4 rounded-xl flex items-center justify-center space-x-2 neo-blue-glow active:scale-95 transition-all mt-4"
                    >
                        {loading ? "Processing..." : "Log In"}
                    </button>

                    <button
                        onClick={handleSignUp}
                        className="w-full bg-transparent text-white/60 hover:text-white font-medium py-2 transition-colors text-sm"
                    >
                        Don't have an account? Sign Up
                    </button>

                    {message && (
                        <p className="text-center text-sm text-primary py-2 bg-primary/10 rounded-lg animate-pulse">
                            {message}
                        </p>
                    )}
                </form>
            </motion.div>
        </div>
    );
}
