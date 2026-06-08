import Link from "next/link";
import {auth} from "@/lib/better-auth/auth";
import {headers} from "next/headers";
import {redirect} from "next/navigation";

const Layout = async ({children}:{children : React.ReactNode}) => {

    const session = await auth.api.getSession({headers: await headers()});
    if(session?.user) redirect('/')
    return (
        <main className="auth-layout">
            <section className="auth-left-section scrollbar-hide-default">
                <Link href="/" className="auth-logo flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#00f0ff]"
                          style={{ fontVariationSettings: "'FILL' 1" }}>
                        terminal
                    </span>
                    <span className="text-xl font-semibold tracking-tighter text-[#7df4ff]"
                          style={{ fontFamily: 'var(--font-sora)' }}>
                        AeroTrade
                    </span>
                </Link>

                <div className="pb-6 lg:pb-8 flex-1">{children}</div>
            </section>

            <section className="auth-right-section">
                <div className="z-10 relative lg:mt-4 lg:mb-16">
                    <blockquote className="auth-blockquote">
                        AeroTrade turned my watchlist into a winning list. The real-time telemetry is unparalleled, and the precision alerts give me an edge in every trade.
                    </blockquote>
                    <div className="flex items-center justify-between">
                        <div>
                            <cite className="auth-testimonial-author">— XINNAN HUANG</cite>
                            <p className="max-md:text-xs text-[#849495]"
                               style={{ fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.02em' }}>
                                Verified Node 072 · Pro Trader
                            </p>
                        </div>
                        <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <span key={star} className="material-symbols-outlined text-[#00f0ff] text-lg"
                                      style={{ fontVariationSettings: "'FILL' 1" }}>
                                    star
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Decorative elements */}
                <div className="flex-1 relative">
                    <div className="absolute top-0 left-0 w-full h-full opacity-20"
                         style={{
                             background: 'radial-gradient(circle at 30% 50%, rgba(0, 240, 255, 0.15), transparent 70%)',
                         }}>
                    </div>
                    <div className="absolute top-8 left-8 right-8 bottom-8 rounded-2xl overflow-hidden"
                         style={{
                             background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.05), rgba(112, 0, 255, 0.05))',
                             border: '1px solid rgba(125, 244, 255, 0.1)',
                             backdropFilter: 'blur(8px)',
                         }}>
                        {/* Terminal-like decorative content */}
                        <div className="p-6 space-y-3 opacity-40">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-3 h-3 rounded-full bg-[#ffb4ab]"></div>
                                <div className="w-3 h-3 rounded-full bg-[#00f0ff]"></div>
                                <div className="w-3 h-3 rounded-full bg-[#7df4ff]"></div>
                            </div>
                            <p style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '11px', color: '#7df4ff' }}>
                                &gt; SYSTEM.INIT: AeroTrade Terminal v2.44
                            </p>
                            <p style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '11px', color: '#849495' }}>
                                &gt; Connecting to market nodes...
                            </p>
                            <p style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '11px', color: '#00dbe9' }}>
                                &gt; 47 nodes online · Latency: 0.8ms
                            </p>
                            <p style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '11px', color: '#849495' }}>
                                &gt; Portfolio sync: COMPLETE
                            </p>
                            <p style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '11px', color: '#d1bcff' }}>
                                &gt; AI Assistant: READY
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    )
}

export default Layout
