"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, Activity, Settings, Layout, Play } from "lucide-react";

const navItems = [
    { icon: Home, label: "Home", href: "/" },
    { icon: Layout, label: "Plan", href: "/plan" },

    { icon: null, label: "Record", href: "/record" }, // Placeholder for FAB
    { icon: Activity, label: "Activities", href: "/activities" },
    { icon: Settings, label: "Settings", href: "/settings" },
];

export default function BottomNav() {
    const pathname = usePathname();

    return (
        <nav className="fixed bottom-0 left-0 right-0 nav-blur border-t border-white/5 pb-8 pb-safe pt-2 px-6 flex justify-between items-center z-50">
            {navItems.map((item) => {
                const isActive = pathname === item.href;

                // Special rendering for the "Record" FAB
                if (item.label === "Record") {
                    return (
                        <div key={item.href} className="relative -top-6">
                            <Link
                                href={item.href}
                                className="w-14 h-14 rounded-full bg-gradient-to-br from-[#00c3ff] to-[#0088ff] flex items-center justify-center shadow-[0_0_20px_rgba(0,195,255,0.4)] hover:scale-105 active:scale-95 transition-all border-4 border-[#0A0A0A]"
                            >
                                <Play className="w-6 h-6 text-black fill-black ml-1" />
                            </Link>
                        </div>
                    );
                }

                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`flex flex-col items-center p-2 transition-colors ${isActive ? "text-primary" : "text-white/40"
                            }`}
                    >
                        {item.icon && <item.icon className={`w-6 h-6 ${isActive ? "drop-shadow-[0_0_5px_#00e5ff]" : ""}`} />}
                        <span className="text-[10px] mt-1 font-medium">{item.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
