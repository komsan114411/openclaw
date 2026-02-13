'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Zap,
  ShieldCheck,
  BarChart3,
  ChevronRight,
  LayoutDashboard,
  Users,
  MessageSquare,
  ArrowRight,
  Menu,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { useSiteBranding } from '@/hooks/useSiteBranding';

export default function LandingPage() {
  const router = useRouter();
  const { user, isLoading, isInitialized, checkAuth } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const authCheckRef = useRef(false);
  const siteBranding = useSiteBranding();
  const brandName = siteBranding.siteName || 'dooslip.com';

  // Handle hydration
  useEffect(() => {
    setMounted(true);

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Check auth only once on mount
  useEffect(() => {
    if (!mounted) return;

    if (!authCheckRef.current && !isInitialized) {
      authCheckRef.current = true;
      checkAuth();
    }
  }, [mounted, isInitialized, checkAuth]);

  // If user is already logged in, show "Go to Dashboard" or redirect
  // For landing page experience, we'll keep them here but update the buttons

  if (!mounted || (!isInitialized && isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0F0D]">
        <div className="relative flex flex-col items-center">
          <div className="h-16 w-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
          <p className="mt-4 text-slate-400 text-sm animate-pulse">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  const navLinks = [
    { name: 'หน้าหลัก', href: '#home' },
    { name: 'บริการของเรา', href: '#features' },
    { name: 'ทำไมต้องเลือกเรา', href: '#why-us' },
    { name: 'ติดต่อเรา', href: '#contact' },
  ];

  const features = [
    {
      title: 'API ตรวจสอบสลิป',
      description: 'ระบบตรวจสอบสลิปอัตโนมัติ แม่นยำ 100% รองรับทุกธนาคารชั้นนำในไทย',
      icon: <CheckCircle2 className="w-6 h-6 text-emerald-400" />,
      color: 'emerald',
      image: '/assets/slip_verification_illustration_1767975409375.png'
    },
    {
      title: 'USDT (Crypto) Payment',
      description: 'รองรับการเติมเงินผ่าน USDT (TRC20/ERC20) สะดวก รวดเร็ว และเป็นสากล',
      icon: <Zap className="w-6 h-6 text-cyan-400" />,
      color: 'cyan',
      image: '/assets/usdt_crypto_payment_illustration_1767975454809.png'
    },
    {
      title: 'Real-time Dashboard',
      description: 'ติดตามข้อมูลการทำธุรกรรมและสถิติต่างๆ ได้แบบเรียลไทม์ผ่านแดชบอร์ดที่สวยงาม',
      icon: <BarChart3 className="w-6 h-6 text-emerald-400" />,
      color: 'emerald',
      image: '/assets/hero-mockup.png'
    }
  ];

  const stats = [
    { label: 'สลิปที่ตรวจสอบแล้ว', value: '1.2M+' },
    { label: 'ยอดผู้ใช้งาน', value: '15,000+' },
    { label: 'เชื่อมต่อ API แล้ว', value: '450+' },
    { label: 'ความเร็วเฉลี่ย', value: '< 1s' },
  ];

  return (
    <div className="min-h-screen bg-[#0A0F0D] text-slate-100 overflow-x-hidden selection:bg-emerald-500/30">
      {/* Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[20%] right-[-5%] w-[30%] h-[30%] bg-cyan-500/10 blur-[100px] rounded-full" />
        <div className="absolute top-[40%] right-[10%] w-[20%] h-[20%] bg-emerald-500/5 blur-[80px] rounded-full" />
      </div>

      {/* Navbar */}
      <nav
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-4 md:px-8",
          isScrolled
            ? "py-3 bg-[#0A0F0D]/80 backdrop-blur-xl border-b border-emerald-500/10 shadow-lg shadow-black/20"
            : "py-6 bg-transparent"
        )}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            {siteBranding.siteLogoBase64 ? (
              <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform">
                <img src={siteBranding.siteLogoBase64} alt="Logo" className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6 text-white fill-white/20" />
              </div>
            )}
            <span className="text-xl font-black tracking-tighter bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              {siteBranding.siteName ? siteBranding.siteName : (<>dooslip<span className="text-emerald-500">.com</span></>)}
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <div className="flex items-center gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className="text-sm font-medium text-slate-400 hover:text-emerald-400 transition-colors"
                >
                  {link.name}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-3 ml-4">
              {user ? (
                <Button
                  onClick={() => router.push(user.role === 'admin' ? '/admin/dashboard' : '/user/dashboard')}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-6 font-bold flex gap-2"
                >
                  เข้าสู่ระบบจัดการ <LayoutDashboard className="w-4 h-4" />
                </Button>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="text-sm font-bold text-white px-4 py-2 hover:text-emerald-400 transition-colors"
                  >
                    เข้าสู่ระบบ
                  </Link>
                  <Button
                    onClick={() => router.push('/register')}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-6 font-bold shadow-lg shadow-emerald-500/20"
                  >
                    สมัครสมาชิกฟรี
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden p-2 text-slate-400 hover:text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-x-0 top-[72px] z-40 bg-[#0A0F0D]/95 backdrop-blur-2xl border-b border-emerald-500/10 p-6 md:hidden"
          >
            <div className="flex flex-col gap-4">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-lg font-medium text-slate-300 hover:text-emerald-400"
                >
                  {link.name}
                </Link>
              ))}
              <div className="pt-4 border-t border-white/5 flex flex-col gap-3">
                {user ? (
                  <Button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      router.push(user.role === 'admin' ? '/admin/dashboard' : '/user/dashboard');
                    }}
                    className="w-full bg-emerald-500 text-white rounded-xl py-6"
                  >
                    เข้าสู่ระบบจัดการ
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        router.push('/login');
                      }}
                      className="w-full text-white py-6"
                    >
                      เข้าสู่ระบบ
                    </Button>
                    <Button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        router.push('/register');
                      }}
                      className="w-full bg-emerald-500 text-white rounded-xl py-6"
                    >
                      สมัครสมาชิกฟรี
                    </Button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main>
        {/* Hero Section */}
        <section id="home" className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-4">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold mb-6 tracking-wider uppercase">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                เชื่อมต่อ API ง่ายๆ ภายใน 5 นาที • รองรับ USDT
              </div>

              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-[1.1] tracking-tight mb-8">
                ตรวจสอบสลิปอัตโนมัติ <br /> <span className="text-emerald-500">{brandName}</span> รวดเร็ว แม่นยำ
              </h1>

              <p className="text-lg md:text-xl text-slate-400 leading-relaxed max-w-xl mb-10">
                ระบบตรวจสอบสลิปธนาคารที่แม่นยำที่สุด รองรับการเชื่อมต่อกับ LINE OA และ API พร้อมระบบเติมเงินผ่าน USDT (TRC20/ERC20) เพื่อความสะดวกสูงสุด
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  onClick={() => router.push('/register')}
                  className="h-14 px-8 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-lg shadow-xl shadow-emerald-500/20 flex gap-2 transition-all transform hover:scale-105 active:scale-95"
                >
                  เริ่มใช้งานฟรีวันนี้ <ArrowRight className="w-5 h-5" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => document.getElementById('features')?.scrollIntoView()}
                  className="h-14 px-8 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold text-lg backdrop-blur-sm"
                >
                  ดูฟีเจอร์ทั้งหมด
                </Button>
              </div>

              <div className="mt-12 flex items-center gap-4 text-sm text-slate-500">
                <div className="flex -space-x-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-[#0A0F0D] bg-slate-800" />
                  ))}
                  <div className="w-8 h-8 rounded-full border-2 border-[#0A0F0D] bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-white">
                    +2k
                  </div>
                </div>
                <span>ได้รับความไว้วางใจจากธุรกิจกว่า 2,000 แห่ง</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.8, rotateY: -10 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative lg:ml-10"
            >
              <div className="relative z-10 w-full aspect-[4/3] rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl shadow-emerald-500/10 transform hover:scale-[1.02] transition-transform duration-700">
                <Image
                  src="/assets/hero-mockup.png"
                  alt="Platform Mockup"
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 to-transparent pointer-events-none" />
              </div>

              {/* Floating elements */}
              <motion.div
                animate={{ y: [0, -15, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -top-6 -right-6 z-20 bg-[#16211C]/90 backdrop-blur-xl border border-emerald-500/20 p-4 rounded-2xl shadow-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">สลิปถูกต้อง</div>
                    <div className="text-sm font-bold">12,450.00 THB</div>
                  </div>
                </div>
              </motion.div>

              <motion.div
                animate={{ y: [0, 15, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -bottom-10 -left-6 z-20 bg-[#16211C]/90 backdrop-blur-xl border border-cyan-500/20 p-4 rounded-2xl shadow-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
                    <Zap className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">ความเร็วในการจัดการ</div>
                    <div className="text-sm font-bold">0.4 วินาที</div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 px-4 relative">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />

          <div className="max-w-7xl mx-auto text-center mb-16 relative z-10">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-accent-foreground text-sm font-bold tracking-widest uppercase mb-4"
            >
              บริการระดับพรีเมียม
            </motion.h2>
            <motion.h3
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-5xl font-black mb-6"
            >
              ฟีเจอร์เด่นที่ตอบโจทย์ <span className="text-emerald-500">ทุกธุรกิจ</span>
            </motion.h3>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-slate-400 max-w-2xl mx-auto italic"
            >
              เราพัฒนาเทคโนโลยีที่ล้ำหน้าเพื่อให้ธรุกิจของคุณทำงานได้รวดเร็วและปลอดภัยยิ่งขึ้น
            </motion.p>
          </div>

          <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-8 relative z-10">
            {[
              {
                title: 'ความปลอดภัยสูงสุด',
                description: 'ปกป้องข้อมูลธุรกรรมของคุณด้วยมาตรฐานความปลอดภัยระดับสากล',
                image: '/assets/security_shield_3d_icon_1768071893253.png',
                delay: 0
              },
              {
                title: 'ประมวลผลรวดเร็ว',
                description: 'ระบบทำงานด้วยความเร็วสูง รองรับ Transaction มหาศาลในเสี้ยววินาที',
                image: '/assets/fast_speed_rocket_3d_icon_1768071908245.png',
                delay: 0.1
              },
              {
                title: 'วิเคราะห์ข้อมูลเชิงลึก',
                description: 'ติดตามสถิติและรายงานผลประกอบการแบบ Real-time ผ่าน Dashboard',
                image: '/assets/hero-mockup.png', // Fallback for analytics icon
                delay: 0.2
              }
            ].map((feature, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: feature.delay }}
                className="group relative h-full bg-[#111A15]/80 backdrop-blur-sm border border-white/5 rounded-[2rem] p-8 hover:bg-[#16211C] hover:border-emerald-500/20 transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-500/10"
              >
                <div className="relative w-full h-48 mb-6 rounded-2xl overflow-hidden border border-white/5 bg-gradient-to-br from-white/5 to-transparent">
                  <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 4 + idx, repeat: Infinity, ease: "easeInOut" }}
                    className="w-full h-full relative"
                  >
                    <Image
                      src={feature.image}
                      alt={feature.title}
                      fill
                      className="object-contain p-4 group-hover:scale-110 transition-transform duration-500 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                    />
                  </motion.div>
                </div>

                <h4 className="text-xl font-bold mb-4 group-hover:text-emerald-400 transition-colors">{feature.title}</h4>
                <p className="text-slate-500 text-sm leading-relaxed mb-6">
                  {feature.description}
                </p>
                <div className="pt-6 border-t border-white/5 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                  <Link href="/register" className="text-sm font-bold text-emerald-500 flex items-center gap-1 hover:gap-2 transition-all">
                    เริ่มต้นใช้งาน <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
        {/* Supported Banks Section */}
        <section className="py-24 px-4 relative overflow-hidden bg-white/[0.01]">
          <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-12">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="lg:w-1/2"
            >
              <h3 className="text-4xl md:text-5xl font-black mb-6 leading-tight text-white">
                รองรับทุกธนาคาร <br /> <span className="text-emerald-500">ชั้นนำในไทย</span>
              </h3>
              <p className="text-slate-400 text-lg mb-8 leading-relaxed">
                ไม่ว่าลูกค้าของคุณจะเป็นผู้ใช้ธนาคารไหน ระบบ {brandName} ของเราพร้อมตรวจสอบความถูกต้องได้ทันที แม่นยำ 100% พร้อมเชื่อมต่อ API ได้ง่ายๆ
              </p>
              <div className="flex flex-wrap gap-4">
                {['KBANK', 'SCB', 'BBL', 'KTB', 'BAY', 'GSB'].map(bank => (
                  <div key={bank} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-black text-slate-500 tracking-wider">
                    {bank}
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="lg:w-1/2 relative"
            >
              <div className="relative aspect-square rounded-[3rem] overflow-hidden border border-white/10 shadow-2xl shadow-emerald-500/10">
                <Image
                  src="/assets/thai_bank_logos_grid_1767975432323.png"
                  alt="ธนาคารที่รองรับ"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="absolute -top-6 -right-6 w-32 h-32 bg-emerald-500/20 blur-[60px] rounded-full" />
              <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-cyan-500/20 blur-[60px] rounded-full" />
            </motion.div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-20 bg-emerald-500/5 border-y border-emerald-500/10">
          <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
            {stats.map((stat, idx) => (
              <div key={idx} className="text-center group">
                <div className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-2 group-hover:text-emerald-500 transition-colors break-words">
                  {stat.value}
                </div>
                <div className="text-[10px] sm:text-xs md:text-sm font-bold text-slate-500 uppercase tracking-widest px-2">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Why Us Section */}
        <section id="why-us" className="py-24 px-4 overflow-hidden">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4 pt-12">
                  <div className="aspect-square rounded-3xl bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center p-8">
                    <ShieldCheck className="w-full h-full text-emerald-500 opacity-40" />
                  </div>
                  <div className="aspect-video rounded-3xl bg-slate-800/20 border border-white/5" />
                </div>
                <div className="space-y-4">
                  <div className="aspect-video rounded-3xl bg-slate-800/20 border border-white/5" />
                  <div className="aspect-square rounded-3xl bg-cyan-500/10 border border-cyan-500/10 flex items-center justify-center p-8">
                    <Zap className="w-full h-full text-cyan-500 opacity-40" />
                  </div>
                </div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-48 h-48 bg-emerald-500/20 blur-[60px] rounded-full animate-pulse" />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-emerald-500 font-bold mb-4 uppercase tracking-widest text-sm">SECURITY & PERFORMANCE</h2>
              <h3 className="text-4xl font-black mb-8 leading-tight">สร้างมาตรฐานการเงินใหม่ที่ <span className="text-white">มั่นคง</span> และ <span className="text-emerald-500">รวดเร็ว</span></h3>

              <div className="space-y-6">
                {[
                  { title: 'ระบบรักษาความปลอดภัย 2 ชั้น', desc: 'ข้อมูลสลิปและธุรกรรมของลูกค้าจะถูกเก็บอย่างปลอดภัยที่สุด' },
                  { title: 'ประมวลผลด้วย AI อัจฉริยะ', desc: 'ตรวจจับสลิปปลอมและสลิปซ้ำซ้อนได้อย่างแม่นยำ' },
                  { title: 'รองรับการขยายตัวแบบไร้ขีดจำกัด', desc: 'ไม่ว่าธุรกิจจะเล็กหรือใหญ่ ระบบของเราพร้อมรองรับปริมาณงานมหาศาล' },
                ].map((item, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div>
                      <h4 className="font-bold text-lg mb-1">{item.title}</h4>
                      <p className="text-slate-500 text-sm">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-10">
                <Button
                  onClick={() => router.push('/register')}
                  variant="ghost"
                  className="text-emerald-500 hover:bg-emerald-500/10 p-0 font-bold flex gap-2 group"
                >
                  เรียนรู้เพิ่มเติมเกี่ยวกับความปลอดภัย <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
            </motion.div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="max-w-5xl mx-auto rounded-[3rem] bg-gradient-to-br from-emerald-600 to-teal-800 p-12 md:p-20 text-center relative overflow-hidden shadow-2xl shadow-emerald-500/20"
          >
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-white/10 blur-[100px] rounded-full" />

            <div className="relative z-10">
              <h3 className="text-4xl md:text-5xl font-black text-white mb-8">
                พร้อมที่จะอัปเกรด <br className="md:hidden" /> ธุรกิจของคุณแล้วหรือยัง?
              </h3>
              <p className="text-emerald-50/70 text-lg mb-10 max-w-2xl mx-auto">
                สมัครสมาชิกวันนี้ รับสิทธิ์ทดลองใช้งานฟรี 20 สลิปแรก โดยไม่ต้องผูกบัตรเครดิต
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  onClick={() => router.push('/register')}
                  className="h-16 px-10 rounded-2xl bg-white text-emerald-700 hover:bg-emerald-50 font-black text-lg shadow-xl shadow-black/10 transition-transform hover:scale-105 active:scale-95"
                >
                  สมัครสมาชิกฟรีตอนนี้
                </Button>
                <Button
                  onClick={() => router.push('/login')}
                  className="h-16 px-10 rounded-2xl bg-black/20 text-white hover:bg-black/30 font-black text-lg border border-white/20 backdrop-blur-md"
                >
                  เข้าสู่ระบบจัดการ
                </Button>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <footer id="contact" className="pt-20 pb-10 px-4 border-t border-white/5 bg-[#080C0B]">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 sm:gap-10 md:gap-12 mb-16">
          <div className="col-span-1 sm:col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-6">
              {siteBranding.siteLogoBase64 ? (
                <div className="w-8 h-8 rounded-lg overflow-hidden">
                  <img src={siteBranding.siteLogoBase64} alt="Logo" className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
              )}
              <span className="text-lg font-black tracking-tighter">
                {siteBranding.siteName ? siteBranding.siteName : (<>dooslip<span className="text-emerald-500">.com</span></>)}
              </span>
            </Link>
            <p className="text-slate-500 text-sm leading-relaxed mb-6">
              {brandName} คือผู้นำด้านระบบตรวจสอบสลิปอัตโนมัติ รองรับการชำระเงินผ่านธนาคารไทยและ USDT เพื่อประสิทธิภาพสูงสุดในธุรกิจของคุณ
            </p>
          </div>

          <div>
            <h5 className="font-bold mb-6">ลิงก์ที่เป็นประโยชน์</h5>
            <ul className="space-y-4 text-sm text-slate-500">
              <li><Link href="#" className="hover:text-emerald-400">วิธีเชิ่อมต่อ API</Link></li>
              <li><Link href="#" className="hover:text-emerald-400">คำถามที่พบบ่อย</Link></li>
              <li><Link href="#" className="hover:text-emerald-400">สถานะเซิร์ฟเวอร์</Link></li>
              <li><Link href="#" className="hover:text-emerald-400">บล็อก/บทความ</Link></li>
            </ul>
          </div>

          <div>
            <h5 className="font-bold mb-6">นโยบายของเรา</h5>
            <ul className="space-y-4 text-sm text-slate-500">
              <li><Link href="#" className="hover:text-emerald-400">ข้อตกลงการใช้งาน</Link></li>
              <li><Link href="#" className="hover:text-emerald-400">นโยบายความเป็นส่วนตัว</Link></li>
              <li><Link href="#" className="hover:text-emerald-400">นโยบายการคืนเงิน</Link></li>
              <li><Link href="#" className="hover:text-emerald-400">นโยบายความยุติธรรม</Link></li>
            </ul>
          </div>

          <div>
            <h5 className="font-bold mb-6">ช่องทางการติดต่อ</h5>
            <ul className="space-y-4 text-sm font-medium">
              <li className="flex gap-2"><span>Email:</span> <span className="text-slate-300">support@dooslip.com</span></li>
              <li className="flex gap-2"><span>LINE:</span> <span className="text-slate-300">@dooslip</span></li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-600 font-medium">
          <p>© 2026 {brandName}. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="#" className="hover:text-emerald-500">Facebook</Link>
            <Link href="#" className="hover:text-emerald-500">Twitter</Link>
            <Link href="#" className="hover:text-emerald-500">Telegram</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
