const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const db = require('./database');

// UPnP для автоматической настройки портов
let upnpClient = null;
try {
  const natUpnp = require('nat-upnp');
  upnpClient = natUpnp.createClient();
} catch (error) {
  console.log('⚠️  UPnP не доступен (не критично)');
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Хранилище онлайн пользователей (socketId -> userId)
const onlineUsers = new Map(); // socketId -> userId
const userSockets = new Map(); // userId -> socketId
const messages = []; // Общий чат
const rooms = new Map(); // Для звонков
const MAX_ONLINE_USERS = 20; // Максимальное количество онлайн пользователей

// Получение IP адреса сервера
const os = require('os');
const https = require('https');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Получение публичного IP адреса
function getPublicIP(callback) {
  const services = [
    'https://api.ipify.org?format=json',
    'https://api64.ipify.org?format=json',
    'https://icanhazip.com',
    'https://ifconfig.me/ip'
  ];
  
  let currentIndex = 0;
  
  function tryNext() {
    if (currentIndex >= services.length) {
      callback(null);
      return;
    }
    
    const url = services[currentIndex];
    currentIndex++;
    
    if (url.includes('ipify')) {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            callback(json.ip || null);
          } catch (e) {
            tryNext();
          }
        });
      }).on('error', () => {
        tryNext();
      });
    } else {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const ip = data.trim();
          if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
            callback(ip);
          } else {
            tryNext();
          }
        });
      }).on('error', () => {
        tryNext();
      });
    }
  }
  
  tryNext();
}

const PORT = process.env.PORT || 3000;
const HOST = getLocalIP();
let PUBLIC_IP = null;

// Веб-интерфейс для клиента
app.use(express.static(path.join(__dirname, '../client')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// API для регистрации
app.post('/api/register', (req, res) => {
  const { username, password, email } = req.body;
  const result = db.registerUser(username, password, email);
  res.json(result);
});

// API для авторизации
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const result = db.loginUser(username, password);
  res.json(result);
});

// API для поиска пользователей
app.get('/api/search', (req, res) => {
  const { q, userId } = req.query;
  if (!q || !userId) {
    return res.json([]);
  }
  const results = db.searchUsers(q, userId);
  res.json(results);
});

// API для получения информации о сервере
app.get('/api/info', (req, res) => {
  res.json({
    host: HOST,
    publicIp: PUBLIC_IP,
    port: PORT,
    usersCount: onlineUsers.size,
    maxUsers: MAX_ONLINE_USERS
  });
});

