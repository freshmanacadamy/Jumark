const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
require('dotenv').config();

// 🛡️ GLOBAL ERROR HANDLER - ADD THIS AT TOP
process.on('unhandledRejection', (error) => {
  console.error('🔴 Unhandled Promise Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('🔴 Uncaught Exception:', error);
});

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID; // @jumarket
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [];

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

app.get('/', (req, res) => {
  res.send('🤖 Jimma University Marketplace Bot is alive!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

console.log('✅ JU Marketplace Bot started!');

// ========== DATABASE (In-Memory) ========== //
const users = new Map();
const products = new Map();
const userStates = new Map();
let productIdCounter = 1;

// Categories for Jimma University
const CATEGORIES = [
  '📚 Academic Books',
  '💻 Electronics', 
  '👕 Clothes & Fashion',
  '🏠 Furniture & Home',
  '📝 Study Materials',
  '🎮 Entertainment',
  '🍔 Food & Drinks',
  '🚗 Transportation',
  '🎒 Accessories',
  '❓ Others'
];

// ========== MAIN MENU ========== //
const showMainMenu = (chatId) => {
  const options = {
    reply_markup: {
      keyboard: [
        [{ text: '🛍️ Browse Products' }, { text: '➕ Sell Item' }],
        [{ text: '📋 My Products' }, { text: '📞 Contact Admin' }],
        [{ text: 'ℹ️ Help' }]
      ],
      resize_keyboard: true
    }
  };
  
  bot.sendMessage(chatId, 
    `🏪 *Jimma University Marketplace*\n\n` +
    `Welcome to JU Student Marketplace! 🎓\n\n` +
    `Choose an option below:`,
    { parse_mode: 'Markdown', ...options }
  );
};

// ========== START COMMAND ========== //
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username;
  
  // Register user
  if (!users.has(userId)) {
    users.set(userId, {
      telegramId: userId,
      username: msg.from.username || '',  // ✅ FIX: Get directly from message
      firstName: msg.from.first_name,
      joinedAt: new Date(),
      department: '',
      year: ''
    });
  }
  
  await bot.sendMessage(chatId, 
    `🎓 *Welcome to Jimma University Marketplace!*\n\n` +
    `🏪 *Buy & Sell* within JU Community\n` +
    `📚 Books, Electronics, Clothes & more\n` +
    `🔒 Safe campus transactions\n` +
    `📢 All products posted in @jumarket\n\n` +
    `Start by browsing items or selling yours!`,
    { parse_mode: 'Markdown' }
  );
  
  showMainMenu(chatId);
});

// ========== BROWSE PRODUCTS ========== //
bot.onText(/\/browse|🛍️ Browse Products/, async (msg) => {
  const chatId = msg.chat.id;
  
  const approvedProducts = Array.from(products.values())
    .filter(product => product.status === 'approved')
    .slice(0, 10); // Show latest 10
  
  if (approvedProducts.length === 0) {
    await bot.sendMessage(chatId,
      `🛍️ *Browse Products*\n\n` +
      `No products available yet.\n\n` +
      `Be the first to list an item! 💫\n` +
      `Use "➕ Sell Item" to get started.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  await bot.sendMessage(chatId,
    `🛍️ *Available Products (${approvedProducts.length})*\n\n` +
    `Latest items from JU students:`,
    { parse_mode: 'Markdown' }
  );
  
  // Send each product
  for (const product of approvedProducts) {
    const seller = users.get(product.sellerId);
    
    const browseKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🛒 Buy Now', callback_data: `buy_${product.id}` },
            { text: '📞 Contact Seller', callback_data: `contact_${product.id}` }
          ],
          [
            { text: '👀 View Details', callback_data: `details_${product.id}` }
          ]
        ]
      }
    };
    
    try {
      await bot.sendPhoto(chatId, product.images[0], {
        caption: `🏷️ *${product.title}*\n\n` +
                 `💰 *Price:* ${product.price} ETB\n` +
                 `📦 *Category:* ${product.category}\n` +
                 `👤 *Seller:* ${seller?.firstName || 'JU Student'}\n` +
                 `${product.description ? `📝 *Description:* ${product.description}\n` : ''}` +
                 `\n📍 *Campus Meetup*`,
        parse_mode: 'Markdown',
        reply_markup: browseKeyboard.reply_markup
      });
    } catch (error) {
      // Fallback to text if image fails
      await bot.sendMessage(chatId,
        `🏷️ *${product.title}*\n\n` +
        `💰 *Price:* ${product.price} ETB\n` +
        `📦 *Category:* ${product.category}\n` +
        `👤 *Seller:* ${seller?.firstName || 'JU Student'}\n` +
        `${product.description ? `📝 *Description:* ${product.description}\n` : ''}`,
        { parse_mode: 'Markdown', reply_markup: browseKeyboard.reply_markup }
      );
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }
});

// ========== SELL ITEM ========== //
bot.onText(/\/sell|➕ Sell Item/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  userStates.set(userId, {
    state: 'awaiting_product_images',
    productData: {}
  });
  
  await bot.sendMessage(chatId,
    `🛍️ *Sell Your Item - Step 1/5*\n\n` +
    `📸 *Send Product Photos*\n\n` +
    `Please send 1-5 photos of your item.\n` +
    `You can send multiple images at once.`,
    { parse_mode: 'Markdown' }
  );
});

// Handle product photo uploads
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userState = userStates.get(userId);
  
  if (userState && userState.state === 'awaiting_product_images') {
    const photo = msg.photo[msg.photo.length - 1];
    
    if (!userState.productData.images) {
      userState.productData.images = [];
    }
    
    userState.productData.images.push(photo.file_id);
    userStates.set(userId, userState);
    
    // If first image, ask for more or continue
    if (userState.productData.images.length === 1) {
      await bot.sendMessage(chatId,
        `✅ *First photo received!*\n\n` +
        `You can send more photos (max 5) or type 'next' to continue.`,
        { parse_mode: 'Markdown' }
      );
    } else if (userState.productData.images.length >= 5) {
      userState.state = 'awaiting_product_title';
      userStates.set(userId, userState);
      
      await bot.sendMessage(chatId,
        `📸 *Photos uploaded (${userState.productData.images.length})*\n\n` +
        `🏷️ *Step 2/5 - Product Title*\n\n` +
        `Enter a clear title for your item:\n\n` +
        `Examples:\n` +
        `• "Calculus Textbook 3rd Edition"\n` +
        `• "iPhone 12 - 128GB - Like New"\n` +
        `• "Engineering Calculator FX-991ES"`,
        { parse_mode: 'Markdown' }
      );
    }
  }
});

// Handle text messages for product creation
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  const userState = userStates.get(userId);
  
  if (!text || text.startsWith('/')) return;
  
  if (userState) {
    try {
      switch (userState.state) {
        case 'awaiting_product_images':
          if (text.toLowerCase() === 'next' && userState.productData.images && userState.productData.images.length > 0) {
            userState.state = 'awaiting_product_title';
            userStates.set(userId, userState);
            
            await bot.sendMessage(chatId,
              `🏷️ *Step 2/5 - Product Title*\n\n` +
              `Enter a clear title for your item:`,
              { parse_mode: 'Markdown' }
            );
          }
          break;
          
        case 'awaiting_product_title':
          userState.productData.title = text;
          userState.state = 'awaiting_product_price';
          userStates.set(userId, userState);
          
          await bot.sendMessage(chatId,
            `💰 *Step 3/5 - Product Price*\n\n` +
            `Enter the price in ETB:\n\n` +
            `Example: 1500`,
            { parse_mode: 'Markdown' }
          );
          break;
          
        case 'awaiting_product_price':
          if (!isNaN(text) && parseInt(text) > 0) {
            userState.productData.price = parseInt(text);
            userState.state = 'awaiting_product_description';
            userStates.set(userId, userState);
            
            await bot.sendMessage(chatId,
              `📝 *Step 4/5 - Product Description*\n\n` +
              `Add a description (optional):\n\n` +
              `• Condition (New/Used)\n` +
              `• Features\n` +
              `• Reason for selling\n\n` +
              `Type /skip to skip description`,
              { parse_mode: 'Markdown' }
            );
          } else {
            await bot.sendMessage(chatId, '❌ Please enter a valid price (numbers only).');
          }
          break;
          
        case 'awaiting_product_description':
          if (text === '/skip') {
            userState.productData.description = '';
            await selectProductCategory(chatId, userId, userState);
          } else {
            userState.productData.description = text;
            await selectProductCategory(chatId, userId, userState);
          }
          break;
      }
    } catch (error) {
      console.error('Product creation error:', error);
      await bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
    }
  }
});

// Category selection
async function selectProductCategory(chatId, userId, userState) {
  const categoryKeyboard = {
    reply_markup: {
      inline_keyboard: [
        ...CATEGORIES.map(category => [
          { text: category, callback_data: `category_${category}` }
        ]),
        [
          { text: '🚫 Cancel', callback_data: 'cancel_product' }
        ]
      ]
    }
  };
  
  userState.state = 'awaiting_product_category';
  userStates.set(userId, userState);
  
  await bot.sendMessage(chatId,
    `📂 *Step 5/5 - Select Category*\n\n` +
    `Choose the category that best fits your item:`,
    { parse_mode: 'Markdown', ...categoryKeyboard }
  );
}

// ========== MY PRODUCTS ========== //
bot.onText(/\/myproducts|📋 My Products/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  const userProducts = Array.from(products.values())
    .filter(product => product.sellerId === userId);
  
  if (userProducts.length === 0) {
    await bot.sendMessage(chatId,
      `📋 *My Products*\n\n` +
      `You haven't listed any products yet.\n\n` +
      `Start selling with "➕ Sell Item"! 💫`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  let message = `📋 *Your Products (${userProducts.length})*\n\n`;
  
  userProducts.forEach((product, index) => {
    const statusIcon = 
      product.status === 'approved' ? '✅' :
      product.status === 'pending' ? '⏳' :
      product.status === 'sold' ? '💰' : '❌';
    
    message += `${index + 1}. ${statusIcon} *${product.title}*\n`;
    message += `   💰 ${product.price} ETB | ${product.category}\n`;
    message += `   🏷️ ${product.status.charAt(0).toUpperCase() + product.status.slice(1)}\n\n`;
  });
  
  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// ========== CALLBACK QUERIES ========== //
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;
  
  try {
    // ✅ FIXED: Define userId and chatId properly
    const chatId = message.chat.id;
    
    // Product category selection
    if (data.startsWith('category_')) {
      const category = data.replace('category_', '');
      const userState = userStates.get(userId);
      
      if (userState && userState.state === 'awaiting_product_category') {
        await completeProductCreation(chatId, userId, userState, category, callbackQuery.id);
      }
      return;
    }
    
    // Buy product
    if (data.startsWith('buy_')) {
      const productId = parseInt(data.replace('buy_', ''));
      await handleBuyProduct(chatId, userId, productId, callbackQuery.id);
      return;
    }
    
    // Contact seller
    if (data.startsWith('contact_')) {
      const productId = parseInt(data.replace('contact_', ''));
      await handleContactSeller(chatId, userId, productId, callbackQuery.id);
      return;
    }
    
    // View details
    if (data.startsWith('details_')) {
      const productId = parseInt(data.replace('details_', ''));
      await handleViewDetails(chatId, productId, callbackQuery.id);
      return;
    }
    
    // Cancel product creation
    if (data === 'cancel_product') {
      userStates.delete(userId);
      await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Product creation cancelled' });
      await bot.sendMessage(chatId, 'Product creation cancelled.');
      return;
    }
    
  } catch (error) {
    console.error('Callback error:', error);
    await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Error processing request' });
  }
});

// Complete product creation
async function completeProductCreation(chatId, userId, userState, category, callbackQueryId) {
  const user = users.get(userId);
  
  // Create product
  const product = {
    id: productIdCounter++,
    sellerId: userId,
    sellerUsername: user.username || '',  // ✅ FIX: Handle undefined
    title: userState.productData.title,
    description: userState.productData.description || '',
    price: userState.productData.price,
    category: category,
    images: userState.productData.images,
    status: 'pending', // Needs admin approval
    createdAt: new Date(),
    approvedBy: null
  };
  
  products.set(product.id, product);
  userStates.delete(userId);
  
  // Notify admins
  await notifyAdminsAboutNewProduct(product);
  
  await bot.answerCallbackQuery(callbackQueryId, { 
    text: '✅ Product submitted for admin approval!' 
  });
  
  await bot.sendMessage(chatId,
    `✅ *Product Submitted Successfully!*\n\n` +
    `🏷️ *${product.title}*\n` +
    `💰 ${product.price} ETB | ${product.category}\n\n` +
    `⏳ *Status:* Waiting for admin approval\n\n` +
    `Your product will appear in @jumarket after approval.`,
    { parse_mode: 'Markdown' }
  );
  
  showMainMenu(chatId);
}

// ✅ FIXED: Handle buy product with proper validation
async function handleBuyProduct(chatId, userId, productId, callbackQueryId) {
  try {
    const product = products.get(productId);
    
    // ✅ ADD VALIDATION
    if (!product) {
      await bot.answerCallbackQuery(callbackQueryId, { text: '❌ Product not found' });
      return;
    }
    
    if (product.status !== 'approved') {
      await bot.answerCallbackQuery(callbackQueryId, { text: '❌ Product not available' });
      return;
    }
    
    const buyer = users.get(userId);
    const seller = users.get(product.sellerId); // ✅ NOW SAFE
    
    if (!seller) {
      await bot.answerCallbackQuery(callbackQueryId, { text: '❌ Seller not found' });
      return;
    }

    // Notify buyer
    await bot.sendMessage(chatId,
      `🛒 *Purchase Request Sent!*\n\n` +
      `🏷️ *Product:* ${product.title}\n` +
      `💰 *Price:* ${product.price} ETB\n` +
      `👤 *Seller:* ${seller.firstName}\n\n` +
      `I've notified the seller about your interest!\n\n` +
      `💬 *Contact Seller:* @${seller.username || 'JU Student'}\n` +
      `📍 *Meetup:* Arrange campus location\n` +
      `💵 *Payment:* Cash recommended\n\n` +
      `The seller will contact you shortly!`,
      { parse_mode: 'Markdown' }
    );
    
    // Notify seller
    if (seller.telegramId) {
      await bot.sendMessage(seller.telegramId,
        `🎉 *NEW BUYER INTERESTED!*\n\n` +
        `🏷️ *Your Product:* ${product.title}\n` +
        `💰 *Price:* ${product.price} ETB\n` +
        `👤 *Buyer:* ${buyer.firstName} @${buyer.username}\n\n` +
        `💬 *Contact Buyer:* @${buyer.username}\n\n` +
        `Please arrange:\n` +
        `• Campus meetup location\n` +
        `• Payment method\n` +
        `• Product handover\n\n` +
        `Happy selling! 🎓`,
        { parse_mode: 'Markdown' }
      );
    }
    
    await bot.answerCallbackQuery(callbackQueryId, { 
      text: '✅ Seller notified! Check your messages.' 
    });
    
  } catch (error) {
    console.error('Buy product error:', error);
    await bot.answerCallbackQuery(callbackQueryId, { 
      text: '❌ Error processing purchase' 
    });
  }
}

// Handle contact seller
async function handleContactSeller(chatId, userId, productId, callbackQueryId) {
  const product = products.get(productId);
  const seller = users.get(product.sellerId);
  
  if (!product || product.status !== 'approved') {
    await bot.answerCallbackQuery(callbackQueryId, { text: '❌ Product not available' });
    return;
  }
  
  await bot.sendMessage(chatId,
    `📞 *Seller Contact Information*\n\n` +
    `👤 *Seller:* ${seller.firstName}\n` +
    `🏷️ *Product:* ${product.title}\n` +
    `💰 *Price:* ${product.price} ETB\n\n` +
    `💬 *Direct Message:* @${seller.username || 'JU Student'}\n\n` +
    `Send them a message to inquire about the product!\n\n` +
    `📍 *Campus meetup recommended*`,
    { parse_mode: 'Markdown' }
  );
  
  await bot.answerCallbackQuery(callbackQueryId, { 
    text: '✅ Contact info sent' 
  });
}

// Handle view details
async function handleViewDetails(chatId, productId, callbackQueryId) {
  const product = products.get(productId);
  
  if (!product) {
    await bot.answerCallbackQuery(callbackQueryId, { text: '❌ Product not found' });
    return;
  }
  
  const seller = users.get(product.sellerId);
  
  await bot.sendMessage(chatId,
    `🔍 *Product Details*\n\n` +
    `🏷️ *Title:* ${product.title}\n` +
    `💰 *Price:* ${product.price} ETB\n` +
    `📂 *Category:* ${product.category}\n` +
    `👤 *Seller:* ${seller.firstName}\n` +
    `📅 *Posted:* ${product.createdAt.toLocaleDateString()}\n\n` +
    `${product.description ? `📝 *Description:*\n${product.description}\n\n` : ''}` +
    `📍 *Campus transaction recommended*`,
    { parse_mode: 'Markdown' }
  );
  
  await bot.answerCallbackQuery(callbackQueryId, { 
    text: '📦 Product details sent' 
  });
}

// ========== ADMIN APPROVAL SYSTEM ========== //

// ========== ENHANCED ADMIN NOTIFICATION & MESSAGING SYSTEM ========== //

// Function to notify admins about new products
async function notifyAdminsAboutNewProduct(product) {
  const seller = users.get(product.sellerId);
  let notifiedCount = 0;

  for (const adminId of ADMIN_IDS) {
    try {
      const approveKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Approve', callback_data: `approve_${product.id}` },
              { text: '❌ Reject', callback_data: `reject_${product.id}` }
            ],
            [
              { text: '👀 View Details', callback_data: `admindetails_${product.id}` },
              { text: '📨 Message Seller', callback_data: `message_seller_${product.sellerId}` }
            ]
          ]
        }
      };

      // Try to send with image first
      try {
        await bot.sendPhoto(adminId, product.images[0], {
          caption: `🆕 *NEW PRODUCT FOR APPROVAL*\n\n` +
                   `🏷️ *Title:* ${product.title}\n` +
                   `💰 *Price:* ${product.price} ETB\n` +
                   `📂 *Category:* ${product.category}\n` +
                   `👤 *Seller:* ${seller?.firstName || 'Student'}\n` +
                   `📞 *Contact:* @${seller?.username || 'No username'}\n` +
                   `${product.description ? `📝 *Description:* ${product.description}\n` : ''}` +
                   `⏰ *Submitted:* ${product.createdAt.toLocaleString()}\n\n` +
                   `*Quick Actions Below ↓*`,
          parse_mode: 'Markdown',
          reply_markup: approveKeyboard.reply_markup
        });
      } catch (photoError) {
        // Fallback to text message
        await bot.sendMessage(adminId,
          `🆕 *NEW PRODUCT FOR APPROVAL*\n\n` +
          `🏷️ *Title:* ${product.title}\n` +
          `💰 *Price:* ${product.price} ETB\n` +
          `📂 *Category:* ${product.category}\n` +
          `👤 *Seller:* ${seller?.firstName || 'Student'}\n` +
          `📞 *Contact:* @${seller?.username || 'No username'}\n` +
          `${product.description ? `📝 *Description:* ${product.description}\n` : ''}` +
          `⏰ *Submitted:* ${product.createdAt.toLocaleString()}\n\n` +
          `*Click buttons to approve/reject:*`,
          { parse_mode: 'Markdown', ...approveKeyboard }
        );
      }
      
      notifiedCount++;
      console.log(`✅ Notification sent to admin: ${adminId}`);

    } catch (error) {
      console.error(`❌ Failed to notify admin ${adminId}:`, error.message);
    }

    // Small delay between notifications
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  return notifiedCount;
}

// ========== ADMIN MESSAGING SYSTEM ========== //

// Admin: Message individual user
bot.onText(/\/messageuser/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!ADMIN_IDS.includes(userId)) return;
  
  userStates.set(userId, { state: 'awaiting_user_id_for_message' });
  
  await bot.sendMessage(chatId,
    `📨 *Message Individual User*\n\n` +
    `Please send the User ID you want to message.\n\n` +
    `You can get User IDs from:\n` +
    `• /users command\n` +
    `• Product approval notifications\n\n` +
    `Type /cancel to cancel.`,
    { parse_mode: 'Markdown' }
  );
});

