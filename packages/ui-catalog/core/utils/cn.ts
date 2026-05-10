import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Tailwind CSS クラス名を結合するユーティリティ関数
 * clsx で条件付きクラスを処理し、tailwind-merge で重複を解決
 *
 * @example
 * cn('px-4 py-2', isActive && 'bg-blue-500', { 'text-white': isActive })
 * cn('text-fluid-sm', className) // 外部から渡されたクラスで上書き可能
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
