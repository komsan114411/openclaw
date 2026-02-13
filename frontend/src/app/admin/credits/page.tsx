'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { walletApi, usersApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SectionHeader, StatCardMini } from '@/components/ui';
import { PageLoading } from '@/components/ui/Loading';
import { cn } from '@/lib/utils';

interface WalletStatistics {
    totalDeposited: number;
    totalSpent: number;
    totalWallets: number;
    totalBalance: number;
    pendingTransactions: number;
    completedTransactions: number;
}

interface Transaction {
    _id: string;
    type: 'deposit' | 'purchase' | 'bonus' | 'refund' | 'adjustment';
    amount: number;
    balanceAfter: number;
    description: string;
    status: 'pending' | 'completed' | 'rejected' | 'cancelled';
    createdAt: string;
    userId?: { username: string; email: string; fullName?: string };
    processedBy?: { username: string };
}

interface User {
    _id: string;
    username: string;
    email: string;
    fullName?: string;
}

interface UserStatistics {
    currentBalance: number;
    totalDeposited: number;
    totalSpent: number;
    totalBonusReceived: number;
    totalDeducted: number;
    lastTransactions: {
        _id: string;
        type: string;
        amount: number;
        description: string;
        status: string;
        createdAt: string;
    }[];
}

export default function AdminCreditsPage() {
    const [stats, setStats] = useState<WalletStatistics | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<string>('');
    const [creditAmount, setCreditAmount] = useState<string>('');
    const [creditDescription, setCreditDescription] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
    const [filterType, setFilterType] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [processingTxId, setProcessingTxId] = useState<string | null>(null);
    const [userStats, setUserStats] = useState<UserStatistics | null>(null);
    const [isLoadingUserStats, setIsLoadingUserStats] = useState(false);

    const fetchData = async () => {
        try {
            const [statsRes, txRes, usersRes] = await Promise.all([
                walletApi.getStatistics(),
                walletApi.getAllTransactions({ limit: 50, type: filterType || undefined, status: filterStatus || undefined }),
                usersApi.getAll(),
            ]);
            setStats(statsRes.data);
            setTransactions(txRes.data.transactions || []);
            setUsers(usersRes.data.users || []);
        } catch (error) {
            console.error('Error fetching admin data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [filterType, filterStatus]);

    // Fetch user statistics when a user is selected
    useEffect(() => {
        if (selectedUser) {
            setIsLoadingUserStats(true);
            walletApi.getUserStatistics(selectedUser)
                .then((res) => {
                    setUserStats(res.data);
                })
                .catch((error) => {
                    console.error('Error fetching user stats:', error);
                    setUserStats(null);
                })
                .finally(() => {
                    setIsLoadingUserStats(false);
                });
        } else {
            setUserStats(null);
        }
    }, [selectedUser]);

    const handleAddCredits = async () => {
        if (!selectedUser || !creditAmount || !creditDescription) {
            setResult({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
            return;
        }

        const amount = parseFloat(creditAmount);
        if (isNaN(amount) || amount <= 0) {
            setResult({ success: false, message: 'จำนวนเครดิตไม่ถูกต้อง' });
            return;
        }

        setIsProcessing(true);
        setResult(null);

        try {
            const res = await walletApi.addCredits(selectedUser, amount, creditDescription);
            setResult({
                success: res.data.success,
                message: res.data.message || `เพิ่มเครดิต ฿${amount} สำเร็จ`,
            });

            if (res.data.success) {
                setSelectedUser('');
                setCreditAmount('');
                setCreditDescription('');
                fetchData();
            }
        } catch (error: any) {
            setResult({
                success: false,
                message: error.response?.data?.message || 'เกิดข้อผิดพลาด',
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeductCredits = async () => {
        if (!selectedUser || !creditAmount || !creditDescription) {
            setResult({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
            return;
        }

        const amount = parseFloat(creditAmount);
        if (isNaN(amount) || amount <= 0) {
            setResult({ success: false, message: 'จำนวนเครดิตไม่ถูกต้อง' });
            return;
        }

        setIsProcessing(true);
        setResult(null);

        try {
            const res = await walletApi.deductCredits(selectedUser, amount, creditDescription);
            setResult({
                success: res.data.success,
                message: res.data.message,
            });

            if (res.data.success) {
                setSelectedUser('');
                setCreditAmount('');
                setCreditDescription('');
                fetchData();
            }
        } catch (error: any) {
            setResult({
                success: false,
                message: error.response?.data?.message || 'เกิดข้อผิดพลาด',
            });
        } finally {
            setIsProcessing(false);
        }
    };



    const handleApprove = async (txId: string) => {
        setProcessingTxId(txId);
        try {
            const res = await walletApi.approveTransaction(txId);
            if (res.data.success) {
                fetchData();
            } else {
                alert(res.data.message || 'Error');
            }
        } catch (e: any) {
            alert(e.response?.data?.message || 'Error');
        } finally {
            setProcessingTxId(null);
        }
    };

    const handleReject = async (txId: string) => {
        const reason = prompt('Enter rejection reason:');
        if (!reason) return;
        setProcessingTxId(txId);
        try {
            const res = await walletApi.rejectTransaction(txId, reason);
            if (res.data.success) {
                fetchData();
            } else {
                alert(res.data.message || 'Error');
            }
        } catch (e: any) {
            alert(e.response?.data?.message || 'Error');
        } finally {
            setProcessingTxId(null);
        }
    };
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('th-TH', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'deposit': return '💵';
            case 'purchase': return '🛒';
            case 'bonus': return '🎁';
            case 'refund': return '↩️';
            case 'adjustment': return '⚙️';
            default: return '💰';
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed':
                return <Badge variant="success" size="sm">สำเร็จ</Badge>;
            case 'pending':
                return <Badge variant="warning" size="sm">รอ</Badge>;
            case 'rejected':
                return <Badge variant="error" size="sm">ปฏิเสธ</Badge>;
            case 'cancelled':
                return <Badge variant="secondary" size="sm">ยกเลิก</Badge>;
            default:
                return null;
        }
    };

    if (isLoading) {
        return (
            <DashboardLayout>
                <PageLoading message="กำลังโหลดข้อมูลเครดิต..." />
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="section-gap animate-fade pb-10 max-w-7xl mx-auto px-4 sm:px-6">
                {/* PAGE HEADER */}
                <SectionHeader
                    title="จัดการ"
                    highlight="เครดิต"
                    subtitle="สถิติ • เพิ่ม/หักเครดิต • ประวัติธุรกรรมทั้งหมด"
                />

                {/* STATISTICS */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mt-6">
                    <StatCardMini
                        icon="💰"
                        value={`฿${stats?.totalBalance?.toLocaleString() || 0}`}
                        label="ยอดเครดิตรวม"
                        color="emerald"
                    />
                    <StatCardMini
                        icon="💵"
                        value={`฿${stats?.totalDeposited?.toLocaleString() || 0}`}
                        label="เติมสะสมทั้งหมด"
                        color="blue"
                    />
                    <StatCardMini
                        icon="🛒"
                        value={`฿${stats?.totalSpent?.toLocaleString() || 0}`}
                        label="ใช้ไปทั้งหมด"
                        color="amber"
                    />
                    <StatCardMini
                        icon="👥"
                        value={stats?.totalWallets || 0}
                        label="จำนวนกระเป๋า"
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                    {/* ADD/DEDUCT CREDITS */}
                    <Card className="bg-slate-950 border border-white/5" variant="glass">
                        <div className="p-6">
                            <h3 className="text-lg font-bold text-white mb-4">เพิ่ม/หักเครดิต</h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm text-slate-300 block mb-2">เลือกผู้ใช้</label>
                                    <select
                                        value={selectedUser}
                                        onChange={(e) => setSelectedUser(e.target.value)}
                                        className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                                    >
                                        <option value="">-- เลือกผู้ใช้ --</option>
                                        {users.map((user) => (
                                            <option key={user._id} value={user._id}>
                                                {user.username} ({user.email})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* USER STATISTICS BLOCK */}
                                {selectedUser && (
                                    <div className="bg-slate-800/50 rounded-xl border border-white/5 p-4 space-y-3">
                                        {isLoadingUserStats ? (
                                            <div className="flex items-center justify-center py-4">
                                                <div className="animate-spin w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
                                                <span className="ml-2 text-sm text-slate-400">กำลังโหลด...</span>
                                            </div>
                                        ) : userStats ? (
                                            <>
                                                {/* Current Balance */}
                                                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                                    <span className="text-sm text-slate-400">💰 เครดิตปัจจุบัน</span>
                                                    <span className="text-lg font-bold text-emerald-400">฿{userStats.currentBalance.toLocaleString()}</span>
                                                </div>

                                                {/* Statistics Grid */}
                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                    <div className="bg-slate-900/50 rounded-lg p-2">
                                                        <div className="text-slate-400 text-[10px]">💵 เติมสะสม</div>
                                                        <div className="text-blue-400 font-semibold">฿{userStats.totalDeposited.toLocaleString()}</div>
                                                    </div>
                                                    <div className="bg-slate-900/50 rounded-lg p-2">
                                                        <div className="text-slate-400 text-[10px]">🛒 ใช้ไป</div>
                                                        <div className="text-amber-400 font-semibold">฿{userStats.totalSpent.toLocaleString()}</div>
                                                    </div>
                                                    <div className="bg-slate-900/50 rounded-lg p-2">
                                                        <div className="text-slate-400 text-[10px]">🎁 โบนัส</div>
                                                        <div className="text-purple-400 font-semibold">฿{userStats.totalBonusReceived.toLocaleString()}</div>
                                                    </div>
                                                    <div className="bg-slate-900/50 rounded-lg p-2">
                                                        <div className="text-slate-400 text-[10px]">➖ ถูกหัก</div>
                                                        <div className="text-rose-400 font-semibold">฿{userStats.totalDeducted.toLocaleString()}</div>
                                                    </div>
                                                </div>

                                                {/* Balance Preview */}
                                                {creditAmount && parseFloat(creditAmount) > 0 && (
                                                    <div className="mt-2 pt-3 border-t border-white/5 space-y-1">
                                                        <div className="flex justify-between text-xs">
                                                            <span className="text-slate-400">ถ้าเพิ่ม ฿{parseFloat(creditAmount).toLocaleString()}</span>
                                                            <span className="text-emerald-400">→ ฿{(userStats.currentBalance + parseFloat(creditAmount)).toLocaleString()}</span>
                                                        </div>
                                                        <div className="flex justify-between text-xs">
                                                            <span className="text-slate-400">ถ้าหัก ฿{parseFloat(creditAmount).toLocaleString()}</span>
                                                            <span className={cn(
                                                                userStats.currentBalance - parseFloat(creditAmount) >= 0 ? "text-amber-400" : "text-rose-400"
                                                            )}>
                                                                → ฿{(userStats.currentBalance - parseFloat(creditAmount)).toLocaleString()}
                                                                {userStats.currentBalance - parseFloat(creditAmount) < 0 && " ⚠️"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Recent Transactions */}
                                                {userStats.lastTransactions.length > 0 && (
                                                    <div className="mt-2 pt-3 border-t border-white/5">
                                                        <div className="text-xs text-slate-400 mb-2">📋 ธุรกรรมล่าสุด</div>
                                                        <div className="space-y-1 max-h-24 overflow-y-auto">
                                                            {userStats.lastTransactions.slice(0, 3).map((tx) => (
                                                                <div key={tx._id} className="flex justify-between text-xs bg-slate-900/30 rounded px-2 py-1">
                                                                    <span className="text-slate-300 truncate flex-1">{tx.description.slice(0, 20)}</span>
                                                                    <span className={cn(
                                                                        "ml-2 font-medium",
                                                                        tx.amount > 0 ? "text-emerald-400" : "text-rose-400"
                                                                    )}>
                                                                        {tx.amount > 0 ? '+' : ''}฿{tx.amount.toLocaleString()}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="text-center text-sm text-slate-500 py-2">
                                                ไม่พบข้อมูลผู้ใช้
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div>
                                    <label className="text-sm text-slate-300 block mb-2">จำนวนเครดิต (บาท)</label>
                                    <input
                                        type="number"
                                        value={creditAmount}
                                        onChange={(e) => setCreditAmount(e.target.value)}
                                        placeholder="100"
                                        className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                                    />
                                </div>

                                <div>
                                    <label className="text-sm text-slate-300 block mb-2">เหตุผล</label>
                                    <input
                                        type="text"
                                        value={creditDescription}
                                        onChange={(e) => setCreditDescription(e.target.value)}
                                        placeholder="โบนัสโปรโมชั่น"
                                        className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                                    />
                                </div>

                                {result && (
                                    <div className={cn(
                                        "p-3 rounded-xl border text-sm",
                                        result.success
                                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                                            : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                                    )}>
                                        {result.success ? '✅' : '❌'} {result.message}
                                    </div>
                                )}

                                <div className="flex gap-3">
                                    <Button
                                        variant="primary"
                                        className="flex-1 bg-emerald-500 hover:bg-emerald-600"
                                        onClick={handleAddCredits}
                                        disabled={isProcessing}
                                    >
                                        {isProcessing ? '...' : '➕ เพิ่มเครดิต'}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="flex-1 border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                                        onClick={handleDeductCredits}
                                        disabled={isProcessing}
                                    >
                                        {isProcessing ? '...' : '➖ หักเครดิต'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* TRANSACTION HISTORY */}
                    <div className="lg:col-span-2">
                        <Card className="bg-slate-950 border border-white/5" variant="glass">
                            <div className="p-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                                    <h3 className="text-lg font-bold text-white">ประวัติธุรกรรมทั้งหมด</h3>
                                    <div className="flex gap-2">
                                        <select
                                            value={filterType}
                                            onChange={(e) => setFilterType(e.target.value)}
                                            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
                                        >
                                            <option value="">ทุกประเภท</option>
                                            <option value="deposit">เติมเครดิต</option>
                                            <option value="purchase">ซื้อแพ็คเกจ</option>
                                            <option value="bonus">โบนัส</option>
                                            <option value="adjustment">ปรับยอด</option>
                                        </select>
                                        <select
                                            value={filterStatus}
                                            onChange={(e) => setFilterStatus(e.target.value)}
                                            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
                                        >
                                            <option value="">ทุกสถานะ</option>
                                            <option value="completed">สำเร็จ</option>
                                            <option value="pending">รอดำเนินการ</option>
                                            <option value="rejected">ปฏิเสธ</option>
                                        </select>
                                    </div>
                                </div>

                                {transactions.length > 0 ? (
                                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                                        {transactions.map((tx) => (
                                            <div
                                                key={tx._id}
                                                className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-xl border border-white/5"
                                            >
                                                <div className={cn(
                                                    "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                                                    tx.amount > 0 ? "bg-emerald-500/10" : "bg-rose-500/10"
                                                )}>
                                                    <span>{getTypeIcon(tx.type)}</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-semibold text-white truncate">
                                                            {tx.userId?.username || 'Unknown'}
                                                        </p>
                                                        {getStatusBadge(tx.status)}
                                                    </div>
                                                    <p className="text-xs text-slate-300 truncate">{tx.description}</p>
                                                    <p className="text-[10px] text-slate-400">{formatDate(tx.createdAt)}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className={cn(
                                                        "font-bold text-sm",
                                                        tx.amount > 0 ? "text-emerald-400" : "text-rose-400"
                                                    )}>
                                                        {tx.amount > 0 ? '+' : ''}฿{Math.abs(tx.amount).toLocaleString()}
                                                    </p>
                                                    {tx.status === 'pending' && (
                                                        <div className="flex gap-1 ml-2">
                                                            <button onClick={() => handleApprove(tx._id)} disabled={processingTxId === tx._id} className="px-2 py-1 bg-emerald-500 text-white text-xs rounded hover:bg-emerald-600 disabled:opacity-50">{processingTxId === tx._id ? '...' : '✓'}</button>
                                                            <button onClick={() => handleReject(tx._id)} disabled={processingTxId === tx._id} className="px-2 py-1 bg-rose-500 text-white text-xs rounded hover:bg-rose-600 disabled:opacity-50">✕</button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <p className="text-slate-400">ไม่มีรายการธุรกรรม</p>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
