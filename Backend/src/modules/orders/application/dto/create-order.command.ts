export interface CreateOrderItemInput {
  productId: string;
  quantity: number;
}

export interface CreateOrderCommand {
  businessId: string;
  conversationId: string;
  items: CreateOrderItemInput[];
}