// Admin: Broadcast to all users
bot.onText(/\/broadcast/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!ADMIN_IDS.includes(userId)) return;
  
  userStates.set(userId, { state: 'awaiting_broadcast_message' });
  
  await bot.sendMessage(chatId,
    `📢 *Broadcast to All Users*\n\n` +
    `Send the message you want to broadcast to *ALL* users (${users.size} people).\n\n` +
    `You can use:\n` +
    `• Text and emojis\n` +
    `• Markdown formatting\n` +
    `• Important announcements\n\n` +
    `Type /cancel to cancel.`,
    { parse_mode: 'Markdown' }
  );
});

// ========== ENHANCED ADMIN PANEL ========== //

bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!ADMIN_IDS.includes(userId)) {
    await bot.sendMessage(chatId,
      '❌ *Access Denied*\n\nYou are not authorized to use admin commands.',
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  // Get pending products count
  const pendingCount = Array.from(products.values())
    .filter(p => p.status === 'pending').length;
  
  const adminKeyboard = {
    reply_markup: {
      keyboard: [
        [{ text: `⏳ Pending (${pendingCount})` }, { text: '📊 Stats' }],
        [{ text: '📨 Message User' }, { text: '📢 Broadcast' }],
        [{ text: '👥 Users' }, { text: '🛍️ All Products' }],
        [{ text: '🏪 Main Menu' }]
      ],
      resize_keyboard: true
    }
  };
  
  await bot.sendMessage(chatId,
    `⚡ *JU Marketplace Admin Panel*\n\n` +
    `*Quick Stats:*\n` +
    `• 👥 Users: ${users.size}\n` +
    `• 🛍️ Products: ${products.size}\n` +
    `• ⏳ Pending: ${pendingCount}\n\n` +
    `Choose an option below:`,
    { parse_mode: 'Markdown', ...adminKeyboard }
  );
});

