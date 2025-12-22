'use client';

import { useState, useCallback } from 'react';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

interface ConfirmState extends ConfirmOptions {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'ยืนยัน',
    cancelText: 'ยกเลิก',
    type: 'info',
    onConfirm: () => {},
    onCancel: () => {},
    isLoading: false,
  });

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        ...options,
        isOpen: true,
        isLoading: false,
        onConfirm: () => {
          setState((prev) => ({ ...prev, isOpen: false }));
          resolve(true);
        },
        onCancel: () => {
          setState((prev) => ({ ...prev, isOpen: false }));
          resolve(false);
        },
      });
    });
  }, []);

  const confirmAsync = useCallback(
    async (options: ConfirmOptions, asyncFn: () => Promise<void>): Promise<boolean> => {
      return new Promise((resolve) => {
        setState({
          ...options,
          isOpen: true,
          isLoading: false,
          onConfirm: async () => {
            setState((prev) => ({ ...prev, isLoading: true }));
            try {
              await asyncFn();
              setState((prev) => ({ ...prev, isOpen: false, isLoading: false }));
              resolve(true);
            } catch (error) {
              setState((prev) => ({ ...prev, isLoading: false }));
              resolve(false);
            }
          },
          onCancel: () => {
            setState((prev) => ({ ...prev, isOpen: false }));
            resolve(false);
          },
        });
      });
    },
    []
  );

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return {
    ...state,
    confirm,
    confirmAsync,
    close,
  };
}

// Preset confirm dialogs
export function useDeleteConfirm() {
  const { confirm, confirmAsync, ...state } = useConfirm();

  const confirmDelete = useCallback(
    (itemName: string = 'รายการนี้') => {
      return confirm({
        title: 'ยืนยันการลบ',
        message: `คุณต้องการลบ${itemName}หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้`,
        confirmText: 'ลบ',
        cancelText: 'ยกเลิก',
        type: 'danger',
      });
    },
    [confirm]
  );

  const confirmDeleteAsync = useCallback(
    (itemName: string = 'รายการนี้', asyncFn: () => Promise<void>) => {
      return confirmAsync(
        {
          title: 'ยืนยันการลบ',
          message: `คุณต้องการลบ${itemName}หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้`,
          confirmText: 'ลบ',
          cancelText: 'ยกเลิก',
          type: 'danger',
        },
        asyncFn
      );
    },
    [confirmAsync]
  );

  return {
    ...state,
    confirmDelete,
    confirmDeleteAsync,
  };
}

export function usePaymentConfirm() {
  const { confirm, confirmAsync, ...state } = useConfirm();

  const confirmPayment = useCallback(
    (amount: number, packageName: string) => {
      return confirm({
        title: 'ยืนยันการชำระเงิน',
        message: `คุณต้องการซื้อแพ็คเกจ "${packageName}" ในราคา ${amount.toLocaleString()} บาท หรือไม่?`,
        confirmText: 'ยืนยันการซื้อ',
        cancelText: 'ยกเลิก',
        type: 'warning',
      });
    },
    [confirm]
  );

  const confirmPaymentAsync = useCallback(
    (amount: number, packageName: string, asyncFn: () => Promise<void>) => {
      return confirmAsync(
        {
          title: 'ยืนยันการชำระเงิน',
          message: `คุณต้องการซื้อแพ็คเกจ "${packageName}" ในราคา ${amount.toLocaleString()} บาท หรือไม่?`,
          confirmText: 'ยืนยันการซื้อ',
          cancelText: 'ยกเลิก',
          type: 'warning',
        },
        asyncFn
      );
    },
    [confirmAsync]
  );

  return {
    ...state,
    confirmPayment,
    confirmPaymentAsync,
  };
}

export default useConfirm;
