'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { slipApi, lineAccountsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { StatCard, EmptyState } from '@/components/ui/Card';
import { PageLoading } from '@/components/ui/Loading';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CustomerSummary {
  lineUserId: string;
  totalCount: number;
  totalAmount: number;
  lastSenderName: string;
  lastSenderBank: string;
  senderAccount: string;
  firstDeposit: string;
  lastDeposit: string;
  lineDisplayName: string;
}

interface SlipDetail {
  transRef: string;
  amount: number;
  senderName: string;
  senderBank: string;
  receiverName: string;
  receiverBank: string;
  createdAt: string;
}

interface LineAccount {
  _id: string;
  accountName: string;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' });
  } catch {
    return '-';
  }
}

function formatDateTime(iso: string): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' }) +
      ' ' +
      d.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
}

function formatAmount(n: number): string {
  return `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DepositReportsPage() {
  // Filter state
  const [lineAccounts, setLineAccounts] = useState<LineAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  // Data state
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [grandTotalAmount, setGrandTotalAmount] = useState(0);
  const [grandTotalCount, setGrandTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<CustomerSummary | null>(null);
  const [detailSlips, setDetailSlips] = useState<SlipDetail[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailTotalAmount, setDetailTotalAmount] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);

  // Fetch LINE accounts on mount
  useEffect(() => {
    lineAccountsApi.getAll().then((res) => {
      const accounts = res.data?.accounts || res.data || [];
      setLineAccounts(accounts);
    }).catch(() => {
      // Silently fail — filter will just not show accounts
    });
  }, []);

  // Fetch deposits
  const fetchDeposits = useCallback(async (p: number) => {
    setIsLoading(true);
    setHasSearched(true);
    try {
      const res = await slipApi.getCustomerDeposits({
        lineAccountId: selectedAccount || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page: p,
        limit,
        search: search || undefined,
      });
      const data = res.data;
      setCustomers(data.customers || []);
      setTotal(data.total || 0);
      setGrandTotalAmount(data.grandTotalAmount || 0);
      setGrandTotalCount(data.grandTotalCount || 0);
      setPage(p);
    } catch {
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  }, [selectedAccount, startDate, endDate, search]);

  const handleSearch = () => {
    fetchDeposits(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  // Detail modal
  const openDetail = async (customer: CustomerSummary) => {
    setDetailCustomer(customer);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await slipApi.getCustomerSlipHistory(customer.lineUserId, {
        lineAccountId: selectedAccount || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      const data = res.data;
      setDetailSlips(data.slips || []);
      setDetailTotal(data.total || 0);
      setDetailTotalAmount(data.totalAmount || 0);
    } catch {
      toast.error('ไม่สามารถโหลดรายละเอียดได้');
    } finally {
      setDetailLoading(false);
    }
  };

  // Export CSV
  const exportCSV = () => {
    if (customers.length === 0) {
      toast.error('ไม่มีข้อมูลให้ export');
      return;
    }

    const headers = ['#', 'ชื่อลูกค้า', 'LINE Display Name', 'ธนาคาร', 'เลขบัญชี/เบอร์', 'จำนวนครั้ง', 'ยอดรวม', 'วันที่แรก', 'วันที่ล่าสุด'];
    const rows = customers.map((c, i) => [
      i + 1 + (page - 1) * limit,
      c.lastSenderName,
      c.lineDisplayName,
      c.lastSenderBank,
      c.senderAccount,
      c.totalCount,
      c.totalAmount,
      formatDate(c.firstDeposit),
      formatDate(c.lastDeposit),
    ]);

    // Add BOM for Thai character support in Excel
    const bom = '\uFEFF';
    const csv = bom + [headers.join(','), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deposit-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export CSV สำเร็จ');
  };

  const totalPages = Math.ceil(total / limit);
  const uniqueCustomers = total;
  const avgPerCustomer = uniqueCustomers > 0 ? grandTotalAmount / uniqueCustomers : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              สรุปยอดฝากลูกค้า
            </h1>
            <p className="text-sm text-slate-400 mt-1">ดูข้อมูลสรุปการฝากจากสลิปที่ตรวจสอบสำเร็จ</p>
          </div>
          {hasSearched && customers.length > 0 && (
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-sm font-medium transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            {/* LINE Account Filter */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">บัญชี LINE</label>
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
              >
                <option value="">ทั้งหมด</option>
                {lineAccounts.map((acc) => (
                  <option key={acc._id} value={acc._id}>{acc.accountName}</option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">วันที่เริ่มต้น</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors [color-scheme:dark]"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">วันที่สิ้นสุด</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors [color-scheme:dark]"
              />
            </div>

            {/* Search */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">ค้นหาชื่อ</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="ค้นหาชื่อลูกค้า..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
            </div>

            {/* Search Button */}
            <div className="flex items-end">
              <button
                onClick={handleSearch}
                disabled={isLoading}
                className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                )}
                คำนวณ
              </button>
            </div>
          </div>
        </div>

        {/* Loading */}
        {isLoading && <PageLoading />}

        {/* Results */}
        {!isLoading && hasSearched && (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard
                title="จำนวนลูกค้า"
                value={uniqueCustomers.toLocaleString()}
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                }
                color="blue"
              />
              <StatCard
                title="จำนวนสลิป"
                value={grandTotalCount.toLocaleString()}
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
                color="amber"
              />
              <StatCard
                title="ยอดฝากรวม"
                value={formatAmount(grandTotalAmount)}
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                color="emerald"
              />
              <StatCard
                title="เฉลี่ย/คน"
                value={formatAmount(avgPerCustomer)}
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                }
                color="violet"
              />
            </div>

            {/* Table */}
            {customers.length === 0 ? (
              <EmptyState
                icon={
                  <svg className="w-12 h-12 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
                title="ไม่พบข้อมูล"
                description="ไม่พบสลิปที่ตรงตามเงื่อนไข ลองเปลี่ยนตัวกรองแล้วกดคำนวณใหม่"
              />
            ) : (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">#</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">ชื่อลูกค้า</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider hidden lg:table-cell">LINE Name</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">ธนาคาร</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider hidden md:table-cell">เลขบัญชี/เบอร์</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">จำนวน</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">ยอดรวม</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider hidden xl:table-cell">แรก</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider hidden xl:table-cell">ล่าสุด</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {customers.map((c, i) => (
                        <tr
                          key={c.lineUserId}
                          onClick={() => openDetail(c)}
                          className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3 text-slate-500 font-mono text-xs">{i + 1 + (page - 1) * limit}</td>
                          <td className="px-4 py-3">
                            <span className="text-white font-medium">{c.lastSenderName || '-'}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-400 hidden lg:table-cell">{c.lineDisplayName || '-'}</td>
                          <td className="px-4 py-3 text-slate-300">{c.lastSenderBank || '-'}</td>
                          <td className="px-4 py-3 text-slate-400 font-mono text-xs hidden md:table-cell">{c.senderAccount || '-'}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full text-xs font-bold">
                              {c.totalCount}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-emerald-400 font-bold">{formatAmount(c.totalAmount)}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs hidden xl:table-cell">{formatDate(c.firstDeposit)}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs hidden xl:table-cell">{formatDate(c.lastDeposit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
                    <p className="text-xs text-slate-500">
                      แสดง {(page - 1) * limit + 1}-{Math.min(page * limit, total)} จาก {total} รายการ
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => fetchDeposits(page - 1)}
                        disabled={page <= 1}
                        className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        &laquo; ก่อนหน้า
                      </button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                        let p: number;
                        if (totalPages <= 5) {
                          p = idx + 1;
                        } else if (page <= 3) {
                          p = idx + 1;
                        } else if (page >= totalPages - 2) {
                          p = totalPages - 4 + idx;
                        } else {
                          p = page - 2 + idx;
                        }
                        return (
                          <button
                            key={p}
                            onClick={() => fetchDeposits(p)}
                            className={`w-8 h-8 text-xs rounded-lg transition-all ${
                              p === page
                                ? 'bg-emerald-600 text-white font-bold'
                                : 'bg-white/5 text-slate-400 hover:bg-white/10'
                            }`}
                          >
                            {p}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => fetchDeposits(page + 1)}
                        disabled={page >= totalPages}
                        className="px-3 py-1.5 text-xs rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        ถัดไป &raquo;
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Empty state before first search */}
        {!isLoading && !hasSearched && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg className="w-16 h-16 text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h3 className="text-lg font-bold text-slate-300 mb-2">เลือกเงื่อนไขแล้วกด &quot;คำนวณ&quot;</h3>
            <p className="text-sm text-slate-500 max-w-md">
              เลือกบัญชี LINE, ช่วงวันที่ หรือค้นหาชื่อลูกค้า จากนั้นกดปุ่ม &quot;คำนวณ&quot; เพื่อดูรายงาน
            </p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDetailOpen(false)} />

          {/* Modal */}
          <div className="relative bg-[#0F1412] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
              <div>
                <h3 className="text-lg font-bold text-white">
                  สลิปทั้งหมดของ: {detailCustomer?.lastSenderName || '-'}
                </h3>
                {detailCustomer?.lineDisplayName && (
                  <p className="text-xs text-slate-400 mt-0.5">LINE: {detailCustomer.lineDisplayName}</p>
                )}
              </div>
              <button
                onClick={() => setDetailOpen(false)}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {detailLoading ? (
                <div className="flex justify-center py-12">
                  <svg className="w-8 h-8 animate-spin text-emerald-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : detailSlips.length === 0 ? (
                <p className="text-center text-slate-500 py-8">ไม่พบรายการสลิป</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left px-3 py-2 text-xs font-bold text-slate-400">วันที่</th>
                      <th className="text-right px-3 py-2 text-xs font-bold text-slate-400">จำนวนเงิน</th>
                      <th className="text-left px-3 py-2 text-xs font-bold text-slate-400 hidden sm:table-cell">ธนาคาร</th>
                      <th className="text-left px-3 py-2 text-xs font-bold text-slate-400 hidden md:table-cell">TransRef</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {detailSlips.map((s, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-2.5 text-slate-300 text-xs">{formatDateTime(s.createdAt)}</td>
                        <td className="px-3 py-2.5 text-right text-emerald-400 font-bold">{formatAmount(s.amount)}</td>
                        <td className="px-3 py-2.5 text-slate-400 hidden sm:table-cell">{s.senderBank || '-'}</td>
                        <td className="px-3 py-2.5 text-slate-500 font-mono text-xs hidden md:table-cell">{s.transRef || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/[0.06] bg-white/[0.02]">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">
                  รวมทั้งหมด: <span className="text-white font-bold">{detailTotal}</span> รายการ
                </span>
                <span className="text-sm font-bold text-emerald-400">{formatAmount(detailTotalAmount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