// ========== ENHANCED PENDING APPROVALS ========== //

bot.onText(/\/pending/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!ADMIN_IDS.includes(userId)) return;
  
  const pendingProducts = Array.from(products.values())
    .filter(product => product.status === 'pending')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  if (pendingProducts.length === 0) {
    await bot.sendMessage(chatId,
      '✅ *All Caught Up!*\n\nNo products pending approval. Great job! 🎉',
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  await bot.sendMessage(chatId,
    `⏳ *Pending Approvals (${pendingProducts.length})*\n\n` +
    `Products waiting for your review:`,
    { parse_mode: 'Markdown' }
  );
  
  for (const product of pendingProducts) {
    const seller = users.get(product.sellerId);
    const timeAgo = getTimeAgo(product.createdAt);
    
    const approveKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: `approve_${product.id}` },
            { text: '❌ Reject', callback_data: `reject_${product.id}` }
          ],
          [
            { text: '📨 Message Seller', callback_data: `message_seller_${product.sellerId}` },
            { text: '👀 Details', callback_data: `admindetails_${product.id}` }
          ]
        ]
      }
    };
    
    try {
      await bot.sendPhoto(chatId, product.images[0], {
        caption: `⏳ *Pending Approval* (${timeAgo})\n\n` +
                 `🏷️ *Title:* ${product.title}\n` +
                 `💰 *Price:* ${product.price} ETB\n` +
                 `📂 *Category:* ${product.category}\n` +
                 `👤 *Seller:* ${seller?.firstName || 'Student'} (@${seller?.username || 'No username'})\n` +
                 `${product.description ? `📝 *Description:* ${product.description}\n` : ''}` +
                 `📅 *Submitted:* ${product.createdAt.toLocaleString()}`,
        parse_mode: 'Markdown',
        reply_markup: approveKeyboard.reply_markup
      });
    } catch (error) {
      await bot.sendMessage(chatId,
        `⏳ *Pending Approval* (${timeAgo})\n\n` +
        `🏷️ *Title:* ${product.title}\n` +
        `💰 *Price:* ${product.price} ETB\n` +
        `📂 *Category:* ${product.category}\n` +
        `👤 *Seller:* ${seller?.firstName || 'Student'}\n` +
        `${product.description ? `📝 *Description:* ${product.description}\n` : ''}`,
        { parse_mode: 'Markdown', reply_markup: approveKeyboard.reply_markup }
      );
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }
});

