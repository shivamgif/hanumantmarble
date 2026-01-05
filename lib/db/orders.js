// Mock database for orders - Replace with real database in production
// In production, use MongoDB with Mongoose or PostgreSQL with Prisma

let orders = [];
let orderIdCounter = 1000;

export const ordersDB = {
  // Create a new order
  create: async (orderData) => {
    const order = {
      id: `ORD-${orderIdCounter++}`,
      ...orderData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    orders.push(order);
    return order;
  },

  // Get order by ID
  getById: async (orderId) => {
    return orders.find(order => order.id === orderId);
  },

  // Get all orders for a user
  getByUserId: async (userId) => {
    return orders
      .filter(order => order.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  // Get all orders for a user by email
  getByUserEmail: async (email) => {
    return orders
      .filter(order => order.userEmail === email)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  // Update order status
  updateStatus: async (orderId, status) => {
    const orderIndex = orders.findIndex(order => order.id === orderId);
    if (orderIndex === -1) return null;
    
    orders[orderIndex] = {
      ...orders[orderIndex],
      status,
      updatedAt: new Date().toISOString(),
    };
    return orders[orderIndex];
  },

  // Update order
  update: async (orderId, updates) => {
    const orderIndex = orders.findIndex(order => order.id === orderId);
    if (orderIndex === -1) return null;
    
    orders[orderIndex] = {
      ...orders[orderIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    return orders[orderIndex];
  },

  // Get all orders (admin)
  getAll: async (filters = {}) => {
    let filteredOrders = [...orders];
    
    if (filters.status) {
      filteredOrders = filteredOrders.filter(order => order.status === filters.status);
    }
    
    if (filters.startDate) {
      filteredOrders = filteredOrders.filter(
        order => new Date(order.createdAt) >= new Date(filters.startDate)
      );
    }
    
    if (filters.endDate) {
      filteredOrders = filteredOrders.filter(
        order => new Date(order.createdAt) <= new Date(filters.endDate)
      );
    }
    
    return filteredOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  // Delete order (admin)
  delete: async (orderId) => {
    const initialLength = orders.length;
    orders = orders.filter(order => order.id !== orderId);
    return initialLength > orders.length;
  },
};
