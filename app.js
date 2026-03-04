// ================== IMPORTS ===================
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const methodOverride = require('method-override');
const cookieParser = require('cookie-parser');
const expressLayouts = require('express-ejs-layouts');
const morgan = require('morgan');
const redis = require('redis');

// ================== CONFIG ==================
dotenv.config();

const app = express();
app.set('trust proxy', 1);
const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.JEST_WORKER_ID);

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ================== MONGODB ==================
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!mongoUri) {
  console.error('❌ MongoDB URI missing. Set MONGODB_URI or MONGO_URI in .env');
  process.exit(1);
}

if (!isTestEnv) {
  mongoose
    .connect(mongoUri)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => {
      console.error('❌ MongoDB Error:', err);
      process.exit(1);
    });
}

// ================== REDIS ==================
const redisUrl = process.env.REDIS_URL;
let redisReady = false;
let publisher = null;
let subscriber = null;
let cacheClient = null;
const subscribedRooms = new Set();

if (!isTestEnv && redisUrl) {
  publisher = redis.createClient({ url: redisUrl });
  subscriber = redis.createClient({ url: redisUrl });
  cacheClient = redis.createClient({ url: redisUrl });

  publisher.on('error', err => console.error('❌ Redis Publisher Error:', err.message));
  subscriber.on('error', err => console.error('❌ Redis Subscriber Error:', err.message));
  cacheClient.on('error', err => console.error('❌ Redis Cache Error:', err.message));

  (async () => {
    try {
      await publisher.connect();
      await subscriber.connect();
      await cacheClient.connect();
      redisReady = true;
      console.log('✅ Redis Connected');
    } catch (err) {
      redisReady = false;
      console.error('⚠️ Redis unavailable, continuing without Redis:', err.message);
    }
  })();
} else if (!isTestEnv) {
  console.log('ℹ️ REDIS_URL not set. Running without Redis.');
}

async function redisGet(key) {
  if (!redisReady || !cacheClient?.isOpen) return null;
  try {
    return await cacheClient.get(key);
  } catch (err) {
    console.error('⚠️ Redis get failed:', err.message);
    return null;
  }
}

async function redisSetEx(key, ttlSeconds, value) {
  if (!redisReady || !cacheClient?.isOpen) return;
  try {
    await cacheClient.setEx(key, ttlSeconds, value);
  } catch (err) {
    console.error('⚠️ Redis setEx failed:', err.message);
  }
}

async function redisDel(key) {
  if (!redisReady || !cacheClient?.isOpen) return;
  try {
    await cacheClient.del(key);
  } catch (err) {
    console.error('⚠️ Redis del failed:', err.message);
  }
}

async function subscribeRoom(room, onMessage) {
  if (!redisReady || !subscriber?.isOpen || subscribedRooms.has(room)) return;
  try {
    await subscriber.subscribe(room, onMessage);
    subscribedRooms.add(room);
  } catch (err) {
    console.error('⚠️ Redis subscribe failed:', err.message);
  }
}

async function unsubscribeRoom(room) {
  if (!redisReady || !subscriber?.isOpen || !subscribedRooms.has(room)) return;
  try {
    await subscriber.unsubscribe(room);
    subscribedRooms.delete(room);
  } catch (err) {
    console.error('⚠️ Redis unsubscribe failed:', err.message);
  }
}

async function publishRoom(room, payload) {
  if (redisReady && publisher?.isOpen) {
    try {
      await publisher.publish(room, payload);
      return;
    } catch (err) {
      console.error('⚠️ Redis publish failed, using local broadcast:', err.message);
    }
  }

  broadcast(room, payload);
}

// ================== MIDDLEWARE ==================
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ================== EJS ==================
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main');

// ================== MODELS ==================
const User = require('./models/User');
const Carpool = require('./models/Carpool');
const Chat = require('./models/Chat');
const { auth } = require('./middleware/auth');

// ================== GLOBAL AUTH ==================
app.use((req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    req.user = null;
    res.locals.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    res.locals.user = decoded;
  } catch {
    req.user = null;
    res.locals.user = null;
  }
  next();
});

// ================== ROUTES ==================

// HOME

// ================== ADMIN ==================
app.get('/admin/manage-offers', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).send('Forbidden');
  }

  const carpools = await Carpool.find().populate('userId', 'name email');
  res.render('admin/manage-offers', {
    title: 'Manage Offers',
    carpools,
  });
});

app.get('/admin/manage-users', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).send('Forbidden');
  }

  const users = await User.find();
  res.render('admin/manage-users', {
    title: 'Manage Users',
    users,
  });
});

app.delete('/admin/offers/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).send('Forbidden');
  }

  await Carpool.findByIdAndDelete(req.params.id);
  res.redirect('/admin/manage-offers');
});





app.get('/', async (req, res) => {
  try {
    if (!req.user) {
      return res.render('home', { title: 'Welcome', carpools: [] });
    }

    const cached = await redisGet('carpools:list');
    if (cached) {
      return res.render('home', {
        title: 'Dashboard',
        carpools: JSON.parse(cached),
      });
    }

    const carpools = await Carpool.find()
      .sort({ createdAt: -1 })
      .populate('userId', 'name email')
      .populate('bookedBy.user', 'name');

    await redisSetEx('carpools:list', 30, JSON.stringify(carpools));
    res.render('home', { title: 'Dashboard', carpools });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// ================== AUTH ==================
app.get('/auth/login-register', (req, res) => {
  res.render('auth/login-register', {
    title: 'Login / Register',
    error: null,
    message: null,
  });
});

app.get('/login', (req, res) => {
  res.redirect('/auth/login-register');
});

app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    await User.create({ name, email, password });

    res.render('auth/login-register', {
      title: 'Login / Register',
      message: 'Registration successful. Please log in.',
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.render('auth/login-register', {
      title: 'Login / Register',
      error: 'User already exists.',
      message: null,
    });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await user.comparePassword(password))) {
      return res.render('auth/login-register', {
        title: 'Login / Register',
        error: 'Invalid credentials.',
        message: null,
      });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        name: user.name,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
    });

    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('auth/login-register', {
      title: 'Login / Register',
      error: 'Server error',
      message: null,
    });
  }
});