// ========== ENHANCED CALLBACK HANDLERS ========== //

bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;
  
  try {
    // ✅ FIXED: Define chatId properly for all callbacks
    const chatId = message.chat.id;
    
    // Admin approval
    if (data.startsWith('approve_')) {
      const productId = parseInt(data.replace('approve_', ''));
      await handleAdminApproval(productId, callbackQuery, true);
      return;
    }
    
    // Admin rejection
    if (data.startsWith('reject_')) {
      const productId = parseInt(data.replace('reject_', ''));
      await handleAdminApproval(productId, callbackQuery, false);
      return;
    }
    
    // Message seller directly from approval notification
    if (data.startsWith('message_seller_')) {
      const sellerId = parseInt(data.replace('message_seller_', ''));
      
      if (!ADMIN_IDS.includes(userId)) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Admin access required' });
        return;
      }
      
      const seller = users.get(sellerId);
      if (!seller) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Seller not found' });
        return;
      }
      
      userStates.set(userId, { 
        state: 'awaiting_individual_message', 
        targetUserId: sellerId 
      });
      
      await bot.sendMessage(chatId,
        `📨 *Message Seller*\n\n` +
        `Seller: ${seller.firstName} (@${seller.username || 'No username'})\n` +
        `ID: ${sellerId}\n\n` +
        `Please send your message:`,
        { parse_mode: 'Markdown' }
      );
      
      await bot.answerCallbackQuery(callbackQuery.id, { 
        text: `Messaging ${seller.firstName}` 
      });
      return;
    }
    
    // Handle broadcast confirmation
    if (data.startsWith('confirm_broadcast_')) {
      const broadcastMessage = decodeURIComponent(data.replace('confirm_broadcast_', ''));
      let sentCount = 0;
      let failedCount = 0;
      
      await bot.editMessageText(
        `📢 *Sending Broadcast...*\n\n` +
        `Please wait while I send to ${users.size} users...`,
        {
          chat_id: chatId,
          message_id: message.message_id,
          parse_mode: 'Markdown'
        }
      );
      
      // Send to all users
      for (const [userTelegramId, user] of users) {
        try {
          await bot.sendMessage(userTelegramId,
            `📢 *Important Announcement*\n\n` +
            `${broadcastMessage}\n\n` +
            `*Jimma University Marketplace* 🎓`,
            { parse_mode: 'Markdown' }
          );
          sentCount++;
          
          // Delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          failedCount++;
        }
      }
      
      await bot.editMessageText(
        `✅ *Broadcast Complete!*\n\n` +
        `📤 *Sent to:* ${sentCount} users\n` +
        `❌ *Failed:* ${failedCount} users\n` +
        `📊 *Success rate:* ${((sentCount / users.size) * 100).toFixed(1)}%\n\n` +
        `Message delivered to JU Marketplace community! 🎉`,
        {
          chat_id: chatId,
          message_id: message.message_id,
          parse_mode: 'Markdown'
        }
      );
      
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: `✅ Sent to ${sentCount} users`
      });
      return;
    }
    
    // Cancel broadcast
    if (data === 'cancel_broadcast') {
      await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Broadcast cancelled' });
      await bot.sendMessage(chatId, 'Broadcast cancelled.');
      return;
    }
    
    // Admin view details
    if (data.startsWith('admindetails_')) {
      const productId = parseInt(data.replace('admindetails_', ''));
      
      if (!ADMIN_IDS.includes(userId)) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Admin access required' });
        return;
      }
      
      const product = products.get(productId);
      if (!product) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Product not found' });
        return;
      }
      
      const seller = users.get(product.sellerId);
      
      await bot.sendMessage(chatId,
        `🔍 *Admin - Product Details*\n\n` +
        `🏷️ *Title:* ${product.title}\n` +
        `💰 *Price:* ${product.price} ETB\n` +
        `📂 *Category:* ${product.category}\n` +
        `👤 *Seller:* ${seller?.firstName || 'Unknown'} (@${seller?.username || 'No username'})\n` +
        `🆔 *Seller ID:* ${product.sellerId}\n` +
        `📅 *Submitted:* ${product.createdAt.toLocaleString()}\n` +
        `🏷️ *Status:* ${product.status}\n\n` +
        `${product.description ? `📝 *Description:*\n${product.description}\n\n` : ''}` +
        `🖼️ *Images:* ${product.images?.length || 0}`,
        { parse_mode: 'Markdown' }
      );
      
      await bot.answerCallbackQuery(callbackQuery.id, { text: '📦 Product details sent' });
      return;
    }
    
  } catch (error) {
    console.error('Admin callback error:', error);
    await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Error processing request' });
  }
});

