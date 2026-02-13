'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Link from 'next/link';
import { walletApi, lineAccountsApi } from '@/lib/api';
import { WalletTransaction, LineAccount } from '@/types';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';
import { Search, Clock, CreditCard, CheckCircle2, AlertCircle, Calendar, Zap } from 'lucide-react';

export default function UserHistoryPage() {
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [lineAccounts, setLineAccounts] = useState<LineAccount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'deposit' | 'purchase' | 'bonus' | 'refund'>('all');

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [transRes, accountsRes] = await Promise.all([
                walletApi.getTransactions(),
                lineAccountsApi.getMyAccounts(),
            ]);
            setTransactions(transRes.data.transactions || []);
            setLineAccounts(accountsRes.data.accounts || []);
        } catch (error) {
            console.error('Error fetching history:', error);
            toast.error('ไม่สามารถโหลดประวัติได้');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filteredTransactions = transactions.filter((t) => {
        const matchesSearch =
            t.description.toLowerCase().includes(search.toLowerCase()) ||
            t.type.toLowerCase().includes(search.toLowerCase());

        if (filter === 'all') return matchesSearch;
        return matchesSearch && t.type === filter;
    });

    const getStatusBadge = (status: string) => {
        switch (status.toLowerCase()) {
            case 'completed':
            case 'approved':
            case 'success':
                return <Badge variant="emerald" className="px-2 py-0.5 border-none font-black text-xs uppercase tracking-wider">สำเร็จ</Badge>;
            case 'pending':
                return <Badge variant="warning" className="px-2 py-0.5 border-none font-black text-xs uppercase tracking-wider">รอดำเนินการ</Badge>;
            case 'failed':
            case 'rejected':
                return <Badge variant="rose" className="px-2 py-0.5 border-none font-black text-xs uppercase tracking-wider">ล้มเหลว</Badge>;
            default:
                return <Badge variant="slate" className="px-2 py-0.5 border-none font-black text-xs uppercase tracking-wider">{status}</Badge>;
        }
    };

    const getTransactionIcon = (type: string) => {
        switch (type.toLowerCase()) {
            case 'deposit': return <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500"><CreditCard className="w-5 h-5" /></div>;
            case 'purchase':
            case 'subscription': return <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500"><CheckCircle2 className="w-5 h-5" /></div>;
            case 'bonus': return <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500"><Zap className="w-5 h-5" /></div>;
            default: return <div className="w-10 h-10 rounded-xl bg-slate-500/10 flex items-center justify-center text-slate-400"><Clock className="w-5 h-5" /></div>;
        }
    };

    return (
        <DashboardLayout>
            <div className="section-gap animate-fade pb-10 max-w-7xl mx-auto px-4 sm:px-6">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 sm:mb-8">
                    <div>
                        <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight">
                            ประวัติการ<span className="text-[#06C755]">ทำรายการ</span>
                        </h1>
                        <p className="text-slate-400 mt-1 text-xs sm:text-sm">ตรวจสอบรายการธุรกรรมและการใช้งานแพ็คเกจย้อนหลัง</p>
                    </div>
                    <Button
                        variant="outline"
                        onClick={fetchData}
                        disabled={isLoading}
                        className="rounded-full border-white/10 hover:bg-white/5"
                    >
                        {isLoading ? 'ตัวกำลังโหลด...' : '↺ รีเฟรช'}
                    </Button>
                </div>

                {/* Filters and Search */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
                    <Card variant="glass" className="lg:col-span-2 p-2 rounded-2xl flex items-center gap-2 sm:gap-3 border-white/10">
                        <div className="pl-2 sm:pl-3 opacity-30"><Search className="w-4 h-4 sm:w-5 sm:h-5 text-white" /></div>
                        <input
                            type="text"
                            placeholder="ค้นหารายการ..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="bg-transparent border-none focus:ring-0 w-full text-white placeholder-slate-500 font-semibold text-sm sm:text-base min-h-[44px]"
                        />
                    </Card>
                    <div className="flex gap-1 sm:gap-2 p-1 bg-white/5 rounded-xl sm:rounded-2xl border border-white/10">
                        {(['all', 'deposit', 'purchase'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={cn(
                                    "flex-1 py-2 px-2 rounded-lg sm:rounded-xl text-xs sm:text-xs font-bold transition-all uppercase tracking-wider min-h-[44px]",
                                    filter === f ? "bg-[#06C755] text-white shadow-lg shadow-[#06C755]/20" : "text-slate-400 hover:text-white"
                                )}
                            >
                                {f === 'all' ? 'ทั้งหมด' : f === 'deposit' ? 'เติมเงิน' : 'แพ็คเกจ'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Transaction Table / List */}
                <Card variant="glass" className="overflow-hidden border-white/10" padding="none">
                    {isLoading ? (
                        <div className="py-20 flex flex-col items-center gap-4">
                            <div className="w-10 h-10 border-2 border-[#06C755] border-t-transparent rounded-full animate-spin" />
                            <p className="text-slate-400 font-semibold">กำลังโหลดข้อมูล...</p>
                        </div>
                    ) : filteredTransactions.length === 0 ? (
                        <div className="py-20 flex flex-col items-center gap-4 text-center opacity-40">
                            <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center text-4xl mb-2">📜</div>
                            <p className="text-white font-bold text-lg">ไม่พบข้อมูลประวัติ</p>
                            <p className="text-slate-400 text-sm max-w-xs px-4">คุณยังไม่มีรายการทำธุรกรรมในขณะนี้ หรือลองเปลี่ยนคำค้นหาดูนะครับ</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto -mx-4 sm:mx-0">
                            <table className="w-full text-left min-w-[600px]">
                                <thead>
                                    <tr className="bg-white/5 border-b border-white/10">
                                        <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">วันเวลา</th>
                                        <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">รายการ</th>
                                        <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400 text-center">ประเภท</th>
                                        <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400 text-right">จำนวน</th>
                                        <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400 text-center">สถานะ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    <AnimatePresence>
                                        {filteredTransactions.map((t, idx) => (
                                            <motion.tr
                                                key={t._id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: idx * 0.03 }}
                                                className="hover:bg-white/[0.02] transition-colors group"
                                            >
                                                <td className="px-6 py-6">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-bold text-white flex items-center gap-2">
                                                            <Calendar className="w-3 h-3 text-slate-400" />
                                                            {new Date(t.createdAt).toLocaleDateString('th-TH')}
                                                        </span>
                                                        <span className="text-xs text-slate-400 font-semibold ml-5">
                                                            {new Date(t.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-6 font-semibold">
                                                    <div className="flex items-center gap-4">
                                                        {getTransactionIcon(t.type)}
                                                        <div>
                                                            <p className="text-sm text-white group-hover:text-emerald-400 transition-colors line-clamp-1">{t.description}</p>
                                                            {t.metadata?.packageId && <p className="text-xs text-slate-400 font-mono">ID: {t._id.slice(-8).toUpperCase()}</p>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-6 text-center">
                                                    <span className={cn(
                                                        "text-xs font-black uppercase px-2 py-1 rounded-lg border",
                                                        t.type === 'deposit' ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" :
                                                            (t.type === 'purchase' || t.type === 'subscription') ? "border-blue-500/20 text-blue-400 bg-blue-500/5" :
                                                                "border-slate-500/20 text-slate-400 bg-slate-500/5"
                                                    )}>
                                                        {t.type === 'deposit' ? 'เติมเงิน' : (t.type === 'purchase' || t.type === 'subscription') ? 'ซื้อแพ็คเกจ' : t.type}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-6 text-right">
                                                    <span className={cn(
                                                        "text-sm font-black",
                                                        t.amount > 0 ? "text-emerald-400" : "text-rose-400"
                                                    )}>
                                                        {t.amount > 0 ? `+${t.amount.toLocaleString()}` : t.amount.toLocaleString()}
                                                        <span className="text-xs ml-1 opacity-50 text-white">THB</span>
                                                    </span>
                                                </td>
                                                <td className="px-6 py-6 text-center">
                                                    {getStatusBadge(t.status)}
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </AnimatePresence>
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                {/* Footer Info */}
                <div className="mt-8 flex flex-col md:flex-row items-center justify-between gap-4 p-6 bg-white/[0.02] border border-white/5 rounded-3xl">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400">
                            <AlertCircle className="w-5 h-5" />
                        </div>
                        <p className="text-xs text-slate-400 max-w-md font-medium">
                            ข้อมูลประวัติจะถูกเก็บรักษาไว้อย่างน้อย 12 เดือน หากต้องการข้อมูลย้อนหลังมากกว่านั้นกรุณาติดต่อเจ้าหน้าที่
                        </p>
                    </div>
                    <Link href="/user/chat">
                        <Button variant="ghost" className="text-[#06C755] hover:bg-[#06C755]/10 font-bold px-6 py-2 h-auto text-sm">
                            💬 สอบถามข้อมูลเพิ่มเติม
                        </Button>
                    </Link>
                </div>
            </div>
        </DashboardLayout>
    );
}
