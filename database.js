const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(__dirname, '../data');
const usersFile = path.join(dataDir, 'users.json');
const messagesFile = path.join(dataDir, 'messages.json');

// Создаем директорию данных если её нет
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Инициализация файлов если их нет
if (!fs.existsSync(usersFile)) {
  fs.writeFileSync(usersFile, JSON.stringify([], null, 2));
}

if (!fs.existsSync(messagesFile)) {
  fs.writeFileSync(messagesFile, JSON.stringify({}, null, 2));
}

// Чтение пользователей
function getUsers() {
  try {
    const data = fs.readFileSync(usersFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

// Сохранение пользователей
function saveUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

// Поиск пользователя по имени
function findUserByUsername(username) {
  const users = getUsers();
  return users.find(u => u.username.toLowerCase() === username.toLowerCase());
}

// Поиск пользователя по ID
function findUserById(userId) {
  const users = getUsers();
  return users.find(u => u.id === userId);
}

// Регистрация нового пользователя
function registerUser(username, password, email) {
  const users = getUsers();
  
  // Проверка на существование
  if (findUserByUsername(username)) {
    return { success: false, error: 'Пользователь с таким именем уже существует' };
  }

  const userId = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  
  const newUser = {
    id: userId,
    username,
    email: email || '',
    passwordHash,
    friends: [],
    friendRequests: [],
    createdAt: new Date().toISOString(),
    status: 'offline',
    avatar: null
  };

  users.push(newUser);
  saveUsers(users);
  
  return { success: true, user: { id: newUser.id, username: newUser.username, email: newUser.email } };
}

// Авторизация пользователя
function loginUser(username, password) {
  const user = findUserByUsername(username);
  if (!user) {
    return { success: false, error: 'Пользователь не найден' };
  }

  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  if (user.passwordHash !== passwordHash) {
    return { success: false, error: 'Неверный пароль' };
  }

  return { success: true, user: { id: user.id, username: user.username, email: user.email, friends: user.friends } };
}

// Обновление статуса пользователя
function updateUserStatus(userId, status) {
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (user) {
    user.status = status;
    saveUsers(users);
  }
}

// Добавление запроса в друзья
function addFriendRequest(userId, friendId) {
  const users = getUsers();
  const friend = users.find(u => u.id === friendId);
  
  if (!friend) {
    return { success: false, error: 'Пользователь не найден' };
  }

  if (friend.friendRequests.includes(userId)) {
    return { success: false, error: 'Запрос уже отправлен' };
  }

  friend.friendRequests.push(userId);
  saveUsers(users);
  return { success: true };
}

// Принятие запроса в друзья
function acceptFriendRequest(userId, friendId) {
  const users = getUsers();
  const user = users.find(u => u.id === userId); // Тот, кто принимает
  const friend = users.find(u => u.id === friendId); // Тот, кто отправил заявку
  
  if (!user || !friend) {
    return { success: false, error: 'Пользователь не найден' };
  }

  // Проверяем, что friendId (отправитель заявки) есть в списке заявок пользователя
  if (!user.friendRequests || !user.friendRequests.includes(friendId)) {
    return { success: false, error: 'Запрос не найден' };
  }

  // Удаляем заявку из списков обоих пользователей
  user.friendRequests = (user.friendRequests || []).filter(id => id !== friendId);
  friend.friendRequests = (friend.friendRequests || []).filter(id => id !== userId);

  // Добавляем в друзья
  if (!user.friends) user.friends = [];
  if (!friend.friends) friend.friends = [];
  
  if (!user.friends.includes(friendId)) {
    user.friends.push(friendId);
  }
  if (!friend.friends.includes(userId)) {
    friend.friends.push(userId);
  }

  saveUsers(users);
  return { success: true };
}

// Удаление из друзей
function removeFriend(userId, friendId) {
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  const friend = users.find(u => u.id === friendId);
  
  if (user && friend) {
    user.friends = user.friends.filter(id => id !== friendId);
    friend.friends = friend.friends.filter(id => id !== userId);
    saveUsers(users);
    return { success: true };
  }
  return { success: false };
}

// Получение друзей
function getFriends(userId) {
  const user = findUserById(userId);
  if (!user) return [];
  
  const users = getUsers();
  return user.friends.map(friendId => {
    const friend = users.find(u => u.id === friendId);
    return friend ? { id: friend.id, username: friend.username, status: friend.status, avatar: friend.avatar } : null;
  }).filter(f => f !== null);
}

// Сохранение личного сообщения
function savePrivateMessage(fromUserId, toUserId, text, voiceMessage = null, voiceDuration = null) {
  const messages = getMessages();
  const key = [fromUserId, toUserId].sort().join('_');
  
  if (!messages[key]) {
    messages[key] = [];
  }
  
  const message = {
    id: crypto.randomBytes(16).toString('hex'),
    fromUserId,
    toUserId,
    text,
    voiceMessage,
    voiceDuration,
    timestamp: new Date().toISOString()
  };
  
  messages[key].push(message);
  saveMessages(messages);
  return message;
}

// Получение сообщений между пользователями
function getPrivateMessages(userId1, userId2) {
  const messages = getMessages();
  const key = [userId1, userId2].sort().join('_');
  return messages[key] || [];
}

// Чтение сообщений
function getMessages() {
  try {
    const data = fs.readFileSync(messagesFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

// Сохранение сообщений
function saveMessages(messages) {
  fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2));
}

// Поиск пользователей по имени
function searchUsers(query, excludeUserId) {
  const users = getUsers();
  return users
    .filter(u => 
      u.id !== excludeUserId &&
      u.username.toLowerCase().includes(query.toLowerCase())
    )
    .map(u => ({ id: u.id, username: u.username, status: u.status, avatar: u.avatar }))
    .slice(0, 10); // Ограничиваем 10 результатами
}

module.exports = {
  registerUser,
  loginUser,
  findUserByUsername,
  findUserById,
  updateUserStatus,
  addFriendRequest,
  acceptFriendRequest,
  removeFriend,
  getFriends,
  savePrivateMessage,
  getPrivateMessages,
  searchUsers,
  getUsers,
  saveUsers
};