// ========== HANDLE ADMIN MESSAGE INPUTS ========== //

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const userState = userStates.get(userId);
  
  if (userState && ADMIN_IDS.includes(userId)) {
    try {
      switch (userState.state) {
        case 'awaiting_user_id_for_message':
          const targetUserId = parseInt(text);
          if (isNaN(targetUserId)) {
            await bot.sendMessage(chatId, '❌ Please enter a valid numeric User ID.');
            return;
          }
          
          const targetUser = users.get(targetUserId);
          if (!targetUser) {
            await bot.sendMessage(chatId, '❌ User not found. Please check the User ID.');
            return;
          }
          
          userStates.set(userId, { 
            state: 'awaiting_individual_message', 
            targetUserId: targetUserId 
          });
          
          await bot.sendMessage(chatId,
            `📨 *Message to ${targetUser.firstName}*\n\n` +
            `User: ${targetUser.firstName} (@${targetUser.username || 'No username'})\n` +
            `ID: ${targetUserId}\n\n` +
            `Now please send the message you want to send:`,
            { parse_mode: 'Markdown' }
          );
          break;
          
        case 'awaiting_individual_message':
          const targetUserID = userState.targetUserId;
          const targetUserInfo = users.get(targetUserID);
          
          try {
            // Send message to target user
            await bot.sendMessage(targetUserID,
              `📨 *Message from JU Marketplace Admin*\n\n` +
              `${text}\n\n` +
              `*Jimma University Marketplace* 🎓`,
              { parse_mode: 'Markdown' }
            );
            
            await bot.sendMessage(chatId,
              `✅ *Message Sent Successfully!*\n\n` +
              `To: ${targetUserInfo.firstName} (@${targetUserInfo.username || 'No username'})\n` +
              `ID: ${targetUserID}\n\n` +
              `Your message has been delivered.`,
              { parse_mode: 'Markdown' }
            );
            
          } catch (error) {
            await bot.sendMessage(chatId,
              `❌ *Failed to Send Message*\n\n` +
              `User might have blocked the bot or deleted their account.\n\n` +
              `Error: ${error.message}`,
              { parse_mode: 'Markdown' }
            );
          }
          
          userStates.delete(userId);
          break;
          
        case 'awaiting_broadcast_message':
          const confirmKeyboard = {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Yes, Send to All', callback_data: `confirm_broadcast_${encodeURIComponent(text)}` },
                  { text: '❌ Cancel', callback_data: 'cancel_broadcast' }
                ]
              ]
            }
          };
          
          await bot.sendMessage(chatId,
            `📢 *Broadcast Confirmation*\n\n` +
            `*Your Message:*\n"${text}"\n\n` +
            `*This will be sent to:* ${users.size} users\n\n` +
            `Are you sure you want to send this broadcast?`,
            { parse_mode: 'Markdown', ...confirmKeyboard }
          );
          
          userStates.delete(userId);
          break;
      }
    } catch (error) {
      console.error('Admin messaging error:', error);
      await bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
    }
  }
});

// ✅ FIXED: Admin approval function with proper error handling
async function handleAdminApproval(productId, callbackQuery, approve) {
  const adminId = callbackQuery.from.id;
  const message = callbackQuery.message;
  const chatId = message.chat.id; // ✅ DEFINE chatId here
  const product = products.get(productId);
  
  if (!ADMIN_IDS.includes(adminId)) {
    await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Admin access required' });
    return;
  }
  
  if (!product) {
    await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Product not found' });
    return;
  }
  
  if (approve) {
    // Approve product
    product.status = 'approved';
    product.approvedBy = adminId;
    
    // Post to channel
    try {
      const seller = users.get(product.sellerId);
      
      const channelKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🛒 BUY NOW', callback_data: `buy_${product.id}` },
              { text: '📞 CONTACT SELLER', callback_data: `contact_${product.id}` }
            ]
          ]
        }
      };
      
      await bot.sendPhoto(CHANNEL_ID, product.images[0], {
        caption: `🏷️ *${product.title}*\n\n` +
                 `💰 *Price:* ${product.price} ETB\n` +
                 `📦 *Category:* ${product.category}\n` +
                 `👤 *Seller:* ${seller.firstName}\n` +
                 `${product.description ? `📝 *Description:* ${product.description}\n` : ''}` +
                 `\n📍 *Jimma University Campus*` +
                 `\n\n🛒 Buy via @${bot.options.username}`,
        parse_mode: 'Markdown',
        reply_markup: channelKeyboard.reply_markup
      });
      
      // ✅ SUCCESS - Notify admin
      await bot.answerCallbackQuery(callbackQuery.id, { 
        text: '✅ Product approved and posted to channel!' 
      });
      
      // Notify seller
      await bot.sendMessage(product.sellerId,
        `✅ *Your Product Has Been Approved!*\n\n` +
        `🏷️ *${product.title}*\n` +
        `💰 ${product.price} ETB | ${product.category}\n\n` +
        `🎉 Your product is now live in @jumarket!\n\n` +
        `Buyers can now find and purchase your item.`,
        { parse_mode: 'Markdown' }
      );
      
    } catch (error) {
      console.error('Channel post error:', error);
      await bot.answerCallbackQuery(callbackQuery.id, { 
        text: '❌ Failed to post to channel' 
      });
    }
    
  } else {
    // Reject product
    product.status = 'rejected';
    product.approvedBy = adminId;
    
    // Notify seller
    await bot.sendMessage(product.sellerId,
      `❌ *Product Not Approved*\n\n` +
      `🏷️ *${product.title}*\n\n` +
      `Your product submission was not approved.\n\n` +
      `Possible reasons:\n` +
      `• Poor quality images\n` +
      `• Inappropriate content\n` +
      `• Missing information\n\n` +
      `You can submit again with better details.`,
      { parse_mode: 'Markdown' }
    );
    
    await bot.answerCallbackQuery(callbackQuery.id, { 
      text: '❌ Product rejected' 
    });
  }
}

// ========== UTILITY FUNCTIONS ========== //

function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

// Test command to simulate a new product submission
bot.onText(/\/testapproval/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!ADMIN_IDS.includes(userId)) return;
  
  // Create test product
  const testProduct = {
    id: Date.now(),
    sellerId: userId,
    sellerUsername: 'test_seller',
    title: 'Test Product - Engineering Calculator',
    description: 'This is a test product for notification testing. Casio FX-991ES, like new condition.',
    price: 450,
    category: '💻 Electronics',
    images: ['AgACAgQAAxkDAAIBmWcAAAExnD5n8vVQnRwv6pR2S1yLdwACb8IxG8AAAVFTJ8AAAfQKAAH0BA'],
    status: 'pending',
    createdAt: new Date()
  };
  
  await bot.sendMessage(chatId, '🔄 Sending test approval notification...');
  
  const notifiedCount = await notifyAdminsAboutNewProduct(testProduct);
  
  await bot.sendMessage(chatId,
    `✅ Test completed!\n\n` +
    `Notifications sent to ${notifiedCount}/${ADMIN_IDS.length} admins.\n\n` +
    `You should receive the approval message shortly.`
  );
});

// ========== MISSING ADMIN COMMANDS ========== //

// Admin: Statistics command
bot.onText(/\/stats|📊 Stats/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!ADMIN_IDS.includes(userId)) return;
  
  const totalProducts = products.size;
  const approvedProducts = Array.from(products.values()).filter(p => p.status === 'approved').length;
  const pendingProducts = Array.from(products.values()).filter(p => p.status === 'pending').length;
  const rejectedProducts = Array.from(products.values()).filter(p => p.status === 'rejected').length;
  const totalUsers = users.size;
  
  // Calculate today's submissions
  const today = new Date();
  const todayProducts = Array.from(products.values())
    .filter(p => p.createdAt.toDateString() === today.toDateString()).length;
  
  await bot.sendMessage(chatId,
    `📊 *Marketplace Statistics*\n\n` +
    `👥 *Total Users:* ${totalUsers}\n` +
    `🛍️ *Total Products:* ${totalProducts}\n` +
    `✅ *Approved:* ${approvedProducts}\n` +
    `⏳ *Pending:* ${pendingProducts}\n` +
    `❌ *Rejected:* ${rejectedProducts}\n` +
    `📈 *Today's Submissions:* ${todayProducts}\n\n` +
    `Last updated: ${new Date().toLocaleString()}`,
    { parse_mode: 'Markdown' }
  );
});