// Socket.io подключения
io.on('connection', (socket) => {
  console.log('Пользователь подключен:', socket.id);

  // Авторизация через socket
  socket.on('authenticate', async (data) => {
    const { userId } = data;
    const user = db.findUserById(userId);
    
    if (!user) {
      socket.emit('authError', { error: 'Пользователь не найден' });
      return;
    }

    // Проверка максимального количества онлайн пользователей
    if (onlineUsers.size >= MAX_ONLINE_USERS) {
      socket.emit('authError', { 
        error: `Сервер переполнен. Максимум ${MAX_ONLINE_USERS} пользователей онлайн. Попробуйте позже.` 
      });
      return;
    }

    onlineUsers.set(socket.id, userId);
    userSockets.set(userId, socket.id);
    db.updateUserStatus(userId, 'online');

    // Отправляем данные пользователя
    const friends = db.getFriends(userId);
    
    // Получаем информацию о заявках в друзья
    const friendRequestsInfo = (user.friendRequests || []).map(requestUserId => {
      const requestUser = db.findUserById(requestUserId);
      return requestUser ? {
        fromUserId: requestUserId,
        fromUsername: requestUser.username
      } : null;
    }).filter(r => r !== null);
    
    socket.emit('authenticated', {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        friends: friends
      },
      friendRequests: friendRequestsInfo
    });

    // Отправляем список онлайн друзей
    const onlineFriends = friends.filter(f => {
      const friendSocketId = userSockets.get(f.id);
      return friendSocketId && onlineUsers.has(friendSocketId);
    });

    socket.emit('friendsOnline', onlineFriends);

    // Уведомляем друзей о том, что пользователь онлайн
    onlineFriends.forEach(friend => {
      const friendSocketId = userSockets.get(friend.id);
      if (friendSocketId) {
        io.to(friendSocketId).emit('friendOnline', { id: user.id, username: user.username });
      }
    });

    // Отправляем список всех пользователей для общего чата
    const allUsers = db.getUsers().map(u => ({
      id: u.id,
      username: u.username,
      status: userSockets.has(u.id) ? 'online' : 'offline'
    }));
    io.emit('userList', allUsers);

    console.log(`Пользователь ${user.username} авторизован`);
  });

  // Отправка сообщения в общий чат
  socket.on('sendMessage', (messageData) => {
    const userId = onlineUsers.get(socket.id);
    if (!userId) return;

    const user = db.findUserById(userId);
    if (!user) return;

    const message = {
      id: crypto.randomBytes(16).toString('hex'),
      userId: userId,
      username: user.username,
      text: messageData.text,
      timestamp: new Date().toISOString(),
      avatar: user.avatar
    };

    messages.push(message);
    
    // Отправляем всем пользователям
    io.emit('newMessage', message);
    console.log(`Сообщение от ${user.username}: ${messageData.text}`);
  });

  // Получение истории общих сообщений
  socket.on('getMessages', () => {
    socket.emit('messageHistory', messages);
  });

  // Отправка личного сообщения
  socket.on('sendPrivateMessage', (data) => {
    const userId = onlineUsers.get(socket.id);
    if (!userId) return;

    const user = db.findUserById(userId);
    const targetUser = db.findUserById(data.toUserId);
    if (!user || !targetUser) return;

    // Сохраняем сообщение (текст или голосовое)
    const message = db.savePrivateMessage(
      userId, 
      data.toUserId, 
      data.text || '',
      data.voiceMessage,
      data.voiceDuration
    );
    
    // Отправляем отправителю
    socket.emit('privateMessage', {
      ...message,
      fromUsername: user.username,
      toUsername: targetUser.username,
      isOwn: true
    });

    // Отправляем получателю если он онлайн
    const targetSocketId = userSockets.get(data.toUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('privateMessage', {
        ...message,
        fromUsername: user.username,
        toUsername: targetUser.username,
        isOwn: false
      });
    }
  });

  // Получение истории личных сообщений
  socket.on('getPrivateMessages', (data) => {
    const userId = onlineUsers.get(socket.id);
    if (!userId) return;

    const messages = db.getPrivateMessages(userId, data.otherUserId);
    const user = db.findUserById(userId);
    const otherUser = db.findUserById(data.otherUserId);

    socket.emit('privateMessagesHistory', {
      messages: messages.map(msg => ({
        ...msg,
        fromUsername: msg.fromUserId === userId ? user.username : otherUser.username,
        toUsername: msg.toUserId === userId ? user.username : otherUser.username,
        isOwn: msg.fromUserId === userId
      })),
      otherUser: { id: otherUser.id, username: otherUser.username }
    });
  });

  // Запрос в друзья
  socket.on('sendFriendRequest', (data) => {
    const userId = onlineUsers.get(socket.id);
    if (!userId) return;

    const result = db.addFriendRequest(userId, data.friendId);
    if (result.success) {
      const targetSocketId = userSockets.get(data.friendId);
      if (targetSocketId) {
        const user = db.findUserById(userId);
        io.to(targetSocketId).emit('friendRequest', {
          fromUserId: userId,
          fromUsername: user.username
        });
      }
      socket.emit('friendRequestSent', { success: true });
    } else {
      socket.emit('friendRequestSent', result);
    }
  });

  // Принятие запроса в друзья
  socket.on('acceptFriendRequest', (data) => {
    const userId = onlineUsers.get(socket.id);
    if (!userId) return;

    const result = db.acceptFriendRequest(userId, data.friendId);
    if (result.success) {
      const user = db.findUserById(userId);
      const friend = db.findUserById(data.friendId);

      if (!user || !friend) return;

      // Обновляем статус друга (онлайн/оффлайн)
      const friendSocketId = userSockets.get(data.friendId);
      const friendStatus = friendSocketId ? 'online' : 'offline';

      // Обновляем списки друзей у обоих
      socket.emit('friendAdded', {
        friend: { id: friend.id, username: friend.username, status: friendStatus }
      });

      // Отправляем обновление отправителю заявки
      if (friendSocketId) {
        io.to(friendSocketId).emit('friendAdded', {
          friend: { id: user.id, username: user.username, status: 'online' }
        });
      }

      // Обновляем список заявок у принимающего с полной информацией
      const updatedUser = db.findUserById(userId);
      const updatedFriendRequestsInfo = (updatedUser.friendRequests || []).map(requestUserId => {
        const requestUser = db.findUserById(requestUserId);
        return requestUser ? {
          fromUserId: requestUserId,
          fromUsername: requestUser.username
        } : null;
      }).filter(r => r !== null);
      
      socket.emit('friendRequestsUpdated', {
        friendRequests: updatedFriendRequestsInfo
      });
    } else {
      socket.emit('friendRequestError', { error: result.error || 'Не удалось принять заявку' });
    }
  });

  // Отклонение запроса в друзья
  socket.on('rejectFriendRequest', (data) => {
    const userId = onlineUsers.get(socket.id);
    if (!userId) return;

    const users = db.getUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return;

    // Удаляем заявку из списка
    user.friendRequests = (user.friendRequests || []).filter(id => id !== data.friendId);
    
    // Сохраняем изменения
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      users[userIndex] = user;
      db.saveUsers(users);
    }

    // Обновляем список заявок
    const updatedFriendRequestsInfo = (user.friendRequests || []).map(requestUserId => {
      const requestUser = db.findUserById(requestUserId);
      return requestUser ? {
        fromUserId: requestUserId,
        fromUsername: requestUser.username
      } : null;
    }).filter(r => r !== null);
    
    socket.emit('friendRequestsUpdated', {
      friendRequests: updatedFriendRequestsInfo
    });
  });

  // Удаление из друзей
  socket.on('removeFriend', (data) => {
    const userId = onlineUsers.get(socket.id);
    if (!userId) return;

    db.removeFriend(userId, data.friendId);
    socket.emit('friendRemoved', { friendId: data.friendId });
  });

  // Звонки (WebRTC)
  socket.on('callUser', (data) => {
    const userId = onlineUsers.get(socket.id);
    if (!userId) return;

    const caller = db.findUserById(userId);
    if (!caller) return;

    const roomId = data.roomId || `room_${Date.now()}`;
    const targetSocketId = userSockets.get(data.targetUserId);
    
    if (!targetSocketId) {
      socket.emit('callError', { error: 'Пользователь не в сети' });
      return;
    }

    rooms.set(roomId, {
      caller: socket.id,
      callee: targetSocketId,
      status: 'calling',
      callType: data.callType || 'video' // 'video' или 'voice'
    });

    io.to(targetSocketId).emit('incomingCall', {
      roomId,
      callerId: userId,
      callerName: caller.username,
      callType: data.callType || 'video'
    });

    socket.emit('callStarted', { roomId });
  });

  socket.on('answerCall', (data) => {
    const room = rooms.get(data.roomId);
    if (!room) return;

    io.to(room.caller).emit('callAnswered', {
      roomId: data.roomId,
      answererId: socket.id
    });
  });

  socket.on('rejectCall', (data) => {
    const room = rooms.get(data.roomId);
    if (!room) return;

    io.to(room.caller).emit('callRejected', {
      roomId: data.roomId
    });
    rooms.delete(data.roomId);
  });

  socket.on('endCall', (data) => {
    const room = rooms.get(data.roomId);
    if (room) {
      io.to(room.caller).emit('callEnded', { roomId: data.roomId });
      io.to(room.callee).emit('callEnded', { roomId: data.roomId });
      rooms.delete(data.roomId);
    }
  });

  // WebRTC сигналы
  socket.on('offer', (data) => {
    const targetSocketId = userSockets.get(data.target);
    if (targetSocketId) {
      io.to(targetSocketId).emit('offer', {
        offer: data.offer,
        caller: socket.id
      });
    }
  });

  socket.on('answer', (data) => {
    const targetSocketId = userSockets.get(data.target);
    if (targetSocketId) {
      io.to(targetSocketId).emit('answer', {
        answer: data.answer,
        answerer: socket.id
      });
    }
  });

  socket.on('ice-candidate', (data) => {
    const targetSocketId = userSockets.get(data.target);
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', {
        candidate: data.candidate,
        sender: socket.id
      });
    }
  });

  // Отключение
  socket.on('disconnect', () => {
    const userId = onlineUsers.get(socket.id);
    if (userId) {
      db.updateUserStatus(userId, 'offline');
      onlineUsers.delete(socket.id);
      userSockets.delete(userId);

      // Уведомляем друзей
      const friends = db.getFriends(userId);
      friends.forEach(friend => {
        const friendSocketId = userSockets.get(friend.id);
        if (friendSocketId) {
          io.to(friendSocketId).emit('friendOffline', { id: userId });
        }
      });

      // Обновляем список пользователей
      const allUsers = db.getUsers().map(u => ({
        id: u.id,
        username: u.username,
        status: userSockets.has(u.id) ? 'online' : 'offline'
      }));
      io.emit('userList', allUsers);
      io.emit('userLeft', userId);

      const user = db.findUserById(userId);
      if (user) {
        console.log(`Пользователь ${user.username} отключен`);
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log('🚀 Redskord Messenger Server запущен!');
  console.log(`📍 Локальный адрес: http://localhost:${PORT}`);
  console.log(`🌐 Локальная сеть: http://${HOST}:${PORT}`);
  console.log(`👥 Максимум онлайн: ${MAX_ONLINE_USERS} пользователей`);
  console.log('========================================');
  console.log('\n📡 Получение публичного IP адреса...\n');
  
  // Попытка автоматической настройки UPnP
  if (upnpClient) {
    console.log('🔄 Попытка автоматической настройки порта через UPnP...');
    upnpClient.portMapping({
      public: PORT,
      private: PORT,
      ttl: 3600,
      description: 'Redskord Messenger'
    }, (err) => {
      if (err) {
        console.log('⚠️  UPnP не поддерживается или отключен на роутере');
        console.log('   Используйте альтернативные методы ниже\n');
      } else {
        console.log('✅ Порт автоматически открыт через UPnP!');
        console.log('   Настройка роутера не требуется\n');
      }
    });
  }
  
  // Получаем публичный IP
  getPublicIP((publicIP) => {
    if (publicIP) {
      PUBLIC_IP = publicIP;
      console.log('✅ Публичный IP адрес получен!');
      console.log('========================================');
      console.log('🌍 ДОСТУП ИЗ ИНТЕРНЕТА:');
      console.log(`   http://${publicIP}:${PORT}`);
      console.log('========================================');
      console.log('\n📋 СПОСОБЫ ПОДКЛЮЧЕНИЯ:\n');
      
      console.log('🚀 МЕТОД 1: БЕЗ НАСТРОЙКИ РОУТЕРА (рекомендуется)');
      console.log('   Если не можете зайти в роутер:');
      console.log('   1. Запустите: start-with-ngrok.bat');
      console.log('      Или: start-with-cloudflare.bat');
      console.log('   2. Скопируйте предоставленный адрес');
      console.log('   3. Поделитесь с друзьями\n');
      
      console.log('🔧 МЕТОД 2: С НАСТРОЙКОЙ РОУТЕРА');
      console.log('   1. Настройте Port Forwarding на роутере:');
      console.log(`      - Порт: ${PORT} (TCP)`);
      console.log(`      - Внутренний IP: ${HOST}`);
      console.log('      - Найдите адрес роутера: find-router.bat');
      console.log('   2. Откройте порт в файрволе Windows:');
      console.log('      Запустите: setup-firewall.bat (от имени администратора)');
      console.log('   3. Поделитесь адресом с друзьями:');
      console.log(`      http://${publicIP}:${PORT}\n`);
      
      console.log('💡 Если UPnP настроен автоматически, используйте адрес выше');
      console.log('📖 Подробная инструкция: setup-external-access.md');
    } else {
      console.log('⚠️  Не удалось получить публичный IP автоматически');
      console.log('   Вы можете узнать его на сайте: https://whatismyipaddress.com/');
      console.log('\n💡 Рекомендуется использовать: start-with-ngrok.bat');
    }
    
    console.log('\n💡 ЛОКАЛЬНАЯ СЕТЬ:');
    console.log(`   Другие пользователи в вашей сети: http://${HOST}:${PORT}`);
    console.log('\nДля остановки нажмите Ctrl+C\n');
  });
});

// Очистка при завершении работы
process.on('SIGINT', () => {
  console.log('\n\n🛑 Остановка сервера...');
  
  // Удаляем UPnP проброс порта
  if (upnpClient) {
    upnpClient.portUnmapping({ public: PORT }, () => {
      console.log('✅ UPnP порт закрыт');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

process.on('SIGTERM', () => {
  if (upnpClient) {
    upnpClient.portUnmapping({ public: PORT }, () => {
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});