app.get('/logout', (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie('token', {
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  });
  res.redirect('/auth/login-register');
});

// ================== CARPOOL ==================
app.get('/carpools/new', auth, (req, res) => {
  res.render('user/create-offer', { title: 'Create Offer' });
});

app.post('/carpools', auth, async (req, res) => {
  try {
    const { carName, location, time, price, gender, totalSeats } = req.body;

    const rideTime = new Date(time);
    if (rideTime <= new Date()) {
      return res.status(400).send('Ride time must be in future');
    }

    await Carpool.create({
      userId: req.user.id,
      carName,
      location,
      time,
      price,
      gender,
      totalSeats,
      bookedSeats: 0,
      bookedBy: [],
    });

    await redisDel('carpools:list');
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to create carpool');
  }
});

app.post('/carpools/:id/book', auth, async (req, res) => {
  try {
    const seats = Number.parseInt(req.body.seats, 10);

    if (!Number.isInteger(seats) || seats < 1) {
      return res.status(400).send('Invalid seats value');
    }

    const carpool = await Carpool.findById(req.params.id).select('userId time');

    if (!carpool) return res.status(404).send('Carpool not found');
    if (carpool.userId.equals(req.user.id)) {
      return res.status(400).send('You cannot book your own offer.');
    }
    if (new Date(carpool.time) < new Date(Date.now() - 60_000)) {
      return res.status(400).send('Cannot book expired ride');
    }

    const updated = await Carpool.findOneAndUpdate(
      {
        _id: req.params.id,
        $expr: {
          $lte: [{ $add: ['$bookedSeats', seats] }, '$totalSeats'],
        },
      },
      {
        $inc: { bookedSeats: seats },
        $push: { bookedBy: { user: req.user.id, seats } },
      }
    );

    if (!updated) {
      const latest = await Carpool.findById(req.params.id).select('bookedSeats totalSeats');
      const availableSeats = Math.max((latest?.totalSeats || 0) - (latest?.bookedSeats || 0), 0);
      return res.status(400).send(`Only ${availableSeats} seat(s) available.`);
    }

    await redisDel('carpools:list');
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Booking failed');
  }
});

app.post('/carpools/:id/cancel', auth, async (req, res) => {
  try {
    const carpool = await Carpool.findById(req.params.id);
    if (!carpool) return res.redirect('/');

    const booking = carpool.bookedBy.find(
      b => String(b.user) === String(req.user.id)
    );
    if (!booking) return res.redirect('/');

    await Carpool.findByIdAndUpdate(req.params.id, {
      $inc: { bookedSeats: -booking.seats },
      $pull: { bookedBy: { user: req.user.id } },
    });

    await redisDel('carpools:list');
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Cancel booking failed');
  }
});

// ================== CHAT ==================
app.get('/chat/:carpoolId', auth, async (req, res) => {
  const messages = await Chat.find({
    carpoolId: req.params.carpoolId,
  }).populate('sender', 'name');

  res.render('chat/chat', {
    title: 'Chat',
    carpoolId: req.params.carpoolId,
    messages,
  });
});

// ================== WEBSOCKET ==================
const localConnections = new Map();

function broadcast(room, msg) {
  if (!localConnections.has(room)) return;
  for (const ws of localConnections.get(room)) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

wss.on('connection', ws => {
  console.log('🔌 WebSocket client connected');
  ws.room = null;
  ws.userId = null;

  ws.on('message', async raw => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    if (!data || typeof data !== 'object' || !data.type) return;

    if (data.type === 'join') {
      if (!data.carpoolId || !mongoose.Types.ObjectId.isValid(data.carpoolId)) return;
      if (!data.userId || !mongoose.Types.ObjectId.isValid(data.userId)) return;

      ws.room = data.carpoolId;
      ws.userId = data.userId;

      if (!localConnections.has(ws.room)) {
        localConnections.set(ws.room, new Set());
        await subscribeRoom(ws.room, msg => broadcast(ws.room, msg));
      }
      localConnections.get(ws.room).add(ws);
      return;
    }

    if (data.type === 'chat') {
      if (!ws.room || !ws.userId) return;
      if (!data.message || typeof data.message !== 'string' || !data.message.trim()) return;

      await Chat.create({
        carpoolId: ws.room,
        sender: ws.userId,
        message: data.message.trim(),
      });

      await publishRoom(
        ws.room,
        JSON.stringify({ name: data.name, message: data.message.trim() })
      );
    }
  });

  ws.on('close', async () => {
    if (!ws.room) return;
    localConnections.get(ws.room)?.delete(ws);
    if (localConnections.get(ws.room)?.size === 0) {
      await unsubscribeRoom(ws.room);
      localConnections.delete(ws.room);
    }
  });
});

// ================== SERVER ==================
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  server.listen(PORT, () =>
    console.log(`🚀 Server running on port ${PORT}`)
  );
}

module.exports = { app, server };