// Admin: View all users
bot.onText(/\/users|👥 Users/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!ADMIN_IDS.includes(userId)) return;
  
  const userList = Array.from(users.values());
  
  if (userList.length === 0) {
    await bot.sendMessage(chatId, 'No users registered yet.');
    return;
  }
  
  let message = `👥 *Registered Users (${userList.length})*\n\n`;
  
  userList.slice(0, 15).forEach((user, index) => {
    const userProducts = Array.from(products.values()).filter(p => p.sellerId === user.telegramId).length;
    
    message += `${index + 1}. ${user.firstName} (@${user.username || 'No username'})\n`;
    message += `   🆔 ${user.telegramId}\n`;
    message += `   🛍️ Products: ${userProducts}\n`;
    message += `   📅 Joined: ${user.joinedAt.toLocaleDateString()}\n\n`;
  });
  
  if (userList.length > 15) {
    message += `... and ${userList.length - 15} more users.`;
  }
  
  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Admin: View all products
bot.onText(/\/allproducts|🛍️ All Products/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!ADMIN_IDS.includes(userId)) return;
  
  const allProducts = Array.from(products.values());
  
  if (allProducts.length === 0) {
    await bot.sendMessage(chatId, 'No products in the system.');
    return;
  }
  
  let message = `🛍️ *All Products (${allProducts.length})*\n\n`;
  
  allProducts.forEach((product, index) => {
    const seller = users.get(product.sellerId);
    const statusIcon = product.status === 'approved' ? '✅' : product.status === 'pending' ? '⏳' : '❌';
    
    message += `${index + 1}. ${statusIcon} *${product.title}*\n`;
    message += `   💰 ${product.price} ETB | ${product.category}\n`;
    message += `   👤 ${seller?.firstName || 'Unknown'}\n`;
    message += `   🏷️ ${product.status} | 📅 ${product.createdAt.toLocaleDateString()}\n\n`;
  });
  
  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Cancel command for admin actions
bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (userStates.has(userId)) {
    userStates.delete(userId);
    bot.sendMessage(chatId, '❌ Action cancelled.');
  }
});

// Test all admin features
bot.onText(/\/testadmin/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!ADMIN_IDS.includes(userId)) return;
  
  await bot.sendMessage(chatId,
    `🧪 *Admin System Test*\n\n` +
    `Testing all admin features:\n\n` +
    `✅ Instant notifications\n` +
    `✅ Approve/Reject buttons\n` +
    `✅ Message individual users\n` +
    `✅ Broadcast to all\n` +
    `✅ View statistics\n` +
    `✅ View all users\n` +
    `✅ View all products\n\n` +
    `All admin features should work! 🎉`,
    { parse_mode: 'Markdown' }
  );
});

// ========== HELP & CONTACT ========== //
// ========== HELP & CONTACT ========== //

// ========== HELP COMMAND ========== //
bot.onText(/\/help|ℹ️ Help/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Check if user is admin to show admin commands
  const isAdmin = ADMIN_IDS.includes(userId);
  
  let helpMessage = `ℹ️ *Jimma University Marketplace Help*\n\n` +
    `*How to Buy:*\n` +
    `1. Click "🛍️ Browse Products"\n` +
    `2. View available items\n` +
    `3. Click "🛒 Buy Now" or "📞 Contact Seller"\n` +
    `4. Arrange campus meetup\n\n` +
    `*How to Sell:*\n` +
    `1. Click "➕ Sell Item"\n` +
    `2. Send product photos (1-5 images)\n` +
    `3. Add title, price, and description\n` +
    `4. Select category\n` +
    `5. Wait for admin approval (usually within 24 hours)\n` +
    `6. Item appears in @jumarket channel\n\n` +
    `*Safety Guidelines:*\n` +
    `• Meet in public campus areas (library, cafeteria, student center)\n` +
    `• Verify items before payment\n` +
    `• Use cash transactions for safety\n` +
    `• Bring friends for expensive items\n` +
    `• Report suspicious activity to admins\n\n` +
    `*Available Categories:*\n` +
    `• 📚 Academic Books\n` +
    `• 💻 Electronics\n` +
    `• 👕 Clothes & Fashion\n` +
    `• 🏠 Furniture & Home\n` +
    `• 📝 Study Materials\n` +
    `• 🎮 Entertainment\n` +
    `• 🍔 Food & Drinks\n` +
    `• 🚗 Transportation\n` +
    `• 🎒 Accessories\n` +
    `• ❓ Others\n\n` +
    `*User Commands:*\n` +
    `/start - Start the bot\n` +
    `/help - Show this help message\n` +
    `/browse - Browse available products\n` +
    `/sell - List a new product for sale\n` +
    `/myproducts - View your listed products\n` +
    `/status - Check marketplace statistics\n` +
    `/contact - Contact administration\n`;
  
  // Add admin commands only for admins
  if (isAdmin) {
    helpMessage += `\n` +
      `*⚡ Admin Commands:*\n` +
      `/admin - Open admin panel\n` +
      `/pending - View pending product approvals\n` +
      `/stats - View marketplace statistics\n` +
      `/users - View all registered users\n` +
      `/allproducts - View all products in system\n` +
      `/messageuser - Message specific user\n` +
      `/broadcast - Send message to all users\n` +
      `/testapproval - Test notification system\n\n` +
      `*Admin Features:*\n` +
      `• Instant product approval notifications\n` +
      `• One-click approve/reject buttons\n` +
      `• Direct messaging to sellers\n` +
      `• Broadcast announcements to all users\n` +
      `• Detailed marketplace analytics\n` +
      `• User management tools\n`;
  }
  
  helpMessage += `\n*Need Immediate Help?*\nUse "📞 Contact Admin" button or message our team directly.\n\n` +
    `*Jimma University Marketplace Team* 🎓\n` +
    `_Building a safer campus trading community_`;
  
  await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// ========== CONTACT ADMIN COMMAND ========== //
bot.onText(/\/contact|📞 Contact Admin/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  const user = users.get(userId);
  const userName = user ? user.firstName : 'User';
  
  const contactKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📧 Report Issue', callback_data: 'report_issue' },
          { text: '💡 Suggestion', callback_data: 'give_suggestion' }
        ],
        [
          { text: '🚨 Urgent Help', callback_data: 'urgent_help' },
          { text: '🤔 General Question', callback_data: 'general_question' }
        ],
        [
          { text: '🏠 Main Menu', callback_data: 'main_menu' }
        ]
      ]
    }
  };
  
  await bot.sendMessage(chatId,
    `📞 *Contact Administration*\n\n` +
    `Hello ${userName}! 👋\n\n` +
    `*How can we help you today?*\n\n` +
    `🔹 *Product Issues:* Approval delays, listing problems\n` +
    `🔹 *Account Help:* Login issues, profile updates\n` +
    `🔹 *Safety Concerns:* Suspicious users, scam reports\n` +
    `🔹 *Suggestions:* Feature requests, improvements\n` +
    `🔹 *General Questions:* How things work\n\n` +
    *Select your issue type below:*`,
    { 
      parse_mode: 'Markdown',
      reply_markup: contactKeyboard.reply_markup 
    }
  );
});

// ========== CONTACT CALLBACK HANDLER ========== //
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;
  
  try {
    // Handle contact-related callbacks
    switch (data) {
      case 'report_issue':
        userStates.set(userId, { state: 'awaiting_issue_report' });
        await bot.sendMessage(chatId,
          `📧 *Report an Issue*\n\n` +
          `Please describe the issue you're experiencing:\n\n` +
          `• What happened?\n` +
          `• When did it occur?\n` +
          `• Product ID (if applicable)\n` +
          `• Any error messages?\n\n` +
          `Type your report below:`,
          { parse_mode: 'Markdown' }
        );
        await bot.answerCallbackQuery(callbackQuery.id, { text: '📝 Please describe your issue' });
        break;
        
      case 'give_suggestion':
        userStates.set(userId, { state: 'awaiting_suggestion' });
        await bot.sendMessage(chatId,
          `💡 *Share Your Suggestion*\n\n` +
          `We'd love to hear your ideas for improving the marketplace!\n\n` +
          `What would you like to see?\n` +
          `• New features\n` +
          `• Improvements\n` +
          `• Bug fixes\n` +
          `• Other suggestions\n\n` +
          `Type your suggestion below:`,
          { parse_mode: 'Markdown' }
        );
        await bot.answerCallbackQuery(callbackQuery.id, { text: '💡 We value your suggestions!' });
        break;
        
      case 'urgent_help':
        userStates.set(userId, { state: 'awaiting_urgent_help' });
        await bot.sendMessage(chatId,
          `🚨 *Urgent Help Request*\n\n` +
          `Please describe your urgent issue:\n\n` +
          `• Safety concern\n` +
          `• Scam attempt\n` +
          `• Emergency situation\n` +
          `• Immediate assistance needed\n\n` +
          `*Note:* For immediate safety issues, also contact campus security.\n\n` +
          `Describe your urgent issue below:`,
          { parse_mode: 'Markdown' }
        );
        await bot.answerCallbackQuery(callbackQuery.id, { text: '🚨 Urgent help requested' });
        break;
        
      case 'general_question':
        userStates.set(userId, { state: 'awaiting_general_question' });
        await bot.sendMessage(chatId,
          `🤔 *General Question*\n\n` +
          `What would you like to know about the marketplace?\n\n` +
          `Ask your question below and our team will respond soon:`,
          { parse_mode: 'Markdown' }
        );
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❓ Ask your question' });
        break;
        
      case 'main_menu':
        userStates.delete(userId);
        await showMainMenu(chatId);
        await bot.answerCallbackQuery(callbackQuery.id, { text: '🏠 Returning to main menu' });
        break;
    }
  } catch (error) {
    console.error('Contact callback error:', error);
    await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Error processing request' });
  }
});

