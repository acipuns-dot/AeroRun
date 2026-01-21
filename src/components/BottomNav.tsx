"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, Activity, Settings, Layout } from "lucide-react";

const navItems = [
    { icon: Home, label: "Home", href: "/" },
    { icon: Layout, label: "Plan", href: "/plan" },
    { icon: Activity, label: "Activities", href: "/activities" },
    { icon: Settings, label: "Settings", href: "/settings" },
];

export default function BottomNav() {
    const pathname = usePathname();

    return (
        <nav className="fixed bottom-0 left-0 right-0 nav-blur border-t border-white/5 pb-8 pb-safe pt-2 px-6 flex justify-between items-center z-50">
            {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`flex flex-col items-center p-2 transition-colors ${isActive ? "text-primary" : "text-white/40"
                            }`}
                    >
                        <item.icon className={`w-6 h-6 ${isActive ? "drop-shadow-[0_0_5px_#00e5ff]" : ""}`} />
                        <span className="text-[10px] mt-1 font-medium">{item.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
