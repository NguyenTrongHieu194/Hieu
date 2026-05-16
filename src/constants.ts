import { Worker, Operation, ProductionOrder, ProductionLog } from './types';
import { subDays, startOfDay, format } from 'date-fns';

export const INITIAL_WORKERS: Worker[] = [
  { id: '1', name: 'Nguyễn Văn A', code: 'CN001', skills: ['Tra khóa', 'Sườn'], line: 'Chuyền 1', performance: 85 },
  { id: '2', name: 'Trần Thị B', code: 'CN002', skills: ['Gấu', 'Nách'], line: 'Chuyền 1', performance: 92 },
  { id: '3', name: 'Lê Văn C', code: 'CN003', skills: ['Cổ', 'Đê'], line: 'Chuyền 2', performance: 78 },
];

export const INITIAL_OPERATIONS: Operation[] = [
  { id: 'op1', name: 'May sườn', code: 'MS01', sam: 1.5, targetPerHour: 40 },
  { id: 'op2', name: 'Tra khóa', code: 'TK01', sam: 2.0, targetPerHour: 30 },
  { id: 'op3', name: 'May gấu', code: 'MG01', sam: 1.0, targetPerHour: 60 },
];

export const INITIAL_ORDERS: ProductionOrder[] = [
  { id: 'ord1', customer: 'Nike Vietnam', styleName: 'Standard T-Shirt', orderQuantity: 5000, producedQuantity: 1200, deadline: '2026-06-01', status: 'in_progress' },
  { id: 'ord2', customer: 'Uniqlo', styleName: 'Summer Dress', orderQuantity: 2000, producedQuantity: 0, deadline: '2026-06-15', status: 'planning' },
];

const today = startOfDay(new Date());

export const INITIAL_LOGS: ProductionLog[] = Array.from({ length: 8 }).map((_, i) => ({
  id: `log-${i}`,
  date: format(today, 'yyyy-MM-dd'),
  hour: 8 + i,
  workerId: '1',
  operationId: 'op1',
  orderId: 'ord1',
  actualQuantity: Math.floor(35 + Math.random() * 10),
  targetQuantity: 40,
}));
