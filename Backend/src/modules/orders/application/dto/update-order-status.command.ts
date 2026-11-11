export interface UpdateOrderStatusCommand {
  orderId: string;
  businessId: string;
  action: 'CONFIRM' | 'CANCEL';
}