// ========== HANDLE CONTACT MESSAGES ========== //
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const userState = userStates.get(userId);
  const user = users.get(userId);
  
  if (userState && userState.state.includes('awaiting_')) {
    try {
      const userName = user.firstName;
      const userUsername = user.username ? `@${user.username}` : 'No username';
      
      // Determine message type and prepare admin notification
      let adminMessage = '';
      let userConfirmation = '';
      let messageType = '';
      
      switch (userState.state) {
        case 'awaiting_issue_report':
          messageType = 'ISSUE REPORT';
          adminMessage = `🚨 *${messageType}*\n\n` +
                        `*From:* ${userName} (${userUsername})\n` +
                        `*User ID:* ${userId}\n\n` +
                        `*Report:* ${text}\n\n` +
                        `_Time: ${new Date().toLocaleString()}_`;
          
          userConfirmation = `✅ *Issue Reported Successfully!*\n\n` +
                            `We've received your report and will investigate it shortly.\n\n` +
                            `*Reference:* ${messageType}-${Date.now()}\n` +
                            `*Submitted:* ${new Date().toLocaleString()}\n\n` +
                            `We'll contact you if we need more information.`;
          break;
          
        case 'awaiting_suggestion':
          messageType = 'SUGGESTION';
          adminMessage = `💡 *${messageType}*\n\n` +
                        `*From:* ${userName} (${userUsername})\n` +
                        `*User ID:* ${userId}\n\n` +
                        `*Suggestion:* ${text}\n\n` +
                        `_Time: ${new Date().toLocaleString()}_`;
          
          userConfirmation = `✅ *Suggestion Received!*\n\n` +
                            `Thank you for your valuable feedback! 🎉\n\n` +
                            `We review all suggestions and will consider it for future updates.\n\n` +
                            `*Reference:* ${messageType}-${Date.now()}`;
          break;
          
        case 'awaiting_urgent_help':
          messageType = 'URGENT HELP';
          adminMessage = `🚨 *${messageType} - IMMEDIATE ATTENTION NEEDED!*\n\n` +
                        `*From:* ${userName} (${userUsername})\n` +
                        `*User ID:* ${userId}\n\n` +
                        `*Urgent Issue:* ${text}\n\n` +
                        `_Time: ${new Date().toLocaleString()}_`;
          
          userConfirmation = `🚨 *Urgent Help Request Submitted!*\n\n` +
                            `We've received your urgent request and will respond as soon as possible.\n\n` +
                            `*If this is a safety emergency, please also contact campus security.*\n\n` +
                            `*Reference:* ${messageType}-${Date.now()}\n` +
                            `*Priority:* HIGH`;
          break;
          
        case 'awaiting_general_question':
          messageType = 'QUESTION';
          adminMessage = `❓ *${messageType}*\n\n` +
                        `*From:* ${userName} (${userUsername})\n` +
                        `*User ID:* ${userId}\n\n` +
                        `*Question:* ${text}\n\n` +
                        `_Time: ${new Date().toLocaleString()}_`;
          
          userConfirmation = `✅ *Question Submitted!*\n\n` +
                            `We've received your question and will respond within 24 hours.\n\n` +
                            `*Reference:* ${messageType}-${Date.now()}\n` +
                            `You can check the /help section for immediate answers.`;
          break;
      }
      
      // Send notification to all admins
      let adminNotifiedCount = 0;
      for (const adminId of ADMIN_IDS) {
        try {
          await bot.sendMessage(adminId, adminMessage, { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📨 Reply to User', callback_data: `message_user_${userId}` },
                  { text: '👤 View Profile', callback_data: `view_user_${userId}` }
                ]
              ]
            }
          });
          adminNotifiedCount++;
        } catch (error) {
          console.error(`Failed to notify admin ${adminId}:`, error.message);
        }
      }
      
      // Send confirmation to user
      await bot.sendMessage(chatId, userConfirmation, { parse_mode: 'Markdown' });
      
      // Log the contact request
      console.log(`📞 ${messageType} from user ${userId} (${userName}). Notified ${adminNotifiedCount}/${ADMIN_IDS.length} admins.`);
      
      // Clear user state
      userStates.delete(userId);
      
      // Show main menu after submission
      await showMainMenu(chatId);
      
    } catch (error) {
      console.error('Contact message handling error:', error);
      await bot.sendMessage(chatId, 
        '❌ Sorry, there was an error submitting your message. Please try again.',
        { parse_mode: 'Markdown' }
      );
    }
  }
});

// ========== BOT STATUS COMMAND ========== //
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  const totalProducts = products.size;
  const approvedProducts = Array.from(products.values()).filter(p => p.status === 'approved').length;
  const pendingProducts = Array.from(products.values()).filter(p => p.status === 'pending').length;
  const rejectedProducts = Array.from(products.values()).filter(p => p.status === 'rejected').length;
  const soldProducts = Array.from(products.values()).filter(p => p.status === 'sold').length;
  const totalUsers = users.size;
  
  // Calculate active users (users with products)
  const activeUsers = new Set(Array.from(products.values()).map(p => p.sellerId)).size;
  
  // Calculate today's activity
  const today = new Date();
  const todayProducts = Array.from(products.values())
    .filter(p => p.createdAt.toDateString() === today.toDateString()).length;
  
  const todayUsers = Array.from(users.values())
    .filter(u => u.joinedAt.toDateString() === today.toDateString()).length;
  
  const statusMessage = `📊 *Marketplace Status Report*\n\n` +
    `👥 *User Statistics:*\n` +
    `• Total Registered: ${totalUsers} users\n` +
    `• Active Sellers: ${activeUsers} users\n` +
    `• New Today: ${todayUsers} users\n\n` +
    `🛍️ *Product Statistics:*\n` +
    `• Total Products: ${totalProducts} items\n` +
    `• ✅ Approved: ${approvedProducts} items\n` +
    `• ⏳ Pending: ${pendingProducts} items\n` +
    `• ❌ Rejected: ${rejectedProducts} items\n` +
    `• 💰 Sold: ${soldProducts} items\n` +
    `• New Today: ${todayProducts} items\n\n` +
    `📈 *Marketplace Health:*\n` +
    `• Approval Rate: ${totalProducts > 0 ? ((approvedProducts / totalProducts) * 100).toFixed(1) : 0}%\n` +
    `• Active Rate: ${totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) : 0}%\n` +
    `• Daily Growth: +${todayProducts} products, +${todayUsers} users\n\n` +
    `🕒 *Last Updated:* ${new Date().toLocaleString()}\n\n` +
    `🏪 *Jimma University Marketplace* 🎓\n` +
    `_Growing campus trading community_`;
  
  await bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
});

// ========== ABOUT COMMAND ========== //
bot.onText(/\/about/, async (msg) => {
  const chatId = msg.chat.id;
  
  const aboutMessage = `🏪 *About Jimma University Marketplace*\n\n` +
    `*Our Mission:*\n` +
    `To create a safe, convenient platform for JU students to buy and sell items within our campus community.\n\n` +
    `*Features:*\n` +
    `• 🛍️ Easy product listing with photos\n` +
    `• ✅ Admin-approved items for safety\n` +
    `• 📍 Campus-focused transactions\n` +
    `• 🔒 Secure communication\n` +
    `• 🎓 Student-only community\n\n` +
    `*Safety First:*\n` +
    `• All products reviewed by admins\n` +
    • Campus meetup recommendations\n` +
    `• User verification system\n` +
    `• Report suspicious activity\n\n` +
    `*Community Guidelines:*\n` +
    `1. Be respectful to all users\n` +
    `2. Provide accurate product information\n` +
    `3. Meet in safe public areas\n` +
    `4. No prohibited items (weapons, drugs, etc.)\n` +
    `5. Report any issues to admins\n\n` +
    `*Version:* 2.0.0\n` +
    `*Launched:* 2024\n` +
    `*Platform:* Telegram Bot\n\n` +
    `*Join Our Community Channel:*\n` +
    `📢 @jumarket - See all approved products\n\n` +
    `_Building a better campus experience, one trade at a time_ 🎓`;
  
  await bot.sendMessage(chatId, aboutMessage, { parse_mode: 'Markdown' });
});

// ========== CANCEL COMMAND ========== //
bot.onText(/\/cancel/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (userStates.has(userId)) {
    const userState = userStates.get(userId);
    
    // Clear user state
    userStates.delete(userId);
    
    await bot.sendMessage(chatId,
      `❌ *Action Cancelled*\n\n` +
      `Your previous action has been cancelled.\n\n` +
      `What would you like to do next?`,
      { parse_mode: 'Markdown' }
    );
    
    // Show main menu
    await showMainMenu(chatId);
  } else {
    await bot.sendMessage(chatId,
      `ℹ️ *No Active Action*\n\n` +
      `There's nothing to cancel right now.\n\n` +
      `Use the menu below to get started:`,
      { parse_mode: 'Markdown' }
    );
    
    await showMainMenu(chatId);
  }
});

// ========== BROADCAST ANNOUNCEMENTS ========== //
// This function can be called by admins to send important announcements
async function sendBroadcastAnnouncement(message, adminId) {
  try {
    let sentCount = 0;
    let failedCount = 0;
    
    const admin = users.get(adminId);
    const adminName = admin ? admin.firstName : 'Admin';
    
    const broadcastMessage = `📢 *Important Announcement*\n\n` +
                            `${message}\n\n` +
                            `*From:* ${adminName}\n` +
                            `*Jimma University Marketplace* 🎓`;
    
    // Send to all users
    for (const [userTelegramId, user] of users) {
      try {
        await bot.sendMessage(userTelegramId, broadcastMessage, { 
          parse_mode: 'Markdown' 
        });
        sentCount++;
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        failedCount++;
        console.error(`Failed to send broadcast to user ${userTelegramId}:`, error.message);
      }
    }
    
    // Report results to admin
    const resultsMessage = `✅ *Broadcast Completed!*\n\n` +
                          `*Message:* ${message.substring(0, 50)}...\n\n` +
                          `📊 *Results:*\n` +
                          `• ✅ Sent: ${sentCount} users\n` +
                          `• ❌ Failed: ${failedCount} users\n` +
                          `• 📈 Success Rate: ${((sentCount / users.size) * 100).toFixed(1)}%\n\n` +
                          `*Total Users:* ${users.size}`;
    
    await bot.sendMessage(adminId, resultsMessage, { parse_mode: 'Markdown' });
    
    return { sent: sentCount, failed: failedCount, total: users.size };
    
  } catch (error) {
    console.error('Broadcast announcement error:', error);
    throw error;
  }
}

// ========== MAINTENANCE MODE ========== //
let maintenanceMode = false;

bot.onText(/\/maintenance (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const action = match[1].toLowerCase();
  
  if (!ADMIN_IDS.includes(userId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  if (action === 'on') {
    maintenanceMode = true;
    await bot.sendMessage(chatId,
      `🛠️ *Maintenance Mode Enabled*\n\n` +
      `The marketplace is now in maintenance mode.\n` +
      `Users will see a maintenance message when using the bot.\n\n` +
      `Use "/maintenance off" to disable.`,
      { parse_mode: 'Markdown' }
    );
    
    // Notify all users about maintenance
    await sendBroadcastAnnouncement(
      `🛠️ *Scheduled Maintenance*\n\n` +
      `The marketplace is currently undergoing maintenance. Some features may be temporarily unavailable.\n\n` +
      `We'll be back soon with improvements! Thank you for your patience.`,
      userId
    );
    
  } else if (action === 'off') {
    maintenanceMode = false;
    await bot.sendMessage(chatId,
      `✅ *Maintenance Mode Disabled*\n\n` +
      `The marketplace is now back online and fully operational!`,
      { parse_mode: 'Markdown' }
    );
    
    // Notify all users that maintenance is complete
    await sendBroadcastAnnouncement(
      `✅ *Maintenance Complete*\n\n` +
      `The marketplace is now back online with all features available!\n\n` +
      `Thank you for your patience during our maintenance period.`,
      userId
    );
    
  } else {
    await bot.sendMessage(chatId,
      `ℹ️ *Maintenance Mode:* ${maintenanceMode ? '🛠️ ON' : '✅ OFF'}\n\n` +
      `Usage:\n` +
      `/maintenance on - Enable maintenance mode\n` +
      `/maintenance off - Disable maintenance mode`,
      { parse_mode: 'Markdown' }
    );
  }
});

// ========== MAINTENANCE MODE CHECK ========== //
// Add this check to relevant handlers
const checkMaintenanceMode = (chatId) => {
  if (maintenanceMode) {
    bot.sendMessage(chatId,
      `🛠️ *Maintenance in Progress*\n\n` +
      `Sorry, the marketplace is currently undergoing maintenance.\n\n` +
      `We're working to improve your experience and will be back soon!\n\n` +
      `Estimated downtime: 30-60 minutes\n` +
      `Thank you for your patience! 🎓`,
      { parse_mode: 'Markdown' }
    );
    return true;
  }
  return false;
};

// Example usage in main commands:
// bot.onText(/\/start/, async (msg) => {
//   const chatId = msg.chat.id;
//   if (checkMaintenanceMode(chatId)) return;
//   // ... rest of start command
// });

console.log('🎉 JU Marketplace Bot fully operational! All features loaded!');
